import { createFont,woff2 } from "fonteditor-core";
import { unzlibSync,zlibSync } from "fflate";
import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { assertMemoryBackedSource } from "../../core/performance/Budget";

const COMMON=new Set(["ttf","woff","woff2","eot"]);
const MIME:Record<string,string>={
  ttf:"font/ttf",otf:"font/otf",woff:"font/woff",woff2:"font/woff2",eot:"application/vnd.ms-fontobject"
};

export class FontEngine implements ConversionEngine{
  readonly id="font-compat";
  readonly version="fonteditor-core-2.6.3";
  private woff2Url="";
  private woff2Ready:Promise<unknown>|null=null;

  async prepare():Promise<void>{
    this.woff2Url=new URL("engines/font/woff2.wasm",document.baseURI).href;
  }

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
      notes:["Font tables and glyph outlines are materialized in memory. WOFF2 uses a self-hosted local WASM codec."]
    };
  }

  private async ensureWoff2(){
    if(!this.woff2Ready) this.woff2Ready=woff2.init(this.woff2Url);
    await this.woff2Ready;
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("FONT_ROUTE_UNSUPPORTED: Unsupported font conversion route.");
    assertMemoryBackedSource(request.source.size,"font conversion",12,96*1024*1024);
    if(request.sourceFormatId==="woff2"||request.targetFormatId==="woff2") await this.ensureWoff2();
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

    const bytes=output instanceof Uint8Array?output:new Uint8Array(output);
    const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
    const warnings:string[]=[];
    if(request.sourceFormatId==="otf"){
      warnings.push("OTF is read-only in the Phase 7 font engine and is converted through the library's TrueType outline path; OpenType/CFF-specific features may be reduced.");
    }
    warnings.push("Font conversion does not grant redistribution rights. Preserve the source font's embedding and licensing terms.");

    return {blob:new Blob([copy.buffer],{type:MIME[request.targetFormatId]??"application/octet-stream"}),warnings};
  }

  dispose():void{}
}
