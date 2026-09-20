import type { ConversionEngine, ConversionEstimate, EngineConvertRequest, EngineConvertResult } from "../../core/engines/Engine";
import type { DetailedMediaInspection, MediaConversionOptions } from "../../core/media/types";
import type { MediaPlan, MediaWorkerRequest, MediaWorkerResponse } from "./protocol";

const INPUTS=new Set(["mp4","mov","webm-media","mkv","ogg","mp3","wav","flac","aac","mpegts"]);
const OUTPUTS=new Set(["mp4","mov","webm-media","mkv","ogg","mp3","wav","flac","aac","mpegts"]);

function defaults():MediaConversionOptions {
  return {
    tracks:"all",
    metadataPolicy:"preserve",
    hardwareAcceleration:"prefer-hardware"
  };
}

export class MediaEngine implements ConversionEngine {
  readonly id="mediabunny";
  readonly version="mediabunny-1.58.0";
  private worker:Worker|null=null;
  private pending=new Map<string,{
    resolve:(value:any)=>void;
    reject:(error:Error)=>void;
    onProgress?:(progress:number,stage:string)=>void;
  }>();

  async prepare():Promise<void> {}

  isAvailable():boolean {
    return typeof Worker!=="undefined" && typeof WebAssembly!=="undefined";
  }

  canConvert(from:string,to:string):boolean {
    return INPUTS.has(from)&&OUTPUTS.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate> {
    return {
      temporaryBytes:Math.max(96*1024*1024,Math.ceil(source.size*1.35)),
      outputBytes:source.size,
      notes:["Mediabunny reads the source lazily and streams output to OPFS when an output handle is available."]
    };
  }

  async inspect(source:Blob):Promise<DetailedMediaInspection> {
    const requestId=crypto.randomUUID();
    return this.request({type:"inspect",requestId,source}) as Promise<DetailedMediaInspection>;
  }

  async plan(source:Blob,targetFormatId:string,options:Partial<MediaConversionOptions>={}):Promise<MediaPlan> {
    const requestId=crypto.randomUUID();
    return this.request({
      type:"plan",requestId,source,targetFormatId,options:{...defaults(),...options}
    }) as Promise<MediaPlan>;
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult> {
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("MEDIA_ROUTE_UNSUPPORTED: Mediabunny does not support this container route.");
    }
    const requestId=crypto.randomUUID();
    const options={...defaults(),...(request.options??{})} as MediaConversionOptions;

    const abort=()=>{
      this.getWorker().postMessage({type:"cancel",requestId:crypto.randomUUID(),jobId:request.jobId} satisfies MediaWorkerRequest);
    };
    request.signal.addEventListener("abort",abort,{once:true});
    try {
      return await this.request({
        type:"convert",
        requestId,
        jobId:request.jobId,
        source:request.source,
        targetFormatId:request.targetFormatId,
        options,
        outputHandle:request.outputHandle
      },request.onProgress) as EngineConvertResult;
    } finally {
      request.signal.removeEventListener("abort",abort);
    }
  }

  dispose():void { this.resetWorker(); }

  private getWorker():Worker {
    if(this.worker) return this.worker;
    const worker=new Worker(new URL("../../workers/media.worker.ts",import.meta.url),{type:"module"});
    worker.onmessage=(event:MessageEvent<MediaWorkerResponse>)=>{
      const message=event.data;
      const pending=this.pending.get(message.requestId);
      if(!pending) return;
      if(message.type==="progress"){
        pending.onProgress?.(message.progress,message.stage);
        return;
      }
      this.pending.delete(message.requestId);
      if(message.type==="error") pending.reject(new Error(message.code+": "+message.message));
      else if(message.type==="cancelled") pending.reject(new DOMException("Media conversion cancelled.","AbortError"));
      else if(message.type==="inspection") pending.resolve(message.inspection);
      else if(message.type==="plan") pending.resolve(message.plan);
      else pending.resolve({
        blob:message.blob,
        warnings:message.warnings,
        details:message.details,
        outputInWorkspace:message.outputInWorkspace
      });
    };
    worker.onerror=event=>{
      const error=new Error(event.message||"Media worker crashed.");
      for(const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.worker=null;
      worker.terminate();
    };
    this.worker=worker;
    return worker;
  }

  private request(request:MediaWorkerRequest,onProgress?:(progress:number,stage:string)=>void):Promise<unknown>{
    return new Promise((resolve,reject)=>{
      this.pending.set(request.requestId,{resolve,reject,onProgress});
      this.getWorker().postMessage(request);
    });
  }

  private resetWorker(){
    this.worker?.terminate();
    this.worker=null;
    const error=new DOMException("Media worker terminated.","AbortError");
    for(const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
