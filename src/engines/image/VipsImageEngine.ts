import type { ConversionEngine, ConversionEstimate, EngineConvertRequest, EngineConvertResult } from "../../core/engines/Engine";
import type { DetailedImageInspection, ImageConversionOptions } from "../../core/image/types";
import type { ImageWorkerRequest, ImageWorkerResponse } from "./protocol";
import { assertMemoryBackedSource } from "../../core/performance/Budget";
import { getDeviceProfile } from "../../core/performance/DeviceProfile";

const INPUTS = new Set(["jpeg","png","webp","gif","tiff","avif","heic","jxl","svg"]);
const OUTPUTS = new Set(["jpeg","png","webp","gif","tiff","avif","jxl"]);

function defaultOptions(): ImageConversionOptions {
  return {
    metadataPolicy:"preserve",
    background:"#ffffff",
    lossless:false,
    preserveAnimation:true
  };
}

export class VipsImageEngine implements ConversionEngine {
  readonly id = "vips-image";
  readonly version = "wasm-vips-0.0.18";
  private available = false;
  private assetBase = "";
  private worker: Worker | null = null;
  private jobs = 0;
  private pending = new Map<string, {
    resolve:(value:any)=>void;
    reject:(error:Error)=>void;
    onProgress?:(progress:number,stage:string)=>void;
  }>();

  async prepare(): Promise<void> {
    this.assetBase = new URL("engines/vips/", document.baseURI).href;
    this.available = Boolean(
      globalThis.crossOriginIsolated
      && typeof SharedArrayBuffer !== "undefined"
      && typeof Worker !== "undefined"
      && typeof WebAssembly !== "undefined"
    );
    // Keep the large WASM engine lazy. The first detailed inspection/conversion
    // initializes it inside the dedicated worker.
  }

  isAvailable(): boolean { return this.available; }

  canConvert(from:string,to:string):boolean {
    return INPUTS.has(from) && OUTPUTS.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate> {
    const profile=getDeviceProfile();
    const memoryBytes=Math.max(source.size*3,profile.tier==="constrained"?160*1024*1024:256*1024*1024);
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:Math.max(64*1024*1024,source.size*1.5),
      outputBytes:null,
      sourceAccess:"buffered",
      outputAccess:"buffered",
      notes:["libvips is demand-driven after decode, but the encoded source and encoded output cross the WASM worker as memory-backed buffers."]
    };
  }

  async inspect(source:Blob, sourceFormatId:string):Promise<DetailedImageInspection> {
    const requestId = crypto.randomUUID();
    return this.request({
      type:"inspect", requestId, source, sourceFormatId, assetBase:this.assetBase
    } as ImageWorkerRequest) as Promise<DetailedImageInspection>;
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult> {
    if (!this.isAvailable() || !this.canConvert(request.sourceFormatId, request.targetFormatId)) {
      throw new Error("IMAGE_ENGINE_UNAVAILABLE: The production image engine cannot perform this route.");
    }
    assertMemoryBackedSource(request.source.size,"libvips image conversion",3,512*1024*1024);
    const requestId = crypto.randomUUID();
    const options = { ...defaultOptions(), ...(request.options ?? {}) } as ImageConversionOptions;

    const abort = () => this.resetWorker();
    request.signal.addEventListener("abort", abort, { once:true });
    try {
      const result = await this.request({
        type:"convert",
        requestId,
        jobId:request.jobId,
        source:request.source,
        sourceFormatId:request.sourceFormatId,
        targetFormatId:request.targetFormatId,
        quality:request.quality ?? 0.82,
        options,
        assetBase:this.assetBase
      } as ImageWorkerRequest, request.onProgress);
      this.jobs += 1;
      if (this.jobs >= 10) {
        this.resetWorker();
        this.jobs = 0;
      }
      return result as EngineConvertResult;
    } finally {
      request.signal.removeEventListener("abort", abort);
    }
  }

  dispose():void { this.resetWorker(); }

  private async ping():Promise<void> {
    const requestId = crypto.randomUUID();
    await this.request({ type:"ping", requestId, assetBase:this.assetBase } as ImageWorkerRequest);
  }

  private getWorker():Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("../../workers/image-vips.worker.ts", import.meta.url), {type:"module"});
    worker.onmessage = (event:MessageEvent<ImageWorkerResponse>) => {
      const message = event.data;
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      if (message.type === "progress") {
        pending.onProgress?.(message.progress,message.stage);
        return;
      }
      this.pending.delete(message.requestId);
      if (message.type === "error") {
        pending.reject(new Error(message.code + ": " + message.message));
      } else if (message.type === "inspection") {
        pending.resolve(message.inspection);
      } else if (message.type === "result") {
        pending.resolve({blob:message.blob,width:message.width,height:message.height,warnings:message.warnings});
      } else {
        pending.resolve(undefined);
      }
    };
    worker.onerror = event => {
      const error = new Error(event.message || "Image worker crashed.");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.resetWorker();
    };
    this.worker = worker;
    return worker;
  }

  private request(request:ImageWorkerRequest,onProgress?:(progress:number,stage:string)=>void):Promise<unknown> {
    return new Promise((resolve,reject) => {
      this.pending.set(request.requestId,{resolve,reject,onProgress});
      this.getWorker().postMessage(request);
    });
  }

  private resetWorker() {
    this.worker?.terminate();
    this.worker = null;
    const error = new DOMException("Image worker was terminated.","AbortError");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
