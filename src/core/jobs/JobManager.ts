import { EngineRegistry } from "../engines/EngineRegistry";
import type { ConversionEstimate } from "../engines/Engine";
import { FormatRegistry } from "../formats/FormatRegistry";
import { inspectFile } from "../inspection/inspectFile";
import { ConversionPlanner } from "../planner/ConversionPlanner";
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
  private readonly networkGuard=new NetworkGuard();

  constructor(
    private readonly formats:FormatRegistry,
    private readonly engines:EngineRegistry,
    private readonly planner:ConversionPlanner,
    private readonly validator:OutputValidator
  ) {}

  cancel(jobId:string):void { this.controllers.get(jobId)?.abort(); }
  cancelAll():void { for(const controller of this.controllers.values()) controller.abort(); }

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

      this.emit(onUpdate,id,"PLANNING",0.08,"Planning safest local route");
      const routePreference=options.routePreference==="semantic"||options.routePreference==="fidelity"
        ? options.routePreference
        : undefined;
      const route=this.planner.plan(sourceFormat.id,targetFormatId,routePreference);
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

      this.emit(onUpdate,id,"PREPARING",0.12,"Preparing local conversion engine");
      for(let index=0;index<route.edges.length;index++){
        const edge=route.edges[index];
        const engine=this.engines.get(edge.engineId);
        const edgeTarget=this.formats.get(edge.to);
        if(!engine||!edgeTarget) throw new Error("ENGINE_UNAVAILABLE: Planned engine is missing.");

        const isLast=index===route.edges.length-1;
        const outputHandle=isLast&&workspace
          ? await workspace.getFileHandle("engine-output."+extensionFor(this.formats,edge.to))
          : undefined;

        const result=await engine.convert({
          jobId:id,
          source:current,
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
            this.emit(onUpdate,id,"RUNNING",Math.min(0.9,scaled),stage);
          }
        });

        current=result.blob;
        finalInWorkspace=isLast&&Boolean(result.outputInWorkspace);
        if(result.warnings) warnings.push(...result.warnings);
        if(isLast&&result.extraFiles?.length) extraFiles=result.extraFiles;
      }

      if(workspace&&!finalInWorkspace){
        const name="final-output."+extensionFor(this.formats,targetFormatId);
        await workspace.writeBlob(name,current);
        current=await workspace.readBlob(name);
        finalInWorkspace=true;
      }

      this.emit(onUpdate,id,"VALIDATING",0.92,"Validating output");
      const validation=await this.validator.validate(current,targetFormatId,options);
      if(!validation.valid) throw new Error("OUTPUT_INVALID: "+validation.errors.join(" "));

      const external=this.networkGuard.externalRequestsSince(networkSnapshot);
      if(external.length){
        throw new Error("NETWORK_PRIVACY_VIOLATION: External network activity was detected during conversion.");
      }

      this.emit(onUpdate,id,"FINALIZING",0.97,"Finalizing local output");
      const fileName=outputName(source.name,extensionFor(this.formats,targetFormatId));
      this.emit(onUpdate,id,"COMPLETED",1,"Complete");

      keepWorkspace=Boolean(workspace&&finalInWorkspace);
      const retainedWorkspace=workspace;
      return {
        blob:current,
        fileName,
        formatId:targetFormatId,
        jobId:id,
        warnings:[...new Set(warnings)],
        extraFiles,
        release:retainedWorkspace
          ? async()=>{ await retainedWorkspace.cleanup(); }
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
