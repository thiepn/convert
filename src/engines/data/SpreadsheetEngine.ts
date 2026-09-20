import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { DetailedSpreadsheetInspection, SpreadsheetConversionOptions } from "../../core/data/types";
import type { SheetJsWorkerRequest, SheetJsWorkerResponse } from "./sheetjs-protocol";

const INPUTS=new Set(["xlsx","xlsm","xlsb","xls","ods","fods","csv","tsv","json-data","jsonl"]);
const OUTPUTS=new Set(["xlsx","xlsb","xls","ods","fods","csv","tsv","json-data"]);

function defaults():SpreadsheetConversionOptions{
  return {
    routePreference:"semantic",
    sheetPolicy:"first",
    formulaMode:"preserve",
    delimiter:",",
    header:true
  };
}

export class SpreadsheetEngine implements ConversionEngine{
  readonly id="sheetjs-spreadsheet";
  readonly version="sheetjs-ce-0.20.3";
  private workers=new Set<Worker>();

  isAvailable():boolean{return typeof Worker!=="undefined";}

  canConvert(from:string,to:string):boolean{
    return INPUTS.has(from)&&OUTPUTS.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    return {
      temporaryBytes:Math.max(source.size*5,mobile?192*1024*1024:512*1024*1024),
      outputBytes:null,
      notes:["SheetJS workbook parsing is memory-backed; source files are size-gated."]
    };
  }

  async inspect(source:Blob,formatId:string):Promise<DetailedSpreadsheetInspection>{
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    const limit=mobile?64*1024*1024:192*1024*1024;
    if(source.size>limit) throw new Error("SPREADSHEET_MEMORY_LIMIT: Workbook exceeds this device's SheetJS inspection budget.");
    return this.run({type:"inspect",requestId:crypto.randomUUID(),source,formatId}) as Promise<DetailedSpreadsheetInspection>;
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("SPREADSHEET_ROUTE_UNSUPPORTED: Unsupported workbook route.");
    }
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    const limit=mobile?64*1024*1024:192*1024*1024;
    if(request.source.size>limit) throw new Error("SPREADSHEET_MEMORY_LIMIT: Workbook exceeds this device's semantic spreadsheet budget.");

    const result=await this.run({
      type:"convert",
      requestId:crypto.randomUUID(),
      source:request.source,
      sourceFormatId:request.sourceFormatId,
      targetFormatId:request.targetFormatId,
      options:{...defaults(),...(request.options??{})} as SpreadsheetConversionOptions
    },request.signal,request.onProgress) as EngineConvertResult;

    if(request.outputHandle){
      const writer=await request.outputHandle.createWritable();
      await writer.write(result.blob);
      await writer.close();
      result.blob=await request.outputHandle.getFile();
      result.outputInWorkspace=true;
    }
    return result;
  }

  dispose():void{
    for(const worker of this.workers) worker.terminate();
    this.workers.clear();
  }

  private run(
    request:SheetJsWorkerRequest,
    signal?:AbortSignal,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<unknown>{
    const worker=new Worker(new URL("../../workers/sheetjs.worker.ts",import.meta.url),{type:"module"});
    this.workers.add(worker);
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=()=>{
        if(settled) return;
        settled=true;
        signal?.removeEventListener("abort",abort);
        worker.terminate();
        this.workers.delete(worker);
      };
      const abort=()=>{finish();reject(new DOMException("Spreadsheet conversion cancelled.","AbortError"));};
      signal?.addEventListener("abort",abort,{once:true});

      worker.onmessage=(event:MessageEvent<SheetJsWorkerResponse>)=>{
        const message=event.data;
        if(message.requestId!==request.requestId) return;
        if(message.type==="progress"){onProgress?.(message.progress,message.stage);return;}
        if(message.type==="error"){finish();reject(new Error(message.code+": "+message.message));return;}
        if(message.type==="inspection"){finish();resolve(message.inspection);return;}
        finish();
        resolve({blob:message.blob,warnings:message.warnings,extraFiles:message.extraFiles});
      };
      worker.onerror=event=>{finish();reject(new Error(event.message||"SheetJS worker crashed."));};
      worker.postMessage(request);
    });
  }
}
