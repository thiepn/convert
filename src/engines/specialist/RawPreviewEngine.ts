import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { findLargestEmbeddedJpegInBlob } from "../../core/specialist/rawPreview";
import { getDeviceProfile } from "../../core/performance/DeviceProfile";

export class RawPreviewEngine implements ConversionEngine{
  readonly id="raw-preview";
  readonly version="phase7-native-1";

  async prepare():Promise<void>{}
  isAvailable():boolean{return true;}
  canConvert(from:string,to:string):boolean{return from==="camera-raw"&&to==="jpeg";}

  async estimate(_source:Blob):Promise<ConversionEstimate>{
    const profile=getDeviceProfile();
    const memoryBytes=Math.max(24*1024*1024,profile.preferredChunkBytes*2);
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:128*1024*1024,
      outputBytes:null,
      sourceAccess:"streaming",
      outputAccess:"buffered",
      notes:["Camera RAW preview discovery scans bounded chunks and materializes only the selected embedded JPEG."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("RAW_ROUTE_UNSUPPORTED: Camera RAW currently converts only to embedded JPEG preview.");
    const profile=getDeviceProfile();
    request.onProgress?.(.12,"Scanning RAW container in bounded chunks");
    const preview=await findLargestEmbeddedJpegInBlob(
      request.source,
      profile.preferredChunkBytes,
      request.signal
    );
    if(!preview||preview.length<1024) throw new Error("RAW_PREVIEW_NOT_FOUND: No usable embedded JPEG preview was found. Full sensor demosaic is intentionally not claimed.");
    const previewLimit=Math.min(192*1024*1024,Math.floor(profile.workingSetBudgetBytes*.3));
    if(preview.length>previewLimit){
      throw new Error("RAW_PREVIEW_MEMORY_LIMIT: Embedded JPEG preview is too large for this device's guarded output buffer.");
    }
    request.onProgress?.(.9,"Slicing embedded JPEG preview");
    const blob=request.source.slice(preview.offset,preview.offset+preview.length,"image/jpeg");
    return {
      blob,
      warnings:["This is the camera-generated embedded JPEG preview, not a RAW sensor-data development. Exposure, white balance, demosaic, lens corrections, and full RAW dynamic range are not reprocessed."],
      details:{previewOffset:preview.offset,previewBytes:preview.length}
    };
  }

  dispose():void{}
}
