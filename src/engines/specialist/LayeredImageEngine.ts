import { readPsd } from "ag-psd";
import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { assertDecodedImageBudget,assertMemoryBackedSource } from "../../core/performance/Budget";
import { getDeviceProfile } from "../../core/performance/DeviceProfile";

const OUTPUTS=new Set(["png","jpeg","webp"]);
const MIME:Record<string,string>={png:"image/png",jpeg:"image/jpeg",webp:"image/webp"};

function countLayers(nodes:any[]|undefined):number{
  if(!nodes) return 0;
  let count=0;
  for(const node of nodes){
    count++;
    count+=countLayers(node.children);
  }
  return count;
}

async function canvasBlob(canvas:any,type:string,quality:number):Promise<Blob>{
  if(typeof canvas.convertToBlob==="function") return canvas.convertToBlob({type,quality});
  if(typeof canvas.toBlob==="function"){
    return new Promise((resolve,reject)=>canvas.toBlob((blob:Blob|null)=>blob?resolve(blob):reject(new Error("PSD_ENCODE_FAILED: Browser could not encode the flattened canvas.")),type,quality));
  }
  throw new Error("PSD_CANVAS_UNAVAILABLE: Composite PSD canvas cannot be encoded on this browser.");
}

export class LayeredImageEngine implements ConversionEngine{
  readonly id="psd-layered";
  readonly version="ag-psd-31.0.2";

  async prepare():Promise<void>{}
  isAvailable():boolean{return typeof document!=="undefined"&&typeof HTMLCanvasElement!=="undefined";}
  canConvert(from:string,to:string):boolean{return from==="psd"&&OUTPUTS.has(to);}

  async estimate(source:Blob):Promise<ConversionEstimate>{
    const memoryBytes=Math.max(192*1024*1024,source.size*6);
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:Math.max(64*1024*1024,source.size),
      outputBytes:null,
      sourceAccess:"buffered",
      outputAccess:"buffered",
      notes:["PSD decoding materializes the composite bitmap and document structure in browser memory."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("PSD_ROUTE_UNSUPPORTED: Phase 7 supports PSD flattening to PNG, JPEG, or WebP.");
    const profile=getDeviceProfile();
    assertMemoryBackedSource(request.source.size,"PSD flattening",6,320*1024*1024,profile);

    request.onProgress?.(.15,"Reading PSD structure and composite");
    const buffer=await request.source.arrayBuffer();
    if(request.signal.aborted) throw new DOMException("PSD conversion cancelled.","AbortError");

    if(buffer.byteLength<26) throw new Error("PSD_HEADER_INVALID: PSD header is truncated.");
    const header=new DataView(buffer,0,26);
    const headerHeight=header.getUint32(14,false);
    const headerWidth=header.getUint32(18,false);
    const channels=header.getUint16(12,false);
    const depth=header.getUint16(22,false);
    if(!headerWidth||!headerHeight) throw new Error("PSD_DIMENSION_LIMIT: PSD dimensions are invalid.");
    assertDecodedImageBudget(headerWidth,headerHeight,1,Math.max(4,channels*Math.max(1,depth/8)),profile);
    if(channels<1||channels>56||![1,8,16,32].includes(depth)){
      throw new Error("PSD_HEADER_INVALID: PSD channel count or bit depth is invalid.");
    }

    const psd=readPsd(buffer,{skipLayerImageData:true,skipThumbnail:true,throwForMissingFeatures:false} as any);
    const width=Number((psd as any).width??0),height=Number((psd as any).height??0);
    if(width!==headerWidth||height!==headerHeight) throw new Error("PSD_DIMENSION_MISMATCH: Decoded PSD dimensions do not match the guarded header.");
    const canvas=(psd as any).canvas;
    if(!canvas) throw new Error("PSD_COMPOSITE_MISSING: PSD has no decodable composite bitmap.");

    request.onProgress?.(.7,"Encoding flattened image");
    const quality=Math.max(.1,Math.min(1,request.quality??.9));
    const blob=await canvasBlob(canvas,MIME[request.targetFormatId],quality);
    if(request.signal.aborted) throw new DOMException("PSD conversion cancelled.","AbortError");

    return {
      blob,
      width,height,
      warnings:[
        "PSD output is flattened. Layers, masks, text editability, vector shapes, adjustment layers, blend metadata, smart objects, channels, and Photoshop-specific editing data are not preserved."
      ],
      details:{layers:countLayers((psd as any).children),width,height}
    };
  }

  dispose():void{}
}
