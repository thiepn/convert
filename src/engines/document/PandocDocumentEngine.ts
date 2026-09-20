import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { DocumentConversionOptions } from "../../core/document/types";
import type { PandocWorkerRequest, PandocWorkerResponse } from "./pandoc-protocol";

const INPUTS=new Set(["docx","docm","odt","rtf","html-doc","markdown","txt","latex","typst","epub","pptx","pptm"]);
const OUTPUTS=new Set(["docx","odt","rtf","html-doc","markdown","txt","latex","typst","epub","pptx"]);

function defaults():DocumentConversionOptions{
  return {
    routePreference:"semantic",
    trackChanges:"all",
    assets:"extract",
    standalone:true,
    tableOfContents:false,
    preserveComments:true
  };
}

export class PandocDocumentEngine implements ConversionEngine{
  readonly id="pandoc-document";
  readonly version="pandoc-wasm-1.1.0/pandoc-3.9";
  private workers=new Set<Worker>();

  isAvailable():boolean{
    return typeof Worker!=="undefined"&&typeof WebAssembly!=="undefined";
  }

  canConvert(from:string,to:string):boolean{
    return INPUTS.has(from)&&OUTPUTS.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    return {
      temporaryBytes:Math.max(256*1024*1024,source.size*4),
      outputBytes:null,
      notes:["Pandoc WASM is memory-backed and sandboxed; documents are size-gated before semantic conversion."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("PANDOC_ROUTE_UNSUPPORTED: Unsupported semantic route.");
    }
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    const limit=mobile?64*1024*1024:160*1024*1024;
    if(request.source.size>limit){
      throw new Error("DOCUMENT_SEMANTIC_MEMORY_LIMIT: Document is too large for the Pandoc browser sandbox on this device.");
    }

    const options={...defaults(),...(request.options??{})} as DocumentConversionOptions;
    const worker=new Worker(new URL("../../workers/document-pandoc.worker.ts",import.meta.url),{type:"module"});
    this.workers.add(worker);
    const requestId=crypto.randomUUID();

    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=()=>{
        if(settled) return;
        settled=true;
        request.signal.removeEventListener("abort",abort);
        worker.terminate();
        this.workers.delete(worker);
      };
      const abort=()=>{
        finish();
        reject(new DOMException("Semantic document conversion cancelled.","AbortError"));
      };
      request.signal.addEventListener("abort",abort,{once:true});

      worker.onmessage=(event:MessageEvent<PandocWorkerResponse>)=>{
        const message=event.data;
        if(message.requestId!==requestId) return;
        if(message.type==="progress"){
          request.onProgress?.(message.progress,message.stage);
          return;
        }
        if(message.type==="error"){
          finish();
          reject(new Error(message.code+": "+message.message));
          return;
        }
        finish();
        resolve({
          blob:message.blob,
          warnings:message.warnings,
          extraFiles:message.extraFiles
        });
      };
      worker.onerror=event=>{
        finish();
        reject(new Error(event.message||"Pandoc worker crashed."));
      };

      const sourceName="input."+(request.sourceFormatId==="html-doc"?"html":request.sourceFormatId);
      worker.postMessage({
        type:"convert",
        requestId,
        source:request.source,
        sourceName,
        sourceFormatId:request.sourceFormatId,
        targetFormatId:request.targetFormatId,
        options
      } satisfies PandocWorkerRequest);
    });
  }

  dispose():void{
    for(const worker of this.workers) worker.terminate();
    this.workers.clear();
  }
}
