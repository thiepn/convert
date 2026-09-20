import {
  WorkerBrowserConverter,
  createWasmPaths,
  type FontData,
  type InputFormat,
  type OutputFormat
} from "@matbee/libreoffice-converter/browser";
import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { DocumentConversionOptions } from "../../core/document/types";
import { DocumentInspector } from "./DocumentInspector";

const WRITER_INPUTS=new Set(["doc","docx","odt","rtf","html-doc","txt","epub"]);
const WRITER_OUTPUTS=new Set(["pdf","docx","doc","odt","rtf","txt","html-doc"]);
const PRESENTATION_INPUTS=new Set(["ppt","pptx","odp"]);
const PRESENTATION_OUTPUTS=new Set(["pdf","pptx","ppt","odp","html-doc"]);
const SPREADSHEET_INPUTS=new Set(["xls","xlsx","ods","csv"]);
const SPREADSHEET_OUTPUTS=new Set(["pdf","xlsx","xls","ods","csv"]);

const INPUT_FORMAT:Record<string,InputFormat>={
  doc:"doc",docx:"docx",odt:"odt",rtf:"rtf","html-doc":"html",txt:"txt",epub:"epub",
  ppt:"ppt",pptx:"pptx",odp:"odp",
  xls:"xls",xlsx:"xlsx",ods:"ods",csv:"csv"
};
const OUTPUT_FORMAT:Record<string,OutputFormat>={
  pdf:"pdf",docx:"docx",doc:"doc",odt:"odt",rtf:"rtf",txt:"txt","html-doc":"html",
  pptx:"pptx",ppt:"ppt",odp:"odp",
  xlsx:"xlsx",xls:"xls",ods:"ods",csv:"csv"
};
const MIME:Record<string,string>={
  pdf:"application/pdf",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc:"application/msword",
  odt:"application/vnd.oasis.opendocument.text",
  rtf:"application/rtf",
  txt:"text/plain;charset=utf-8",
  "html-doc":"text/html;charset=utf-8",
  pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt:"application/vnd.ms-powerpoint",
  odp:"application/vnd.oasis.opendocument.presentation",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:"application/vnd.ms-excel",
  ods:"application/vnd.oasis.opendocument.spreadsheet",
  csv:"text/csv;charset=utf-8"
};

function defaultOptions():DocumentConversionOptions{
  return {
    routePreference:"fidelity",
    trackChanges:"all",
    assets:"embed",
    standalone:true,
    tableOfContents:false,
    preserveComments:true
  };
}

export class OfficeDocumentEngine implements ConversionEngine{
  readonly id="libreoffice-document";
  readonly version="libreoffice-wasm/@matbee-2.7.2";
  private converter:WorkerBrowserConverter|null=null;
  private fontSignature="";
  private uses=0;
  private currentProgress:((progress:number,stage:string)=>void)|undefined;
  private inspector=new DocumentInspector();
  private wasmBase="";
  private workerUrl="";
  private available=false;

  async prepare():Promise<void>{
    this.wasmBase=new URL("engines/libreoffice/wasm/",document.baseURI).href;
    this.workerUrl=new URL("engines/libreoffice/browser.worker.global.js",document.baseURI).href;
    this.available=Boolean(
      globalThis.crossOriginIsolated
      && typeof SharedArrayBuffer!=="undefined"
      && typeof Worker!=="undefined"
      && typeof WebAssembly!=="undefined"
    );
  }

  isAvailable():boolean{return this.available;}

  canConvert(from:string,to:string):boolean{
    if(WRITER_INPUTS.has(from)) return WRITER_OUTPUTS.has(to);
    if(PRESENTATION_INPUTS.has(from)) return PRESENTATION_OUTPUTS.has(to);
    if(SPREADSHEET_INPUTS.has(from)) return SPREADSHEET_OUTPUTS.has(to);
    return false;
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    return {
      temporaryBytes:Math.max(512*1024*1024,source.size*4),
      outputBytes:null,
      notes:[
        "LibreOffice WASM has a large fixed runtime footprint and is loaded only for fidelity routes.",
        "Input/output buffers are memory-backed inside the LibreOffice worker."
      ]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("OFFICE_ROUTE_UNSUPPORTED: LibreOffice cannot perform this document-family route.");
    }
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    const limit=mobile?64*1024*1024:256*1024*1024;
    if(request.source.size>limit){
      throw new Error("OFFICE_MEMORY_LIMIT: This document is too large for the browser LibreOffice fidelity engine on this device.");
    }

    const options={...defaultOptions(),...(request.options??{})} as DocumentConversionOptions;
    const isSpreadsheet=SPREADSHEET_INPUTS.has(request.sourceFormatId);
    const warnings:string[]=[];

    if(isSpreadsheet){
      if(request.sourceFormatId==="xls"){
        warnings.push("Legacy XLS may contain VBA/macros that cannot be ruled out by the lightweight format detector; LibreOffice runs in an isolated local worker.");
      }
      warnings.push("LibreOffice fidelity mode may recalculate formulas and update cached results.");
    }else{
      const inspection=await this.inspector.inspect(request.source,request.sourceFormatId);
      if(inspection.macros&&!["doc","ppt"].includes(request.sourceFormatId)){
        throw new Error("DOCUMENT_MACRO_BLOCKED: Macro payload detected. Use semantic conversion, which reads document content without executing VBA.");
      }
      warnings.push(...inspection.warnings);
      if(["doc","ppt"].includes(request.sourceFormatId)){
        warnings.push("Legacy binary Office format: macros cannot be structurally ruled out; LibreOffice runs in an isolated browser worker with no external-resource fetch path.");
      }
      if(inspection.externalLinks){
        warnings.push("External document relationships are preserved where possible but are not fetched.");
      }
      if(inspection.fonts.length){
        warnings.push("Layout fidelity depends on font availability. Source references "+inspection.fonts.length+" distinct font name(s).");
      }
    }

    const fontBytes=(options.fonts??[]).reduce((sum,font)=>sum+font.data.byteLength,0);
    const fontLimit=mobile?64*1024*1024:192*1024*1024;
    if(fontBytes>fontLimit){
      throw new Error("DOCUMENT_FONT_LIMIT: Imported fonts exceed this device's fidelity-engine budget.");
    }
    const allowedFont=/\.(?:ttf|otf|ttc|woff2?)$/i;
    const fonts=(options.fonts??[]).filter(font=>allowedFont.test(font.filename)).map(font=>({
      filename:font.filename.replace(/[^A-Za-z0-9._ -]/g,"_"),
      data:new Uint8Array(font.data)
    })) satisfies FontData[];

    this.currentProgress=request.onProgress;
    const converter=await this.getConverter(fonts);
    const inputFormat=INPUT_FORMAT[request.sourceFormatId];
    const outputFormat=OUTPUT_FORMAT[request.targetFormatId];
    if(!inputFormat||!outputFormat) throw new Error("OFFICE_ROUTE_UNSUPPORTED: Missing LibreOffice format mapping.");

    const input=new Uint8Array(await request.source.arrayBuffer());
    const fileName="input."+(request.sourceFormatId==="html-doc"?"html":request.sourceFormatId);
    const abortPromise=new Promise<never>((_,reject)=>{
      request.signal.addEventListener("abort",()=>{
        void this.resetConverter();
        reject(new DOMException("Office conversion cancelled.","AbortError"));
      },{once:true});
    });

    request.onProgress?.(.25,"Rendering with LibreOffice WASM");
    const result=await Promise.race([
      converter.convert(input,{outputFormat,inputFormat},fileName),
      abortPromise
    ]);

    const data=result.data instanceof Uint8Array?result.data:new Uint8Array(result.data);
    const buffer=new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    let blob=new Blob([buffer],{type:result.mimeType||MIME[request.targetFormatId]||"application/octet-stream"});

    this.uses++;
    if(request.outputHandle){
      const writer=await request.outputHandle.createWritable();
      await writer.write(blob);
      await writer.close();
      blob=await request.outputHandle.getFile();
    }

    request.onProgress?.(.96,"Finalizing fidelity output");
    if(this.uses>=4){
      await this.resetConverter();
    }

    return {
      blob,
      warnings,
      details:{duration:result.duration,engine:"LibreOffice WASM"},
      outputInWorkspace:Boolean(request.outputHandle)
    };
  }

  dispose():void{
    void this.resetConverter();
    this.inspector.dispose();
  }

  private async getConverter(fonts:FontData[]):Promise<WorkerBrowserConverter>{
    const signature=fonts.map(font=>font.filename+":"+font.data.byteLength).join("|");
    if(this.converter&&signature!==this.fontSignature){
      await this.resetConverter();
    }
    if(this.converter) return this.converter;

    this.fontSignature=signature;
    const converter=new WorkerBrowserConverter({
      ...createWasmPaths(this.wasmBase),
      browserWorkerJs:this.workerUrl,
      fonts,
      enableProgressTracking:false,
      onProgress:info=>{
        const percent=Math.max(0,Math.min(100,info.percent))/100;
        const scaled=percent<1 ? .02+percent*.2 : .22;
        this.currentProgress?.(scaled,info.message||"Loading LibreOffice");
      }
    });
    await converter.initialize();
    this.converter=converter;
    return converter;
  }

  private async resetConverter():Promise<void>{
    const converter=this.converter;
    this.converter=null;
    this.fontSignature="";
    this.uses=0;
    if(converter){
      try{await converter.destroy();}catch{}
    }
  }
}
