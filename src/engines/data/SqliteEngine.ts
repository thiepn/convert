import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { DataConversionOptions, DetailedDatabaseInspection, DetailedDataInspection } from "../../core/data/types";
import { assertMemoryBackedSource } from "../../core/performance/Budget";
import type { SqliteWorkerRequest, SqliteWorkerResponse } from "./sqlite-protocol";

const INPUTS=new Set(["sqlite","json-data","jsonl"]);
const OUTPUTS=new Set(["sqlite","csv","tsv","json-data","jsonl"]);

function defaults():DataConversionOptions{
  return {delimiter:",",header:true};
}

export class SqliteEngine implements ConversionEngine{
  readonly id="sqlite-data";
  readonly version="sql.js-1.14.2";
  private wasmUrl="";
  private workers=new Set<Worker>();

  async prepare():Promise<void>{
    this.wasmUrl=new URL("engines/sqlite/sql-wasm.wasm",document.baseURI).href;
  }

  isAvailable():boolean{return typeof Worker!=="undefined"&&typeof WebAssembly!=="undefined";}

  canConvert(from:string,to:string):boolean{
    return INPUTS.has(from)&&OUTPUTS.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    const memoryBytes=Math.max(source.size*3,192*1024*1024);
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:Math.max(64*1024*1024,source.size*1.5),
      outputBytes:null,
      sourceAccess:"buffered",
      outputAccess:"buffered",
      notes:["sql.js loads the SQLite database into WebAssembly memory; large databases are device-budgeted."]
    };
  }

  async inspect(source:Blob):Promise<DetailedDatabaseInspection>{
    this.assertSize(source);
    return this.run({
      type:"inspect",requestId:crypto.randomUUID(),source,formatId:"sqlite",wasmUrl:this.wasmUrl
    }) as Promise<DetailedDatabaseInspection>;
  }

  async preview(source:Blob,table:string):Promise<DetailedDataInspection>{
    this.assertSize(source);
    return this.run({
      type:"preview",requestId:crypto.randomUUID(),source,table,wasmUrl:this.wasmUrl
    }) as Promise<DetailedDataInspection>;
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("SQLITE_ROUTE_UNSUPPORTED: Unsupported SQLite route.");
    }
    this.assertSize(request.source);
    const result=await this.run({
      type:"convert",
      requestId:crypto.randomUUID(),
      source:request.source,
      sourceFormatId:request.sourceFormatId as "sqlite"|"json-data"|"jsonl",
      targetFormatId:request.targetFormatId as "sqlite"|"csv"|"tsv"|"json-data"|"jsonl",
      options:{...defaults(),...(request.options??{})} as DataConversionOptions,
      wasmUrl:this.wasmUrl
    },request.signal,request.onProgress) as EngineConvertResult;

    if(request.outputHandle){
      const writer=await request.outputHandle.createWritable();
      await writer.write(result.blob);await writer.close();
      result.blob=await request.outputHandle.getFile();
      result.outputInWorkspace=true;
    }
    return result;
  }

  dispose():void{
    for(const worker of this.workers) worker.terminate();
    this.workers.clear();
  }

  private assertSize(source:Blob){
    assertMemoryBackedSource(source.size,"sql.js SQLite processing",3,768*1024*1024);
  }

  private run(
    request:SqliteWorkerRequest,
    signal?:AbortSignal,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<unknown>{
    const worker=new Worker(new URL("../../workers/sqlite.worker.ts",import.meta.url),{type:"module"});
    this.workers.add(worker);
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=()=>{
        if(settled) return;
        settled=true;
        signal?.removeEventListener("abort",abort);
        worker.terminate();this.workers.delete(worker);
      };
      const abort=()=>{finish();reject(new DOMException("SQLite operation cancelled.","AbortError"));};
      signal?.addEventListener("abort",abort,{once:true});
      worker.onmessage=(event:MessageEvent<SqliteWorkerResponse>)=>{
        const message=event.data;
        if(message.requestId!==request.requestId) return;
        if(message.type==="progress"){onProgress?.(message.progress,message.stage);return;}
        if(message.type==="error"){finish();reject(new Error(message.code+": "+message.message));return;}
        if(message.type==="database-inspection"){finish();resolve(message.inspection);return;}
        if(message.type==="data-inspection"){finish();resolve(message.inspection);return;}
        finish();resolve({blob:message.blob,warnings:message.warnings});
      };
      worker.onerror=event=>{finish();reject(new Error(event.message||"SQLite worker crashed."));};
      worker.postMessage(request);
    });
  }
}
