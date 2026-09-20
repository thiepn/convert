import type { DocumentConversionOptions } from "../core/document/types";
import type { PandocWorkerRequest, PandocWorkerResponse } from "../engines/document/pandoc-protocol";
import { createPandocRuntime } from "../engines/document/pandoc-runtime";

const scope=globalThis as unknown as {
  postMessage(message:PandocWorkerResponse):void;
  onmessage:((event:MessageEvent<PandocWorkerRequest>)=>void)|null;
};

let runtimePromise:Promise<Awaited<ReturnType<typeof createPandocRuntime>>>|null=null;
let loadedUrl="";

const INPUT_FORMAT:Record<string,string>={
  docx:"docx",docm:"docx",odt:"odt",rtf:"rtf","html-doc":"html",
  markdown:"markdown",txt:"plain",latex:"latex",typst:"typst",epub:"epub",
  pptx:"pptx",pptm:"pptx"
};
const OUTPUT_FORMAT:Record<string,string>={
  docx:"docx",odt:"odt",rtf:"rtf","html-doc":"html",
  markdown:"markdown",txt:"plain",latex:"latex",typst:"typst",epub:"epub",pptx:"pptx"
};
const EXTENSION:Record<string,string>={
  docx:"docx",odt:"odt",rtf:"rtf","html-doc":"html",markdown:"md",txt:"txt",
  latex:"tex",typst:"typ",epub:"epub",pptx:"pptx"
};
const MIME:Record<string,string>={
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt:"application/vnd.oasis.opendocument.text",
  rtf:"application/rtf",
  "html-doc":"text/html;charset=utf-8",
  markdown:"text/markdown;charset=utf-8",
  txt:"text/plain;charset=utf-8",
  latex:"application/x-latex;charset=utf-8",
  typst:"text/x-typst;charset=utf-8",
  epub:"application/epub+zip",
  pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

function send(message:PandocWorkerResponse){scope.postMessage(message);}

async function getPandoc(url:string){
  if(runtimePromise&&loadedUrl===url) return runtimePromise;
  loadedUrl=url;
  runtimePromise=(async()=>{
    const response=await fetch(url,{credentials:"same-origin"});
    if(!response.ok) throw new Error("PANDOC_WASM_LOAD_FAILED: "+response.status);
    return createPandocRuntime(await response.arrayBuffer());
  })();
  return runtimePromise;
}

function outputName(targetFormatId:string){
  return "output."+EXTENSION[targetFormatId];
}

function warningsFrom(result:any):string[]{
  const values:string[]=[];
  for(const warning of result.warnings??[]){
    if(typeof warning==="string") values.push(warning);
    else{
      try{values.push(JSON.stringify(warning));}catch{values.push(String(warning));}
    }
  }
  if(result.stderr?.trim()) values.push(result.stderr.trim());
  return values;
}

function isTextInput(formatId:string){
  return ["html-doc","markdown","txt","latex","typst"].includes(formatId);
}

async function convertDocument(request:Extract<PandocWorkerRequest,{type:"convert"}>){
  const from=INPUT_FORMAT[request.sourceFormatId];
  const to=OUTPUT_FORMAT[request.targetFormatId];
  if(!from||!to) throw new Error("PANDOC_ROUTE_UNSUPPORTED: Unsupported semantic document route.");

  send({type:"progress",requestId:request.requestId,progress:.06,stage:"Loading Pandoc WASM"});
  const pandoc=await getPandoc(request.pandocWasmUrl);
  send({type:"progress",requestId:request.requestId,progress:.18,stage:"Preparing semantic document model"});

  const files:Record<string,string|Blob>={};
  let stdin:string|null=null;
  if(isTextInput(request.sourceFormatId)){
    stdin=await request.source.text();
  }else{
    files[request.sourceName]=request.source;
  }

  for(const resource of request.options.resources??[]){
    const safeName=resource.name.replace(/^[/\\]+/,"").replace(/\.\.(?:[/\\]|$)/g,"_");
    files[safeName]=resource.blob;
  }

  const output=outputName(request.targetFormatId);
  const options:Record<string,unknown>={
    from,
    to,
    "output-file":output,
    standalone:request.options.standalone,
    "table-of-contents":request.options.tableOfContents
  };
  if(!isTextInput(request.sourceFormatId)){
    options["input-files"]=[request.sourceName];
  }

  if(["docx","docm"].includes(request.sourceFormatId)){
    options["track-changes"]=request.options.trackChanges;
  }

  if(request.options.referenceDocument&&["docx","odt","pptx"].includes(request.targetFormatId)){
    const rawReferenceName=request.options.referenceDocumentName||("reference."+EXTENSION[request.targetFormatId]);
    const referenceName=rawReferenceName.replace(/^[/\\]+/,"").replace(/\.\.(?:[/\\]|$)/g,"_");
    files[referenceName]=request.options.referenceDocument;
    options["reference-doc"]=referenceName;
  }

  const extractAssets=request.options.assets==="extract"&&["markdown","latex","typst","html-doc"].includes(request.targetFormatId);
  if(extractAssets) options["extract-media"]="media";
  if(request.options.assets==="embed"&&request.targetFormatId==="html-doc"){
    options["embed-resources"]=true;
  }

  send({type:"progress",requestId:request.requestId,progress:.35,stage:"Converting document semantically"});
  const result=await pandoc.convert(options,stdin,files);
  const value=result.files[output];
  let blob:Blob;
  if(value instanceof Blob) blob=value;
  else if(typeof value==="string") blob=new Blob([value],{type:MIME[request.targetFormatId]||"application/octet-stream"});
  else if(result.stdout) blob=new Blob([result.stdout],{type:MIME[request.targetFormatId]||"text/plain;charset=utf-8"});
  else throw new Error("PANDOC_OUTPUT_MISSING: Pandoc produced no main output.");

  if(!blob.type||blob.type==="application/octet-stream"){
    blob=new Blob([await blob.arrayBuffer()],{type:MIME[request.targetFormatId]||"application/octet-stream"});
  }

  const extraFiles=Object.entries(result.mediaFiles??{}).map(([name,file])=>({
    name:name.replace(/^media\//,""),
    blob:file
  }));

  send({type:"progress",requestId:request.requestId,progress:.95,stage:"Finalizing semantic output"});
  return {blob,warnings:warningsFrom(result),extraFiles};
}

scope.onmessage=async(event)=>{
  const request=event.data;
  try{
    const result=await convertDocument(request);
    send({type:"result",requestId:request.requestId,...result});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    send({type:"error",requestId:request.requestId,code:message.split(":")[0]||"PANDOC_FAILED",message});
  }
};
