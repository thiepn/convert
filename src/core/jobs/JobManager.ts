import { EngineRegistry } from "../engines/EngineRegistry";
import { FormatRegistry } from "../formats/FormatRegistry";
import { inspectFile } from "../inspection/inspectFile";
import { ConversionPlanner } from "../planner/ConversionPlanner";
import { NetworkGuard } from "../security/NetworkGuard";
import { assertSafeImageDimensions } from "../security/ResourceLimits";
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
      const route=this.planner.plan(sourceFormat.id,targetFormatId);
      warnings.push(...route.warnings.map(w=>w.message));
      const target=this.formats.get(targetFormatId);
      if(!target) throw new Error("FORMAT_UNSUPPORTED: Target format is unknown.");

      let required=source.size+64*1024*1024;
      for(const edge of route.edges){
        const engine=this.engines.get(edge.engineId);
        if(!engine) throw new Error("ENGINE_UNAVAILABLE: "+edge.engineId);
        const estimate=await engine.estimate(source,edge.from,edge.to);
        required=Math.max(required,estimate.temporaryBytes);
      }

      const storage=await storagePreflight(required);
      if(!storage.safe){
        throw new Error("STORAGE_INSUFFICIENT: The browser does not have enough local workspace for this job.");
      }

      workspace=await TempWorkspace.create(id);
      const networkSnapshot=this.networkGuard.snapshot();
      let current:Blob=source;
      let finalInWorkspace=false;

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
      }

      if(workspace&&!finalInWorkspace){
        const name="final-output."+extensionFor(this.formats,targetFormatId);
        await workspace.writeBlob(name,current);
        current=await workspace.readBlob(name);
        finalInWorkspace=true;
      }

      this.emit(onUpdate,id,"VALIDATING",0.92,"Validating output");
      const validation=await this.validator.validate(current,targetFormatId);
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
