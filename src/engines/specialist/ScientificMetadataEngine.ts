import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { parseFitsHeader } from "../../core/specialist/fits";

export class ScientificMetadataEngine implements ConversionEngine{
  readonly id="scientific-metadata";
  readonly version="phase7-native-1";

  async prepare():Promise<void>{}
  isAvailable():boolean{return true;}
  canConvert(from:string,to:string):boolean{return from==="fits"&&to==="json-data";}

  async estimate(_source:Blob):Promise<ConversionEstimate>{
    return {
      temporaryBytes:16*1024*1024,
      memoryBytes:16*1024*1024,
      workspaceBytes:8*1024*1024,
      outputBytes:null,
      sourceAccess:"streaming",
      outputAccess:"buffered",
      notes:["Only a bounded FITS header slice is read; multi-gigabyte scientific payloads remain untouched."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("SCIENTIFIC_ROUTE_UNSUPPORTED: Only FITS header to JSON is supported.");
    request.onProgress?.(.3,"Reading FITS header cards");
    const probe=new Uint8Array(await request.source.slice(0,4*1024*1024).arrayBuffer());
    const cards=parseFitsHeader(probe);
    if(request.signal.aborted) throw new DOMException("FITS metadata conversion cancelled.","AbortError");
    const payload=cards.map(card=>({keyword:card.key,value:card.value,comment:card.comment}));
    return {
      blob:new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),
      warnings:["Only FITS header metadata is exported. Image cubes, spectra, binary tables, WCS arrays, compression payloads, and numerical data are not converted in Phase 7."],
      details:{cards:cards.length}
    };
  }

  dispose():void{}
}
