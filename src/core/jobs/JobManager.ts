import { EngineRegistry } from "../engines/EngineRegistry";
import type { ConversionEstimate,EngineConvertResult } from "../engines/Engine";
import { FormatRegistry } from "../formats/FormatRegistry";
import { inspectFile } from "../inspection/inspectFile";
import { requiresFeatureCompleteImageEngine } from "../image/routePolicy";
import { ConversionPlanner } from "../planner/ConversionPlanner";
import type { ConversionEdge } from "../planner/ConversionGraph";
import { NetworkGuard } from "../security/NetworkGuard";
import { assertSafeImageDimensions } from "../security/ResourceLimits";
import { memoryPreflight } from "../performance/Budget";
import { getDeviceProfile } from "../performance/DeviceProfile";
import { estimateRouteResources } from "../performance/LargeFilePolicy";
import { storagePreflight } from "../storage/StorageEstimator";
import { TempWorkspace } from "../storage/TempWorkspace";
import type { OutputValidator } from "../validation/Validator";
import type { ConversionOutput, JobSnapshot, JobState } from "./types";

function extensionFor(registry:FormatRegistry,formatId:string):string {
  return registry.get(formatId)?.extensions[0]??"bin";
}
function outputName(input:string,extension:string):string {
  const index=input.lastIndexOf(".");
  const stem=index>0?input.slice(0,index):input;
  return stem+"-converted."+extension;
}

export class JobManager {
  private controllers=new Map<string,AbortController>();
  private retainedWorkspaces=new Map<string,TempWorkspace>();
  private lifecycleEpoch=0;
  private readonly networkGuard=new NetworkGuard();

  constructor(
    private readonly formats:FormatRegistry,
    private readonly engines:EngineRegistry,
    private readonly planner:ConversionPlanner,
    private readonly validator:OutputValidator
  ) {}

  cancel(jobId:string):void { this.controllers.get(jobId)?.abort(); }
  cancelAll():void { for(const controller of this.controllers.values()) controller.abort(); }

  activeJobCount():number { return this.controllers.size; }
  retainedWorkspaceCount():number { return this.retainedWorkspaces.size; }

  async releaseRetained():Promise<void>{
    const retained=[...this.retainedWorkspaces.values()];
    this.retainedWorkspaces.clear();
    await Promise.allSettled(retained.map(workspace=>workspace.cleanup()));
  }

  dispose():void{
    this.lifecycleEpoch++;
    this.cancelAll();
    void this.releaseRetained();
  }

  private emit(
    callback:((snapshot:JobSnapshot)=>void)|undefined,
    id:string,state:JobState,progress:number,stage:string
  ){
    callback?.({id,state,progress,stage});
  }

  async convert(
    source:File,targetFormatId:string,quality:number,
    options:Record<string,unknown>={},
    onUpdate?:(snapshot:JobSnapshot)=>void
  ):Promise<ConversionOutput>{
    const id=crypto.randomUUID();
    const lifecycleEpoch=this.lifecycleEpoch;
    const controller=new AbortController();
    this.controllers.set(id,controller);
    let workspace:TempWorkspace|null=null;
    let keepWorkspace=false;
    const warnings:string[]=[];

    try{
      this.emit(onUpdate,id,"INSPECTING",0.03,"Inspecting source");
      const inspection=await inspectFile(source,this.formats);
      const sourceFormat=inspection.detection.format;
      if(!sourceFormat) throw new Error("FORMAT_UNKNOWN: File format could not be identified.");
      if(sourceFormat.category==="image") assertSafeImageDimensions(inspection.width,inspection.height);
      const sourceImageTraits=inspection.imageTraitsKnown==null
        ?undefined
        :{
          metadata:Boolean(inspection.imageMetadata),
          animation:Boolean(inspection.imageAnimation),
          known:Boolean(inspection.imageTraitsKnown)
        };

      this.emit(onUpdate,id,"PLANNING",0.08,"Planning safest local route");
      const routePreference=options.routePreference==="semantic"||options.routePreference==="fidelity"
        ? options.routePreference
        : undefined;
      let route=this.planner.plan(sourceFormat.id,targetFormatId,routePreference);
      if(
        sourceFormat.category==="image"
        &&requiresFeatureCompleteImageEngine(sourceFormat.id,targetFormatId,options,sourceImageTraits)
        &&route.edges.some(edge=>edge.engineId==="browser-image-proof")
      ){
        const featureComplete=this.planner.directAlternatives(
          sourceFormat.id,targetFormatId,routePreference
        ).find(candidate=>candidate.edges[0]?.engineId==="vips-image");
        if(!featureComplete){
          throw new Error(
            "IMAGE_ENGINE_UNAVAILABLE: The selected image options require the feature-complete local image engine."
          );
        }
        route=featureComplete;
      }
      warnings.push(...route.warnings.map(w=>w.message));
      const target=this.formats.get(targetFormatId);
      if(!target) throw new Error("FORMAT_UNSUPPORTED: Target format is unknown.");

      const estimates:ConversionEstimate[]=[];
      for(const edge of route.edges){
        const engine=this.engines.get(edge.engineId);
        if(!engine) throw new Error("ENGINE_UNAVAILABLE: "+edge.engineId);
        estimates.push(await engine.estimate(source,edge.from,edge.to));
      }

      const profile=getDeviceProfile();
      const resources=estimateRouteResources(source.size,route.edges,estimates,profile);
      const memory=memoryPreflight(resources.memoryBytes,profile);
      if(!memory.safe){
        throw new Error(
          "MEMORY_BUDGET_EXCEEDED: This route needs about "
          +Math.ceil(memory.required/(1024*1024))+" MiB of guarded working memory, above this device's "
          +Math.floor(memory.budget/(1024*1024))+" MiB budget. Use a streaming route, a smaller file, or a lower-memory option."
        );
      }

      if(profile.opfs){
        const storage=await storagePreflight(resources.workspaceBytes,profile.storageReserveBytes);
        if(!storage.safe){
          throw new Error(
            "STORAGE_INSUFFICIENT: The browser cannot reserve enough local workspace while keeping "
            +Math.ceil(profile.storageReserveBytes/(1024*1024))+" MiB free."
          );
        }
      }else if(resources.largeFileMode&&resources.streamingOutput){
        warnings.push("OPFS is unavailable, so this browser cannot use the route's file-backed streaming output path.");
      }
      if(resources.largeFileMode){
        warnings.push(
          resources.streamingInput
            ?"Large-file mode: source access stays streaming/lazy where the selected engines support it."
            :"Large-file mode: this route is memory-backed and is guarded by the device working-set budget."
        );
      }

      workspace=await TempWorkspace.create(id);
      const networkSnapshot=this.networkGuard.snapshot();
      let current:Blob=source;
      let finalInWorkspace=false;
      let extraFiles:Array<{name:string;blob:Blob}>|undefined;
      const attemptedEngines=new Set<string>();

      const runEdge=async(
        edge:ConversionEdge,
        index:number,
        input:Blob,
        recovery=false
      )=>{
        const engine=this.engines.get(edge.engineId);
        const edgeTarget=this.formats.get(edge.to);
        if(!engine||!edgeTarget) throw new Error("ENGINE_UNAVAILABLE: Planned engine is missing.");
        attemptedEngines.add(edge.engineId);

        const isLast=index===route.edges.length-1;
        const outputHandle=isLast&&workspace
          ?await workspace.getFileHandle("engine-output."+extensionFor(this.formats,edge.to))
          :undefined;

        return engine.convert({
          jobId:id,
          source:input,
          sourceFormatId:edge.from,
          targetFormatId:edge.to,
          targetMime:edgeTarget.mimeTypes[0]??"application/octet-stream",
          quality,
          options,
          outputHandle,
          signal:controller.signal,
          onProgress:(progress,stage)=>{
            const base=index/route.edges.length;
            const scaled=(base+progress/route.edges.length)*0.75+0.15;
            this.emit(
              onUpdate,id,"RUNNING",Math.min(0.9,scaled),
              recovery?"Recovery · "+stage:stage
            );
          }
        });
      };

      const findDirectRecovery=async(reference:ConversionEdge)=>{
        if(route.edges.length!==1) return null;
        const mode=reference.mode??"neutral";
        const alternatives=this.planner.directAlternatives(
          sourceFormat.id,targetFormatId,routePreference
        );
        for(const candidate of alternatives){
          const edge=candidate.edges[0];
          if(!edge||attemptedEngines.has(edge.engineId)||(edge.mode??"neutral")!==mode) continue;
          if(
            sourceFormat.category==="image"
            &&edge.engineId==="browser-image-proof"
            &&requiresFeatureCompleteImageEngine(sourceFormat.id,targetFormatId,options,sourceImageTraits)
          ) continue;
          const engine=this.engines.get(edge.engineId);
          if(!engine) continue;

          const estimate=await engine.estimate(source,edge.from,edge.to);
          const recoveryResources=estimateRouteResources(source.size,[edge],[estimate],profile);
          const recoveryMemory=memoryPreflight(recoveryResources.memoryBytes,profile);
          if(!recoveryMemory.safe) continue;
          if(profile.opfs){
            const recoveryStorage=await storagePreflight(
              recoveryResources.workspaceBytes,profile.storageReserveBytes
            );
            if(!recoveryStorage.safe) continue;
          }
          return candidate;
        }
        return null;
      };

      this.emit(onUpdate,id,"PREPARING",0.12,"Preparing local conversion engine");
      let lastEdge:ConversionEdge|null=null;
      for(let index=0;index<route.edges.length;index++){
        const edge=route.edges[index];
        const isLast=index===route.edges.length-1;
        let usedEdge=edge;
        let result:EngineConvertResult;
        try{
          result=await runEdge(edge,index,current);
        }catch(error){
          const cancelled=controller.signal.aborted||(error instanceof DOMException&&error.name==="AbortError");
          if(cancelled) throw error;
          const recovery=await findDirectRecovery(edge);
          if(!recovery) throw error;
          usedEdge=recovery.edges[0];
          warnings.push(...recovery.warnings.map(w=>w.message));
          warnings.push("The primary local engine failed, so the conversion recovered with an alternate certified local engine.");
          this.emit(onUpdate,id,"PREPARING",0.16,"Recovering with alternate local engine");
          result=await runEdge(usedEdge,index,current,true);
        }

        lastEdge=usedEdge;
        current=result.blob;
        finalInWorkspace=isLast&&Boolean(result.outputInWorkspace);
        if(result.warnings) warnings.push(...result.warnings);
        if(isLast&&result.extraFiles?.length) extraFiles=result.extraFiles;
      }

      this.emit(onUpdate,id,"VALIDATING",0.92,"Validating output");
      let validation=await this.validator.validate(current,targetFormatId,options);
      if(!validation.valid&&lastEdge){
        const recovery=await findDirectRecovery(lastEdge);
        if(recovery){
          const recoveryEdge=recovery.edges[0];
          warnings.push(...recovery.warnings.map(w=>w.message));
          warnings.push("The first output failed independent validation, so an alternate certified local engine was used.");
          this.emit(onUpdate,id,"PREPARING",0.9,"Retrying with alternate local engine");
          const result=await runEdge(recoveryEdge,0,source,true);
          lastEdge=recoveryEdge;
          current=result.blob;
          finalInWorkspace=Boolean(result.outputInWorkspace);
          extraFiles=result.extraFiles?.length?result.extraFiles:undefined;
          if(result.warnings) warnings.push(...result.warnings);
          this.emit(onUpdate,id,"VALIDATING",0.94,"Validating recovered output");
          validation=await this.validator.validate(current,targetFormatId,options);
        }
      }
      if(!validation.valid) throw new Error("OUTPUT_INVALID: "+validation.errors.join(" "));

      if(workspace&&!finalInWorkspace){
        const name="final-output."+extensionFor(this.formats,targetFormatId);
        await workspace.writeBlob(name,current);
        current=await workspace.readBlob(name);
        finalInWorkspace=true;
      }

      const external=this.networkGuard.externalRequestsSince(networkSnapshot);
      if(external.length){
        throw new Error("NETWORK_PRIVACY_VIOLATION: External network activity was detected during conversion.");
      }

      this.emit(onUpdate,id,"FINALIZING",0.97,"Finalizing local output");
      if(lifecycleEpoch!==this.lifecycleEpoch){
        throw new DOMException("Conversion result was invalidated by lifecycle disposal.","AbortError");
      }
      const fileName=outputName(source.name,extensionFor(this.formats,targetFormatId));
      this.emit(onUpdate,id,"COMPLETED",1,"Complete");

      keepWorkspace=Boolean(workspace&&finalInWorkspace);
      const retainedWorkspace=keepWorkspace?workspace:null;
      if(retainedWorkspace) this.retainedWorkspaces.set(id,retainedWorkspace);
      let released=false;
      return {
        blob:current,
        fileName,
        formatId:targetFormatId,
        jobId:id,
        warnings:[...new Set(warnings)],
        extraFiles,
        release:retainedWorkspace
          ? async()=>{
            if(released) return;
            released=true;
            if(this.retainedWorkspaces.get(id)===retainedWorkspace){
              this.retainedWorkspaces.delete(id);
            }
            await retainedWorkspace.cleanup();
          }
          : undefined
      };
    }catch(error){
      const cancelled=controller.signal.aborted||(error instanceof DOMException&&error.name==="AbortError");
      this.emit(onUpdate,id,cancelled?"CANCELLED":"FAILED",1,cancelled?"Cancelled":"Failed");
      throw error;
    }finally{
      this.controllers.delete(id);
      if(workspace&&!keepWorkspace) await workspace.cleanup();
    }
  }
}
