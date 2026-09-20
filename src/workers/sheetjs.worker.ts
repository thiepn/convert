import * as XLSX from "xlsx";
import type { DetailedSpreadsheetInspection, SpreadsheetConversionOptions, SpreadsheetSheetInfo } from "../core/data/types";
import type { SheetJsWorkerRequest, SheetJsWorkerResponse } from "../engines/data/sheetjs-protocol";

const scope=globalThis as unknown as {
  postMessage(message:SheetJsWorkerResponse):void;
  onmessage:((event:MessageEvent<SheetJsWorkerRequest>)=>void)|null;
};

const WORKBOOK_FORMATS=new Set(["xlsx","xlsm","xlsb","xls","ods","fods"]);
const FLAT_INPUTS=new Set(["csv","tsv","json-data","jsonl"]);
const MIME:Record<string,string>={
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:"application/vnd.ms-excel",
  xlsb:"application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  ods:"application/vnd.oasis.opendocument.spreadsheet",
  fods:"application/vnd.oasis.opendocument.spreadsheet-flat-xml",
  csv:"text/csv;charset=utf-8",
  tsv:"text/tab-separated-values;charset=utf-8",
  "json-data":"application/json;charset=utf-8"
};
const BOOK_TYPE:Record<string,XLSX.BookType>={
  xlsx:"xlsx",xls:"xls",xlsb:"xlsb",ods:"ods",fods:"fods"
};

function send(message:SheetJsWorkerResponse){scope.postMessage(message);}

function blobFromArray(data:ArrayBuffer|Uint8Array,type:string):Blob{
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
  return new Blob([copy.buffer],{type});
}

function workbookFromJson(text:string,jsonl:boolean):XLSX.WorkBook{
  let rows:any[];
  if(jsonl){
    rows=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>JSON.parse(line));
  }else{
    const parsed=JSON.parse(text);
    rows=Array.isArray(parsed)?parsed:[parsed];
  }
  const sheet=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,sheet,"Data");
  return wb;
}

async function readWorkbook(
  source:Blob,
  formatId:string,
  options:Partial<SpreadsheetConversionOptions>={}
):Promise<XLSX.WorkBook>{
  if(formatId==="json-data"||formatId==="jsonl") return workbookFromJson(await source.text(),formatId==="jsonl");
  if(formatId==="csv"||formatId==="tsv"){
    const selectedDelimiter=options.delimiter&&options.delimiter!=="auto"?options.delimiter:",";
    return XLSX.read(await source.text(),{
      type:"string",
      FS:formatId==="tsv"?"\t":selectedDelimiter,
      cellDates:true,
      cellFormula:true
    } as any);
  }
  return XLSX.read(await source.arrayBuffer(),{
    type:"array",
    cellDates:true,
    cellFormula:true,
    cellStyles:true,
    cellNF:true,
    cellText:true,
    bookVBA:true
  });
}

function sheetInfo(wb:XLSX.WorkBook,name:string,index:number):SpreadsheetSheetInfo{
  const sheet=wb.Sheets[name];
  const ref=sheet?.["!ref"]??null;
  let rows:number|null=null,columns:number|null=null;
  if(ref){
    const range=XLSX.utils.decode_range(ref);
    rows=range.e.r-range.s.r+1;
    columns=range.e.c-range.s.c+1;
  }

  let cells=0,formulas=0,hyperlinks=0;
  for(const key of Object.keys(sheet??{})){
    if(key.startsWith("!")) continue;
    const cell:any=sheet[key];
    cells++;
    if(typeof cell?.f==="string") formulas++;
    if(cell?.l?.Target) hyperlinks++;
  }

  const hidden=Boolean((wb.Workbook as any)?.Sheets?.[index]?.Hidden);
  return {
    name,
    hidden,
    range:ref,
    rows,
    columns,
    cells,
    formulas,
    merges:Array.isArray(sheet?.["!merges"])?sheet["!merges"]!.length:0,
    hyperlinks
  };
}

async function inspect(source:Blob,formatId:string):Promise<DetailedSpreadsheetInspection>{
  const wb=await readWorkbook(source,formatId);
  const sheets=wb.SheetNames.map((name,index)=>sheetInfo(wb,name,index));
  const warnings:string[]=[];
  const macros=Boolean((wb as any).vbaraw);
  if(macros) warnings.push("VBA macro payload detected. Macros are never executed.");
  if(sheets.some(sheet=>sheet.formulas>0)){
    warnings.push("Formula cells are parsed, but SheetJS does not calculate workbook formulas in the browser.");
  }
  return {
    formatId,
    sheets,
    namedRanges:Array.isArray((wb.Workbook as any)?.Names)?(wb.Workbook as any).Names.length:0,
    macros,
    date1904:Boolean((wb.Workbook as any)?.WBProps?.date1904),
    author:(wb.Props as any)?.Author??null,
    title:(wb.Props as any)?.Title??null,
    company:(wb.Props as any)?.Company??null,
    warnings,
    engine:"SheetJS CE "+(XLSX as any).version
  };
}

function chosenSheets(wb:XLSX.WorkBook,options:SpreadsheetConversionOptions):string[]{
  if(options.sheetPolicy==="all") return [...wb.SheetNames];
  if(options.sheetPolicy==="selected"&&options.selectedSheet&&wb.SheetNames.includes(options.selectedSheet)){
    return [options.selectedSheet];
  }
  return wb.SheetNames.length?[wb.SheetNames[0]]:[];
}

function flattenFormulaCells(sheet:XLSX.WorkSheet):void{
  for(const key of Object.keys(sheet)){
    if(key.startsWith("!")) continue;
    const cell:any=sheet[key];
    if(cell&&"f" in cell) delete cell.f;
  }
}

function cloneWorkbookForSheets(wb:XLSX.WorkBook,sheets:string[],formulaMode:"preserve"|"values"):XLSX.WorkBook{
  const out=XLSX.utils.book_new();
  for(const name of sheets){
    const source=wb.Sheets[name];
    const copy:any={};
    for(const [key,value] of Object.entries(source)) copy[key]=typeof value==="object"&&value!==null?structuredClone(value):value;
    if(formulaMode==="values") flattenFormulaCells(copy);
    XLSX.utils.book_append_sheet(out,copy,name.slice(0,31));
  }
  return out;
}

function flatBlob(sheet:XLSX.WorkSheet,target:string,options:SpreadsheetConversionOptions):Blob{
  if(target==="csv"||target==="tsv"){
    const text=XLSX.utils.sheet_to_csv(sheet,{
      FS:target==="tsv"?"\t":(!options.delimiter||options.delimiter==="auto"?",":options.delimiter),
      strip:false,
      blankrows:true
    });
    return new Blob([text],{type:MIME[target]});
  }
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:true,header:options.header?undefined:1});
  return new Blob([JSON.stringify(rows,null,2)],{type:MIME["json-data"]});
}

async function convert(
  source:Blob,
  sourceFormatId:string,
  targetFormatId:string,
  options:SpreadsheetConversionOptions,
  requestId:string
){
  send({type:"progress",requestId,progress:.12,stage:"Parsing workbook"});
  const wb=await readWorkbook(source,sourceFormatId,options);
  const sheets=chosenSheets(wb,options);
  if(!sheets.length) throw new Error("SPREADSHEET_EMPTY: Workbook contains no sheets.");

  const warnings:string[]=[];
  if(Boolean((wb as any).vbaraw)) warnings.push("VBA macro content is not preserved into Phase 6 output formats.");
  if(options.formulaMode==="preserve"&&["csv","tsv","json-data"].includes(targetFormatId)){
    warnings.push("Flat data targets cannot preserve formulas; cached/result values are exported.");
  }

  send({type:"progress",requestId,progress:.52,stage:"Encoding spreadsheet output"});

  if(["csv","tsv","json-data"].includes(targetFormatId)){
    const main=flatBlob(wb.Sheets[sheets[0]],targetFormatId,{...options,formulaMode:"values"});
    const extraFiles:Array<{name:string;blob:Blob}>=[];
    if(options.sheetPolicy==="all"&&sheets.length>1){
      const ext=targetFormatId==="json-data"?"json":targetFormatId;
      for(const name of sheets.slice(1)){
        extraFiles.push({
          name:name.replace(/[\\/:*?"<>|]/g,"_")+"."+ext,
          blob:flatBlob(wb.Sheets[name],targetFormatId,{...options,formulaMode:"values"})
        });
      }
      warnings.push("Multi-sheet workbook exported as one primary file plus sidecar files.");
    }
    return {blob:main,warnings,extraFiles};
  }

  const out=cloneWorkbookForSheets(wb,sheets,options.formulaMode);
  const bookType=BOOK_TYPE[targetFormatId];
  if(!bookType) throw new Error("SPREADSHEET_TARGET_UNSUPPORTED: "+targetFormatId);
  const data=XLSX.write(out,{
    type:"array",
    bookType,
    compression:true,
    cellStyles:true,
    bookVBA:false
  } as any);
  return {
    blob:blobFromArray(data,MIME[targetFormatId]||"application/octet-stream"),
    warnings,
    extraFiles:[]
  };
}

scope.onmessage=async(event)=>{
  const request=event.data;
  try{
    if(request.type==="inspect"){
      send({type:"inspection",requestId:request.requestId,inspection:await inspect(request.source,request.formatId)});
    }else{
      const result=await convert(
        request.source,
        request.sourceFormatId,
        request.targetFormatId,
        request.options,
        request.requestId
      );
      send({type:"progress",requestId:request.requestId,progress:.96,stage:"Finalizing spreadsheet"});
      send({type:"result",requestId:request.requestId,...result});
    }
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    send({type:"error",requestId:request.requestId,code:message.split(":")[0]||"SHEETJS_FAILED",message});
  }
};
