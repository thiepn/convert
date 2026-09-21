import { createFont } from "fonteditor-core";
import { compress as compressWoff2,decompress as decompressWoff2 } from "woff2-encoder";
import { unzlibSync,zlibSync } from "fflate";
import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { assertMemoryBackedSource } from "../../core/performance/Budget";

const COMMON=new Set(["ttf","woff","woff2","eot"]);
const MIME:Record<string,string>={
  ttf:"font/ttf",otf:"font/otf",woff:"font/woff",woff2:"font/woff2",eot:"application/vnd.ms-fontobject"
};

function copyBytes(value:ArrayBuffer|Uint8Array):Uint8Array{
  const source=value instanceof Uint8Array?value:new Uint8Array(value);
  const copy=new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function asArrayBuffer(bytes:Uint8Array):ArrayBuffer{
  const copy=copyBytes(bytes);
  return copy.buffer;
}

function sfntType(bytes:Uint8Array):"ttf"|"otf"{
  return bytes.length>=4
    &&bytes[0]===0x4f&&bytes[1]===0x54&&bytes[2]===0x54&&bytes[3]===0x4f
    ?"otf"
    :"ttf";
}

export class FontEngine implements ConversionEngine{
  readonly id="font-compat";
  readonly version="fonteditor-core-2.6.3 + woff2-encoder-2.0.0";

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
      notes:["Font tables and glyph outlines are materialized in memory. WOFF2 uses a CSP-safe local WebAssembly codec."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("FONT_ROUTE_UNSUPPORTED: Unsupported font conversion route.");
    }
    assertMemoryBackedSource(request.source.size,"font conversion",12,96*1024*1024);
    if(request.signal.aborted) throw new DOMException("Font conversion cancelled.","AbortError");

    request.onProgress?.(.18,"Reading font container");
    let inputBytes=new Uint8Array(await request.source.arrayBuffer());
    let inputType=request.sourceFormatId;

    if(request.sourceFormatId==="woff2"){
      request.onProgress?.(.32,"Decompressing WOFF2 locally");
      inputBytes=copyBytes(await decompressWoff2(inputBytes));
      inputType=sfntType(inputBytes);
      if(request.signal.aborted) throw new DOMException("Font conversion cancelled.","AbortError");
    }

    if(request.sourceFormatId==="woff2"&&request.targetFormatId==="woff2"){
      return {
        blob:new Blob([asArrayBuffer(inputBytes)],{type:MIME.woff2}),
        warnings:["WOFF2 input was decoded and validated locally before being returned."]
      };
    }

    const font=createFont(asArrayBuffer(inputBytes),{
      type:inputType,
      inflate:(data:Uint8Array)=>unzlibSync(new Uint8Array(data))
    } as any);

    request.onProgress?.(.65,"Writing font container");
    let outputBytes:Uint8Array;

    if(request.targetFormatId==="woff2"){
      const sfnt=font.write({
        type:"ttf",
        hinting:true,
        kerning:true,
        deflate:(data:Uint8Array)=>zlibSync(new Uint8Array(data))
      } as any) as ArrayBuffer|Uint8Array;
      request.onProgress?.(.8,"Compressing WOFF2 locally");
      outputBytes=copyBytes(await compressWoff2(copyBytes(sfnt)));
    }else{
      const output=font.write({
        type:request.targetFormatId,
        hinting:true,
        kerning:true,
        deflate:(data:Uint8Array)=>zlibSync(new Uint8Array(data))
      } as any) as ArrayBuffer|Uint8Array;
      outputBytes=copyBytes(output);
    }

    if(request.signal.aborted) throw new DOMException("Font conversion cancelled.","AbortError");

    const warnings:string[]=[];
    if(request.sourceFormatId==="otf"||inputType==="otf"){
      warnings.push("OpenType/CFF-specific features may be reduced when converting through a TrueType-compatible target.");
    }
    warnings.push("Font conversion does not grant redistribution rights. Preserve the source font's embedding and licensing terms.");

    return {
      blob:new Blob([asArrayBuffer(outputBytes)],{type:MIME[request.targetFormatId]??"application/octet-stream"}),
      warnings
    };
  }

  dispose():void{}
}
