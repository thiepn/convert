import { createFont } from "fonteditor-core";
import { unzlibSync,zlibSync } from "fflate";
import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { assertMemoryBackedSource } from "../../core/performance/Budget";

const COMMON=new Set(["ttf","woff","eot"]);
const MIME:Record<string,string>={
  ttf:"font/ttf",otf:"font/otf",woff:"font/woff",eot:"application/vnd.ms-fontobject"
};

function ownedBuffer(value:ArrayBuffer|Uint8Array):ArrayBuffer{
  const source=value instanceof Uint8Array?value:new Uint8Array(value);
  const copy=new Uint8Array(new ArrayBuffer(source.byteLength));
  copy.set(source);
  return copy.buffer;
}

export class FontEngine implements ConversionEngine{
  readonly id="font-compat";
  readonly version="fonteditor-core-2.6.3";

  async prepare():Promise<void>{}

  isAvailable():boolean{return typeof WebAssembly!=="undefined";}
  canConvert(from:string,to:string):boolean{
    if(from==="otf") return to==="ttf";
    return COMMON.has(from)&&COMMON.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    const memoryBytes=Math.max(32*1024*1024,source.size*12);
    return {
      temporaryBytes:memoryBytes,memoryBytes,
      workspaceBytes:32*1024*1024,outputBytes:null,
      sourceAccess:"buffered",outputAccess:"buffered",
      notes:["Font tables and glyph outlines are materialized in memory. WOFF2 is recognized but intentionally has no v1.0.1 conversion route after browser/CSP certification failures."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("FONT_ROUTE_UNSUPPORTED: Unsupported or uncertified font conversion route.");
    }
    assertMemoryBackedSource(request.source.size,"font conversion",12,96*1024*1024);
    if(request.signal.aborted) throw new DOMException("Font conversion cancelled.","AbortError");

    request.onProgress?.(.25,"Reading font tables");
    const buffer=await request.source.arrayBuffer();
    const font=createFont(buffer,{
      type:request.sourceFormatId,
      inflate:(data:Uint8Array)=>unzlibSync(new Uint8Array(data))
    } as any);

    request.onProgress?.(.7,"Writing font container");
    const output=font.write({
      type:request.targetFormatId,
      hinting:true,
      kerning:true,
      deflate:(data:Uint8Array)=>zlibSync(new Uint8Array(data))
    } as any) as ArrayBuffer|Uint8Array;

    const warnings:string[]=[];
    if(request.sourceFormatId==="otf"){
      warnings.push("OTF is read-only in the compatibility engine and converts through a TrueType outline path; OpenType/CFF-specific features may be reduced.");
    }
    warnings.push("Font conversion does not grant redistribution rights. Preserve the source font's embedding and licensing terms.");

    return {
      blob:new Blob([ownedBuffer(output)],{type:MIME[request.targetFormatId]??"application/octet-stream"}),
      warnings
    };
  }

  dispose():void{}
}
