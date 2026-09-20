import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
import type { DataColumnInfo, DataConversionOptions, DetailedDatabaseInspection, DetailedDataInspection } from "../core/data/types";
import type { SqliteWorkerRequest, SqliteWorkerResponse } from "../engines/data/sqlite-protocol";

const scope=globalThis as unknown as {
  postMessage(message:SqliteWorkerResponse):void;
  onmessage:((event:MessageEvent<SqliteWorkerRequest>)=>void)|null;
};

let sqlPromise:Promise<SqlJsStatic>|null=null;
let loadedUrl="";

function send(message:SqliteWorkerResponse){scope.postMessage(message);}

async function getSql(wasmUrl:string){
  if(sqlPromise&&loadedUrl===wasmUrl) return sqlPromise;
  loadedUrl=wasmUrl;
  sqlPromise=initSqlJs({locateFile:()=>wasmUrl});
  return sqlPromise;
}

function quoteIdent(name:string):string{
  return '"'+name.replaceAll('"','""')+'"';
}

function normalizeValue(value:any):unknown{
  if(value instanceof Uint8Array) return Array.from(value);
  if(value===undefined) return null;
  return value;
}

function sqliteType(values:unknown[]):string{
  let hasReal=false,hasInt=false,hasText=false,hasBlob=false;
  for(const value of values){
    if(value==null) continue;
    if(value instanceof Uint8Array){hasBlob=true;continue;}
    if(typeof value==="number"){
      if(Number.isInteger(value)) hasInt=true; else hasReal=true;
      continue;
    }
    if(typeof value==="boolean"){hasInt=true;continue;}
    hasText=true;
  }
  if(hasText) return "TEXT";
  if(hasBlob) return "BLOB";
  if(hasReal) return "REAL";
  if(hasInt) return "INTEGER";
  return "TEXT";
}

function serializeCell(value:unknown):any{
  if(value==null) return null;
  if(typeof value==="boolean") return value?1:0;
  if(typeof value==="object"&&!(value instanceof Uint8Array)) return JSON.stringify(value);
  return value;
}

function parseJsonRows(text:string,jsonl:boolean):Array<Record<string,unknown>>{
  const rows=jsonl
    ? text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>JSON.parse(line))
    : (()=>{const parsed=JSON.parse(text);return Array.isArray(parsed)?parsed:[parsed];})();
  return rows.map((row,index)=>{
    if(row&&typeof row==="object"&&!Array.isArray(row)) return row as Record<string,unknown>;
    return {value:row,row_index:index};
  });
}

async function openDb(source:Blob,wasmUrl:string):Promise<Database>{
  const SQL=await getSql(wasmUrl);
  return new SQL.Database(new Uint8Array(await source.arrayBuffer()));
}

function execRows(db:Database,sql:string):Array<Record<string,unknown>>{
  const result=db.exec(sql);
  if(!result.length) return [];
  const [first]=result;
  return first.values.map(values=>{
    const row:Record<string,unknown>={};
    first.columns.forEach((column,index)=>{row[column]=normalizeValue(values[index]);});
    return row;
  });
}

function tableColumns(db:Database,table:string):DataColumnInfo[]{
  const rows=execRows(db,"PRAGMA table_info("+quoteIdent(table)+")");
  return rows.map(row=>({
    name:String(row.name??"column"),
    type:String(row.type??""),
    nullable:Number(row.notnull??0)===0
  }));
}

async function inspectDatabase(source:Blob,wasmUrl:string):Promise<DetailedDatabaseInspection>{
  const db=await openDb(source,wasmUrl);
  try{
    const objects=execRows(db,"SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name LIMIT 200");
    const tables=objects.map(object=>{
      const name=String(object.name);
      const type=String(object.type)==="view"?"view":"table";
      let rows:number|null=null;
      try{
        const value=db.exec("SELECT COUNT(*) AS c FROM "+quoteIdent(name))[0]?.values?.[0]?.[0];
        rows=typeof value==="number"?value:Number(value??0);
        if(!Number.isFinite(rows)) rows=null;
      }catch{}
      return {name,type,rows,columns:tableColumns(db,name)};
    });
    const userVersion=Number(db.exec("PRAGMA user_version")[0]?.values?.[0]?.[0]??0);
    const applicationId=Number(db.exec("PRAGMA application_id")[0]?.values?.[0]?.[0]??0);
    return {
      formatId:"sqlite",
      tables,
      userVersion:Number.isFinite(userVersion)?userVersion:null,
      applicationId:Number.isFinite(applicationId)?applicationId:null,
      warnings:tables.length>=200?["Only the first 200 tables/views are shown."]:[],
      engine:"sql.js 1.14.2"
    };
  }finally{db.close();}
}

async function previewTable(source:Blob,table:string,wasmUrl:string):Promise<DetailedDataInspection>{
  const db=await openDb(source,wasmUrl);
  try{
    const columns=tableColumns(db,table);
    const countRaw=db.exec("SELECT COUNT(*) FROM "+quoteIdent(table))[0]?.values?.[0]?.[0];
    const rows=Number(countRaw??0);
    const preview=execRows(db,"SELECT * FROM "+quoteIdent(table)+" LIMIT 20");
    return {
      formatId:"sqlite",
      rows:Number.isFinite(rows)?rows:null,
      columns,
      preview,
      warnings:[],
      engine:"sql.js 1.14.2"
    };
  }finally{db.close();}
}

function csvEscape(value:unknown,delimiter:string):string{
  if(value==null) return "";
  const text=typeof value==="object"?JSON.stringify(value):String(value);
  return /["\r\n]/.test(text)||text.includes(delimiter)?'"'+text.replaceAll('"','""')+'"':text;
}

function exportFlat(db:Database,table:string,target:string,options:DataConversionOptions,maxRows:number):Blob{
  const columns=tableColumns(db,table).map(column=>column.name);
  const stmt=db.prepare("SELECT * FROM "+quoteIdent(table));
  const rows:Array<Record<string,unknown>>=[];
  try{
    while(stmt.step()){
      if(rows.length>=maxRows) throw new Error("SQLITE_EXPORT_ROW_LIMIT: Table exceeds this device's guarded export row limit.");
      const raw=stmt.getAsObject();
      const row:Record<string,unknown>={};
      for(const [key,value] of Object.entries(raw)) row[key]=normalizeValue(value);
      rows.push(row);
    }
  }finally{stmt.free();}

  if(target==="json-data") return new Blob([JSON.stringify(rows,null,2)],{type:"application/json;charset=utf-8"});
  if(target==="jsonl") return new Blob([rows.map(row=>JSON.stringify(row)).join("\n")+(rows.length?"\n":"")],{type:"application/x-ndjson;charset=utf-8"});

  const delimiter=target==="tsv"?"\t":options.delimiter||",";
  const lines:string[]=[];
  if(options.header) lines.push(columns.map(value=>csvEscape(value,delimiter)).join(delimiter));
  for(const row of rows) lines.push(columns.map(column=>csvEscape(row[column],delimiter)).join(delimiter));
  return new Blob([lines.join("\r\n")+(lines.length?"\r\n":"")],{
    type:target==="tsv"?"text/tab-separated-values;charset=utf-8":"text/csv;charset=utf-8"
  });
}

async function createDbFromJson(source:Blob,jsonl:boolean,wasmUrl:string,maxRows:number):Promise<Blob>{
  const SQL=await getSql(wasmUrl);
  const rows=parseJsonRows(await source.text(),jsonl);
  if(rows.length>maxRows) throw new Error("SQLITE_IMPORT_ROW_LIMIT: JSON input exceeds this device's guarded import row limit.");

  const columns=[...new Set(rows.slice(0,10_000).flatMap(row=>Object.keys(row)))];
  if(!columns.length) columns.push("value");
  if(columns.length>2000) throw new Error("SQLITE_COLUMN_LIMIT: Input has too many columns.");

  const samples=new Map<string,unknown[]>();
  for(const column of columns) samples.set(column,[]);
  for(const row of rows.slice(0,5000)){
    for(const column of columns) samples.get(column)!.push(row[column]);
  }

  const db=new SQL.Database();
  try{
    db.run(
      "CREATE TABLE data ("+
      columns.map(column=>quoteIdent(column)+" "+sqliteType(samples.get(column)!)).join(",")+
      ")"
    );
    const placeholders=columns.map(()=>"?").join(",");
    const stmt=db.prepare("INSERT INTO data ("+columns.map(quoteIdent).join(",")+") VALUES ("+placeholders+")");
    try{
      db.run("BEGIN");
      for(const row of rows){
        stmt.run(columns.map(column=>serializeCell(row[column])));
      }
      db.run("COMMIT");
    }catch(error){
      try{db.run("ROLLBACK");}catch{}
      throw error;
    }finally{stmt.free();}

    const bytes=db.export();
    const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
    return new Blob([copy.buffer],{type:"application/vnd.sqlite3"});
  }finally{db.close();}
}

scope.onmessage=async(event)=>{
  const request=event.data;
  try{
    if(request.type==="inspect"){
      send({type:"database-inspection",requestId:request.requestId,inspection:await inspectDatabase(request.source,request.wasmUrl)});
      return;
    }
    if(request.type==="preview"){
      send({type:"data-inspection",requestId:request.requestId,inspection:await previewTable(request.source,request.table,request.wasmUrl)});
      return;
    }

    send({type:"progress",requestId:request.requestId,progress:.15,stage:"Opening SQLite data"});
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    const maxRows=mobile?100_000:500_000;
    let blob:Blob;

    if(request.targetFormatId==="sqlite"){
      if(request.sourceFormatId==="sqlite") blob=request.source;
      else blob=await createDbFromJson(request.source,request.sourceFormatId==="jsonl",request.wasmUrl,maxRows);
    }else{
      if(request.sourceFormatId!=="sqlite") throw new Error("SQLITE_ROUTE_UNSUPPORTED: Flat export requires SQLite source.");
      const db=await openDb(request.source,request.wasmUrl);
      try{
        const table=request.options.selectedTable
          || String(db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 1")[0]?.values?.[0]?.[0]??"");
        if(!table) throw new Error("SQLITE_TABLE_REQUIRED: Database contains no user table.");
        send({type:"progress",requestId:request.requestId,progress:.5,stage:"Exporting table "+table});
        blob=exportFlat(db,table,request.targetFormatId,request.options,maxRows);
      }finally{db.close();}
    }

    send({type:"result",requestId:request.requestId,blob,warnings:[]});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    send({type:"error",requestId:request.requestId,code:message.split(":")[0]||"SQLITE_FAILED",message});
  }
};
