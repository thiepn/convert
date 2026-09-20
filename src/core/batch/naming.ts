function stem(name:string):string {
  const slash=Math.max(name.lastIndexOf("/"),name.lastIndexOf("\\"));
  const base=slash>=0?name.slice(slash+1):name;
  const dot=base.lastIndexOf(".");
  return dot>0?base.slice(0,dot):base;
}

function extension(name:string):string {
  const slash=Math.max(name.lastIndexOf("/"),name.lastIndexOf("\\"));
  const base=slash>=0?name.slice(slash+1):name;
  const dot=base.lastIndexOf(".");
  return dot>0?base.slice(dot+1):"";
}

function safe(value:string):string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_")
    .replace(/\s+/g," ")
    .replace(/[. ]+$/g,"")
    .slice(0,180)
    ||"output";
}

export interface NamingContext {
  sourceName:string;
  targetExtension:string;
  targetFormatId:string;
  index:number;
  total:number;
  date?:Date;
}

export function renderBatchName(template:string,context:NamingContext):string {
  const date=context.date??new Date();
  const tokens:Record<string,string>={
    name:stem(context.sourceName),
    sourceExt:extension(context.sourceName),
    ext:context.targetExtension.replace(/^\./,""),
    format:context.targetFormatId,
    index:String(context.index+1),
    total:String(context.total),
    date:[
      date.getFullYear(),
      String(date.getMonth()+1).padStart(2,"0"),
      String(date.getDate()).padStart(2,"0")
    ].join("-")
  };

  let value=(template.trim()||"{name}-converted").replace(
    /\{(name|sourceExt|ext|format|index|total|date)(?::(\d{1,3}))?\}/g,
    (_match,key:string,width:string|undefined)=>{
      const raw=tokens[key]??"";
      if(width&&key==="index") return raw.padStart(Math.min(6,Math.max(1,Number(width))),"0");
      return raw;
    }
  );

  value=safe(value);
  const targetExt=context.targetExtension.replace(/^\./,"");
  if(targetExt&&!value.toLowerCase().endsWith("."+targetExt.toLowerCase())){
    value+="."+targetExt;
  }
  return value;
}

export function uniqueBatchName(name:string,used:Set<string>):string {
  const lower=(value:string)=>value.toLocaleLowerCase("en-US");
  if(!used.has(lower(name))){
    used.add(lower(name));
    return name;
  }

  const dot=name.lastIndexOf(".");
  const base=dot>0?name.slice(0,dot):name;
  const ext=dot>0?name.slice(dot):"";
  let index=2;
  while(true){
    const candidate=base+"-"+index+ext;
    if(!used.has(lower(candidate))){
      used.add(lower(candidate));
      return candidate;
    }
    index++;
  }
}
