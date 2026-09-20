import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { findLargestEmbeddedJpeg } from "../../core/specialist/rawPreview";

export class RawPreviewEngine implements ConversionEngine{
  readonly id="raw-preview";
  readonly version="phase7-native-1";

  async prepare():Promise<void>{}
  isAvailable():boolean{return true;}
  canConvert(from:string,to:string):boolean{return from==="camera-raw"&&to==="jpeg";}

  async estimate(source:Blob):Promise<ConversionEstimate>{
    return {
      temporaryBytes:Math.max(32*1024*1024,source.size*2),
      outputBytes:null,
      notes:["Camera RAW support extracts the largest embedded JPEG preview; it does not demosaic sensor data."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("RAW_ROUTE_UNSUPPORTED: Camera RAW currently converts only to embedded JPEG preview.");
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    const limit=mobile?160*1024*1024:640*1024*1024;
    if(request.source.size>limit) throw new Error("RAW_SIZE_LIMIT: RAW file exceeds this device's guarded preview-extraction limit.");

    request.onProgress?.(.2,"Scanning RAW container for embedded preview");
    const source=new Uint8Array(await request.source.arrayBuffer());
    if(request.signal.aborted) throw new DOMException("RAW preview extraction cancelled.","AbortError");
    const preview=findLargestEmbeddedJpeg(source);
    if(!preview||preview.length<1024) throw new Error("RAW_PREVIEW_NOT_FOUND: No usable embedded JPEG preview was found. Full sensor demosaic is intentionally not claimed.");
    const copy=new Uint8Array(preview.length);copy.set(preview.bytes);
    request.onProgress?.(.9,"Validating embedded JPEG preview");
    return {
      blob:new Blob([copy.buffer],{type:"image/jpeg"}),
      warnings:["This is the camera-generated embedded JPEG preview, not a RAW sensor-data development. Exposure, white balance, demosaic, lens corrections, and full RAW dynamic range are not reprocessed."],
      details:{previewOffset:preview.offset,previewBytes:preview.length}
    };
  }

  dispose():void{}
}
