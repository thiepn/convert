import * as duckdb from "@duckdb/duckdb-wasm";
import { tableFromIPC, tableToIPC, type Table } from "apache-arrow";
import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { DataColumnInfo, DataConversionOptions, DetailedDataInspection } from "../../core/data/types";
import { validateLocalSelectQuery } from "../../core/data/querySecurity";
import { jsonTextToCsv } from "../../core/data/jsonBridge";
import { assertMemoryBackedSource } from "../../core/performance/Budget";
import { getDeviceProfile } from "../../core/performance/DeviceProfile";

const INPUTS=new Set(["csv","tsv","json-data","jsonl","parquet","arrow"]);
const OUTPUTS=new Set(["csv","tsv","json-data","jsonl","parquet","arrow"]);

function defaultOptions():DataConversionOptions{
  return {delimiter:"auto",header:true};
}

function sqlQuote(value:string):string{
  return "'"+value.replaceAll("'","''")+"'";
}

function normalizeValue(value:unknown):unknown{
  if(typeof value==="bigint") return value.toString();
  if(value instanceof Date) return value.toISOString();
  if(value instanceof Uint8Array) return Array.from(value);
  if(value&&typeof value==="object"){
    try{return JSON.parse(JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v));}
    catch{return String(value);}
  }
  return value;
}

function tablePreview(table:Table,maxRows=20):Array<Record<string,unknown>>{
  const names=table.schema.fields.map(field=>field.name);
  const rows:Array<Record<string,unknown>>=[];
  const limit=Math.min(maxRows,table.numRows);
  for(let rowIndex=0;rowIndex<limit;rowIndex++){
    const row:Record<string,unknown>={};
    for(const name of names){
      row[name]=normalizeValue(table.getChild(name)?.get(rowIndex));
    }
    rows.push(row);
  }
  return rows;
}

export class DuckDbDataEngine implements ConversionEngine{
  readonly id="duckdb-data";
  readonly version="duckdb-wasm-1.32.0";
  private db:duckdb.AsyncDuckDB|null=null;
  private worker:Worker|null=null;
  private baseUrl="";
  private initPromise:Promise<duckdb.AsyncDuckDB>|null=null;
  private queue:Promise<unknown>=Promise.resolve();

  async prepare():Promise<void>{
    this.baseUrl=new URL("engines/duckdb/",document.baseURI).href;
  }

  isAvailable():boolean{
    return typeof Worker!=="undefined"&&typeof WebAssembly!=="undefined";
  }

  canConvert(from:string,to:string):boolean{
    return INPUTS.has(from)&&OUTPUTS.has(to);
  }

  async estimate(source:Blob,from:string,to:string):Promise<ConversionEstimate>{
    const profile=getDeviceProfile();
    const arrowInput=from==="arrow";
    const arrowOutput=to==="arrow";
    const jsonInput=from==="json-data"||from==="jsonl";
    const flatOutput=["csv","tsv","json-data","jsonl"].includes(to);
    const materializationFactor=arrowInput||arrowOutput||jsonInput
      ?2
      :flatOutput
        ?1.75
        :.75;
    const memoryBytes=Math.max(
      256*1024*1024,
      Math.min(source.size*materializationFactor,1536*1024*1024)
    );
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:Math.max(96*1024*1024,Math.ceil(source.size*1.25)),
      outputBytes:null,
      sourceAccess:arrowInput||jsonInput?"buffered":"streaming",
      outputAccess:"buffered",
      notes:[
        arrowInput
          ?"Arrow IPC parsing is memory-backed."
          :jsonInput
            ?"JSON/JSONL is parsed locally and bridged to CSV before DuckDB; no DuckDB JSON extension is loaded."
            :"CSV/TSV/Parquet source access uses DuckDB's lazy browser file reader.",
        profile.opfs
          ?"Final output is staged in the local workspace after DuckDB export."
          :"DuckDB export is materialized in browser memory on this runtime."
      ]
    };
  }

  async inspect(source:Blob,formatId:string,options:Partial<DataConversionOptions>={}):Promise<DetailedDataInspection>{
    return this.exclusive(async()=>this.withSource(source,formatId,{...defaultOptions(),...options},async(conn)=>{
      const schemaResult=await conn.query("DESCRIBE SELECT * FROM data");
      const columns:DataColumnInfo[]=tablePreview(schemaResult,10_000).map(row=>({
        name:String(row.column_name??row.name??"column"),
        type:String(row.column_type??row.type??"UNKNOWN"),
        nullable:String(row.null??row.nullable??"YES").toUpperCase()!=="NO"
      }));
      const countResult=await conn.query("SELECT COUNT(*) AS row_count FROM data");
      const countValue=countResult.getChild("row_count")?.get(0);
      const rows=typeof countValue==="bigint"?Number(countValue):Number(countValue??0);
      const preview=tablePreview(await conn.query("SELECT * FROM data LIMIT 20"),20);
      return {
        formatId,
        rows:Number.isFinite(rows)?rows:null,
        columns,
        preview,
        warnings:[],
        engine:"DuckDB-Wasm 1.32.0"
      };
    })) as Promise<DetailedDataInspection>;
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("DATA_ROUTE_UNSUPPORTED: Unsupported structured-data route.");
    }
    const options={...defaultOptions(),...(request.options??{})} as DataConversionOptions;
    return this.exclusive(async()=>this.withSource(request.source,request.sourceFormatId,options,async(conn,db)=>{
      request.signal.throwIfAborted?.();
      request.onProgress?.(.18,"Preparing local analytical query");

      const query=options.query?.trim()?validateLocalSelectQuery(options.query):"SELECT * FROM data";
      if(request.targetFormatId==="arrow"){
        const result=await conn.query(query);
        request.signal.throwIfAborted?.();
        const bytes=tableToIPC(result as any,"file");
        const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
        let blob:Blob=new Blob([copy.buffer],{type:"application/vnd.apache.arrow.file"});
        if(request.outputHandle){
          const writer=await request.outputHandle.createWritable();
          await writer.write(blob);await writer.close();
          blob=await request.outputHandle.getFile();
        }
        return {blob,warnings:[],outputInWorkspace:Boolean(request.outputHandle)};
      }

      if(request.targetFormatId==="json-data"||request.targetFormatId==="jsonl"){
        request.onProgress?.(.45,"Executing local data transform");
        const result=await conn.query(query);
        request.signal.throwIfAborted?.();
        const rows=tablePreview(result as any,Number.MAX_SAFE_INTEGER);
        const text=request.targetFormatId==="jsonl"
          ?rows.map(row=>JSON.stringify(row)).join("\n")+(rows.length?"\n":"")
          :JSON.stringify(rows,null,2);
        let blob:Blob=new Blob([text],{type:this.mimeFor(request.targetFormatId)});
        if(request.outputHandle){
          const writer=await request.outputHandle.createWritable();
          await writer.write(blob);await writer.close();
          blob=await request.outputHandle.getFile();
        }
        request.onProgress?.(.95,"Finalizing JSON output");
        return {blob,warnings:[],outputInWorkspace:Boolean(request.outputHandle)};
      }

      const name="output-"+crypto.randomUUID()+this.extensionFor(request.targetFormatId);
      const copySql=this.copySql(query,name,request.targetFormatId,options);
      request.onProgress?.(.45,"Executing local data transform");
      await conn.query(copySql);
      request.signal.throwIfAborted?.();
      const bytes=await db.copyFileToBuffer(name);
      await db.dropFile(name).catch(()=>{});
      const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
      let blob:Blob=new Blob([copy.buffer],{type:this.mimeFor(request.targetFormatId)});
      if(request.outputHandle){
        const writer=await request.outputHandle.createWritable();
        await writer.write(blob);await writer.close();
        blob=await request.outputHandle.getFile();
      }
      request.onProgress?.(.95,"Finalizing data output");
      return {blob,warnings:[],outputInWorkspace:Boolean(request.outputHandle)};
    })) as Promise<EngineConvertResult>;
  }

  dispose():void{
    const db=this.db;
    this.db=null;
    this.initPromise=null;
    if(db) void db.terminate();
    this.worker?.terminate();
    this.worker=null;
  }

  private exclusive<T>(task:()=>Promise<T>):Promise<T>{
    const run=this.queue.then(task,task);
    this.queue=run.then(()=>undefined,()=>undefined);
    return run;
  }

  private async getDb():Promise<duckdb.AsyncDuckDB>{
    if(this.db) return this.db;
    if(this.initPromise) return this.initPromise;
    this.initPromise=(async()=>{
      const bundles:duckdb.DuckDBBundles={
        mvp:{
          mainModule:new URL("duckdb-mvp.wasm",this.baseUrl).href,
          mainWorker:new URL("duckdb-browser-mvp.worker.js",this.baseUrl).href
        },
        eh:{
          mainModule:new URL("duckdb-eh.wasm",this.baseUrl).href,
          mainWorker:new URL("duckdb-browser-eh.worker.js",this.baseUrl).href
        }
      };
      const bundle=await duckdb.selectBundle(bundles);
      if(!bundle.mainWorker||!bundle.mainModule) throw new Error("DUCKDB_BUNDLE_UNAVAILABLE: No supported DuckDB browser bundle.");
      const worker=new Worker(bundle.mainWorker);
      const db=new duckdb.AsyncDuckDB(new duckdb.VoidLogger(),worker);
      await db.instantiate(bundle.mainModule,bundle.pthreadWorker);
      this.worker=worker;
      this.db=db;
      return db;
    })();
    return this.initPromise;
  }

  private async withSource<T>(
    source:Blob,
    formatId:string,
    options:DataConversionOptions,
    task:(conn:duckdb.AsyncDuckDBConnection,db:duckdb.AsyncDuckDB)=>Promise<T>
  ):Promise<T>{
    const db=await this.getDb();
    const conn=await db.connect();
    const fileName="input-"+crypto.randomUUID()+this.extensionFor(formatId);
    try{
      if(formatId==="arrow"){
        assertMemoryBackedSource(source.size,"Arrow IPC parsing",2,768*1024*1024);
        const table=tableFromIPC(new Uint8Array(await source.arrayBuffer()));
        await conn.insertArrowTable(table as any,{name:"data"});
      }else{
        let file:File;
        let sourceFormat=formatId;
        let sourceOptions=options;
        if(formatId==="json-data"||formatId==="jsonl"){
          const csv=jsonTextToCsv(await source.text(),formatId==="jsonl");
          file=new File([csv],fileName+".csv",{type:"text/csv"});
          sourceFormat="csv";
          sourceOptions={...options,delimiter:",",header:true};
        }else{
          file=source instanceof File?source:new File([source],fileName,{type:source.type});
        }
        await db.registerFileHandle(fileName,file,duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,true);
        const sourceExpr=this.sourceExpression(sourceFormat,fileName,sourceOptions);
        await conn.query("CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM "+sourceExpr);
      }
      return await task(conn,db);
    }finally{
      try{await conn.close();}catch{}
      if(formatId!=="arrow") try{await db.dropFile(fileName);}catch{}
    }
  }

  private sourceExpression(formatId:string,fileName:string,options:DataConversionOptions):string{
    const file=sqlQuote(fileName);
    if(formatId==="csv"){
      const delimiter=options.delimiter&&options.delimiter!=="auto"
        ? ", delim="+sqlQuote(options.delimiter)
        : "";
      return "read_csv_auto("+file+delimiter+", header="+(options.header?"true":"false")+")";
    }
    if(formatId==="tsv") return "read_csv_auto("+file+", delim='\\t', header="+(options.header?"true":"false")+")";
    if(formatId==="parquet") return "read_parquet("+file+")";
    throw new Error("DATA_SOURCE_UNSUPPORTED: "+formatId);
  }

  private copySql(query:string,fileName:string,target:string,options:DataConversionOptions):string{
    const out=sqlQuote(fileName);
    if(target==="csv"){
      return "COPY ("+query+") TO "+out+" (FORMAT CSV, HEADER "+(options.header?"TRUE":"FALSE")+", DELIMITER "+sqlQuote(options.delimiter==="auto"||!options.delimiter?",":options.delimiter)+")";
    }
    if(target==="tsv"){
      return "COPY ("+query+") TO "+out+" (FORMAT CSV, HEADER "+(options.header?"TRUE":"FALSE")+", DELIMITER '\\t')";
    }
    if(target==="parquet") return "COPY ("+query+") TO "+out+" (FORMAT PARQUET, COMPRESSION ZSTD)";
    throw new Error("DATA_TARGET_UNSUPPORTED: "+target);
  }

  private extensionFor(formatId:string):string{
    return ({
      csv:".csv",tsv:".tsv","json-data":".json",jsonl:".jsonl",
      parquet:".parquet",arrow:".arrow"
    } as Record<string,string>)[formatId]??".bin";
  }

  private mimeFor(formatId:string):string{
    return ({
      csv:"text/csv;charset=utf-8",
      tsv:"text/tab-separated-values;charset=utf-8",
      "json-data":"application/json;charset=utf-8",
      jsonl:"application/x-ndjson;charset=utf-8",
      parquet:"application/vnd.apache.parquet",
      arrow:"application/vnd.apache.arrow.file"
    } as Record<string,string>)[formatId]??"application/octet-stream";
  }
}
