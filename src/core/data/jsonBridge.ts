export interface JsonTabularBridge {
  columns:string[];
  rows:Array<Record<string,unknown>>;
}

function normalizeRow(value:unknown,index:number):Record<string,unknown>{
  if(value&&typeof value==="object"&&!Array.isArray(value)){
    return value as Record<string,unknown>;
  }
  return {value,row_index:index};
}

export function parseJsonTabular(text:string,jsonl:boolean):JsonTabularBridge {
  const values:unknown[]=jsonl
    ?text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>JSON.parse(line))
    :(()=>{
      const parsed=JSON.parse(text);
      return Array.isArray(parsed)?parsed:[parsed];
    })();

  const rows=values.map(normalizeRow);
  const columns:string[]=[];
  const seen=new Set<string>();
  for(const row of rows){
    for(const key of Object.keys(row)){
      if(!seen.has(key)){
        seen.add(key);
        columns.push(key);
      }
    }
  }
  if(!columns.length) columns.push("value");
  if(columns.length>2000) throw new Error("DATA_COLUMN_LIMIT: JSON input contains too many distinct columns.");
  return {columns,rows};
}

function csvCell(value:unknown):string {
  if(value==null) return "";
  let text:string;
  if(typeof value==="object"){
    text=JSON.stringify(value);
  }else{
    text=String(value);
  }
  return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
}

export function jsonTextToCsv(text:string,jsonl:boolean):string {
  const {columns,rows}=parseJsonTabular(text,jsonl);
  const lines=[columns.map(csvCell).join(",")];
  for(const row of rows){
    lines.push(columns.map(column=>csvCell(row[column])).join(","));
  }
  return lines.join("\r\n")+"\r\n";
}
