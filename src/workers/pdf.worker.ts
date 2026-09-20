import {
  GlobalWorkerOptions,
  getDocument,
  PasswordResponses,
  type PDFDocumentProxy,
  type PDFPageProxy
} from "pdfjs-dist";
import { PDFDocument, degrees } from "pdf-lib";
import type { DetailedPdfInspection, PdfPageInfo } from "../core/pdf/types";
import type { PdfWorkerRequest, PdfWorkerResponse } from "../engines/pdf/protocol";

const scope=globalThis as unknown as {
  postMessage(message:PdfWorkerResponse):void;
  onmessage:((event:MessageEvent<PdfWorkerRequest>)=>void)|null;
};

function send(message:PdfWorkerResponse){ scope.postMessage(message); }

function bytesToBlob(bytes:Uint8Array,type="application/pdf"):Blob {
  const buffer=new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer],{type});
}

async function loadPdf(source:Blob,pdfWorkerUrl:string,password?:string):Promise<PDFDocumentProxy>{
  GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
  const data=new Uint8Array(await source.arrayBuffer());
  const task=getDocument({
    data,
    password,
    isEvalSupported:false,
    useSystemFonts:true,
    stopEvent:undefined
  } as any);
  return task.promise;
}

function itemText(item:any):string {
  return typeof item?.str==="string"?item.str:"";
}

async function pageInfo(page:PDFPageProxy,pageNumber:number):Promise<PdfPageInfo>{
  const viewport=page.getViewport({scale:1});
  const text=await page.getTextContent();
  const strings=(text.items as any[]).map(itemText).filter(Boolean);
  const chars=strings.reduce((sum,value)=>sum+value.trim().length,0);
  const annotations=await page.getAnnotations({intent:"display"}).catch(()=>[]);
  return {
    page:pageNumber,
    width:viewport.width,
    height:viewport.height,
    rotation:viewport.rotation,
    textItems:strings.length,
    textChars:chars,
    annotations:annotations.length,
    scanned:chars<5
  };
}

function countOutline(items:any[]|null):number {
  if(!items) return 0;
  let count=0;
  const walk=(nodes:any[])=>{
    for(const node of nodes){
      count++;
      if(Array.isArray(node.items)) walk(node.items);
    }
  };
  walk(items);
  return count;
}

async function inspectPdf(source:Blob,pdfWorkerUrl:string,password?:string):Promise<DetailedPdfInspection>{
  let doc:PDFDocumentProxy;
  try{
    doc=await loadPdf(source,pdfWorkerUrl,password);
  }catch(error:any){
    const code=error?.code;
    const name=String(error?.name??"");
    if(code===PasswordResponses.NEED_PASSWORD||code===PasswordResponses.INCORRECT_PASSWORD||/PasswordException/i.test(name)){
      throw new Error((code===PasswordResponses.INCORRECT_PASSWORD?"PDF_PASSWORD_INCORRECT":"PDF_PASSWORD_REQUIRED")+": Password-protected PDF.");
    }
    throw error;
  }

  try{
    const metadata=await doc.getMetadata().catch(()=>null as any);
    const outline=await doc.getOutline().catch(()=>null);
    const attachments=await doc.getAttachments().catch(()=>null);
    const fields=await (doc as any).getFieldObjects?.().catch?.(()=>null)??null;
    const js=await (doc as any).getJSActions?.().catch?.(()=>null)??null;
    const permissions=await doc.getPermissions().catch(()=>null);

    const pagesInfo:PdfPageInfo[]=[];
    let annotationCount=0;
    let signatures=0;
    for(let number=1;number<=doc.numPages;number++){
      const page=await doc.getPage(number);
      const info=await pageInfo(page,number);
      pagesInfo.push(info);
      annotationCount+=info.annotations;
      try{
        const annotations=await page.getAnnotations({intent:"display"});
        signatures+=annotations.filter((a:any)=>a?.fieldType==="Sig"||a?.subtype==="Widget"&&/signature/i.test(String(a?.fieldName??""))).length;
      }catch{}
      page.cleanup();
    }

    const textPages=pagesInfo.filter(page=>!page.scanned).length;
    const scannedPages=pagesInfo.length-textPages;
    const info=(metadata as any)?.info??{};
    return {
      pages:doc.numPages,
      version:String(info.PDFFormatVersion??info.Version??"")||null,
      title:info.Title??null,
      author:info.Author??null,
      subject:info.Subject??null,
      creator:info.Creator??null,
      producer:info.Producer??null,
      textPages,
      scannedPages,
      mixed:textPages>0&&scannedPages>0,
      forms:fields?Object.keys(fields).length:0,
      annotations:annotationCount,
      signatures,
      attachments:attachments?Object.keys(attachments).length:0,
      outlineItems:countOutline(outline),
      javascriptActions:js?Object.keys(js).length:0,
      permissions:permissions??null,
      pagesInfo,
      encrypted:Boolean(password),
      passwordRequired:false,
      engine:"PDF.js 6.3.289 + pdf-lib",
      warnings:js&&Object.keys(js).length?["Embedded PDF JavaScript/actions were detected but are never executed."]:[]
    };
  }finally{
    await doc.destroy();
  }
}

async function renderPage(source:Blob,pdfWorkerUrl:string,options:any){
  const doc=await loadPdf(source,pdfWorkerUrl,options.password);
  try{
    if(options.page<1||options.page>doc.numPages) throw new Error("PDF_PAGE_INVALID: Page is out of range.");
    const page=await doc.getPage(options.page);
    const scale=Math.max(.25,Math.min(12,options.dpi/72));
    const viewport=page.getViewport({scale});
    const pixels=viewport.width*viewport.height;
    if(pixels>100_000_000) throw new Error("PDF_RENDER_LIMIT: Requested raster page exceeds 100 megapixels.");
    const canvas=new OffscreenCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    const context=canvas.getContext("2d");
    if(!context) throw new Error("PDF_RENDER_FAILED: 2D canvas unavailable.");
    await page.render({canvasContext:context as any,viewport,canvas:canvas as any}).promise;
    const mime=options.format==="jpeg"?"image/jpeg":options.format==="webp"?"image/webp":"image/png";
    const blob=await canvas.convertToBlob({type:mime,quality:options.quality});
    page.cleanup();
    return {blob,width:canvas.width,height:canvas.height};
  }finally{
    await doc.destroy();
  }
}

function reconstructText(items:any[]):string {
  const entries=items
    .filter(item=>typeof item?.str==="string")
    .map(item=>({text:item.str as string,x:Number(item.transform?.[4]??0),y:Number(item.transform?.[5]??0)}))
    .filter(item=>item.text.length>0)
    .sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
  const lines:Array<{y:number;parts:string[]}>=[];

  for(const entry of entries){
    let line=lines.find(candidate=>Math.abs(candidate.y-entry.y)<=2);
    if(!line){line={y:entry.y,parts:[]};lines.push(line);}
    line.parts.push(entry.text);
  }
  return lines.sort((a,b)=>b.y-a.y).map(line=>line.parts.join(" ").replace(/\s+/g," ").trim()).join("\n");
}

async function extractText(source:Blob,pdfWorkerUrl:string,password?:string){
  const doc=await loadPdf(source,pdfWorkerUrl,password);
  try{
    const pages=[];
    for(let number=1;number<=doc.numPages;number++){
      const page=await doc.getPage(number);
      const content=await page.getTextContent();
      pages.push({page:number,text:reconstructText(content.items as any[])});
      page.cleanup();
    }
    return {text:pages.map(page=>page.text).join("\n\n"),pages};
  }finally{await doc.destroy();}
}

async function loadLibPdf(source:Blob,password?:string){
  if(password) throw new Error("PDF_ENCRYPTED: Decrypt with qpdf before pdf-lib structural edits.");
  return PDFDocument.load(await source.arrayBuffer(),{ignoreEncryption:false});
}

async function mergePdfs(sources:Blob[]){
  const out=await PDFDocument.create();
  for(const source of sources){
    const input=await loadLibPdf(source);
    const indices=input.getPageIndices();
    const copied=await out.copyPages(input,indices);
    copied.forEach(page=>out.addPage(page));
  }
  return bytesToBlob(await out.save({useObjectStreams:true}));
}

async function splitPdf(source:Blob,ranges:any[],password?:string){
  const input=await loadLibPdf(source,password);
  const outputs:Array<{name:string;blob:Blob}>=[];
  for(const range of ranges){
    const out=await PDFDocument.create();
    const indices=range.pages.map((page:number)=>page-1).filter((page:number)=>page>=0&&page<input.getPageCount());
    const copied=await out.copyPages(input,indices);
    copied.forEach(page=>out.addPage(page));
    outputs.push({name:range.name,blob:bytesToBlob(await out.save({useObjectStreams:true}))});
  }
  return outputs;
}

async function reorderPdf(source:Blob,order:number[],password?:string){
  const input=await loadLibPdf(source,password);
  const out=await PDFDocument.create();
  const indices=order.map(page=>page-1).filter(page=>page>=0&&page<input.getPageCount());
  const copied=await out.copyPages(input,indices);
  copied.forEach(page=>out.addPage(page));
  return bytesToBlob(await out.save({useObjectStreams:true}));
}

async function rotatePdf(source:Blob,pages:number[],amount:90|180|270,password?:string){
  const pdf=await loadLibPdf(source,password);
  const selected=new Set(pages);
  pdf.getPages().forEach((page,index)=>{
    if(!selected.has(index+1)) return;
    const current=page.getRotation().angle;
    page.setRotation(degrees((current+amount)%360));
  });
  return bytesToBlob(await pdf.save({useObjectStreams:true}));
}

async function flattenForms(source:Blob,password?:string){
  const pdf=await loadLibPdf(source,password);
  const form=pdf.getForm();
  form.flatten();
  return bytesToBlob(await pdf.save({useObjectStreams:true}));
}

async function imagesToPdf(images:any[],pageSize:"auto"|"a4"|"letter",margin:number){
  const pdf=await PDFDocument.create();
  const presets:{[key:string]:[number,number]}={a4:[595.28,841.89],letter:[612,792]};
  for(const item of images){
    const bytes=await item.blob.arrayBuffer();
    const image=item.format==="jpeg"?await pdf.embedJpg(bytes):await pdf.embedPng(bytes);
    const sourceWidth=image.width,sourceHeight=image.height;
    let pageWidth:number,pageHeight:number;
    if(pageSize==="auto"){
      pageWidth=sourceWidth+margin*2;pageHeight=sourceHeight+margin*2;
    }else{
      [pageWidth,pageHeight]=presets[pageSize];
    }
    const page=pdf.addPage([pageWidth,pageHeight]);
    const maxWidth=Math.max(1,pageWidth-margin*2);
    const maxHeight=Math.max(1,pageHeight-margin*2);
    const scale=Math.min(maxWidth/sourceWidth,maxHeight/sourceHeight,1);
    const width=sourceWidth*scale,height=sourceHeight*scale;
    page.drawImage(image,{
      x:(pageWidth-width)/2,
      y:(pageHeight-height)/2,
      width,height
    });
  }
  return bytesToBlob(await pdf.save({useObjectStreams:true}));
}

async function combinePages(original:Blob,replacements:Array<{page:number;pdf:Blob}>,password?:string){
  const input=await loadLibPdf(original,password);
  const out=await PDFDocument.create();
  const replacementMap=new Map(replacements.map(item=>[item.page,item.pdf]));
  for(let pageNo=1;pageNo<=input.getPageCount();pageNo++){
    const replacement=replacementMap.get(pageNo);
    if(replacement){
      const replacementDoc=await PDFDocument.load(await replacement.arrayBuffer());
      const [page]=await out.copyPages(replacementDoc,[0]);
      out.addPage(page);
    }else{
      const [page]=await out.copyPages(input,[pageNo-1]);
      out.addPage(page);
    }
  }
  return bytesToBlob(await out.save({useObjectStreams:true}));
}

scope.onmessage=async(event:MessageEvent<PdfWorkerRequest>)=>{
  const request=event.data;
  try{
    if(request.type==="inspect"){
      send({type:"inspection",requestId:request.requestId,inspection:await inspectPdf(request.source,request.pdfWorkerUrl,request.password)});
    }else if(request.type==="render"){
      const rendered=await renderPage(request.source,request.pdfWorkerUrl,request.options);
      send({type:"render",requestId:request.requestId,...rendered});
    }else if(request.type==="extract-text"){
      send({type:"text",requestId:request.requestId,result:await extractText(request.source,request.pdfWorkerUrl,request.password)});
    }else if(request.type==="merge"){
      send({type:"pdf",requestId:request.requestId,blob:await mergePdfs(request.sources)});
    }else if(request.type==="split"){
      send({type:"pdfs",requestId:request.requestId,outputs:await splitPdf(request.source,request.ranges,request.password)});
    }else if(request.type==="reorder"){
      send({type:"pdf",requestId:request.requestId,blob:await reorderPdf(request.source,request.order,request.password)});
    }else if(request.type==="rotate"){
      send({type:"pdf",requestId:request.requestId,blob:await rotatePdf(request.source,request.pages,request.degrees,request.password)});
    }else if(request.type==="flatten-forms"){
      send({type:"pdf",requestId:request.requestId,blob:await flattenForms(request.source,request.password)});
    }else if(request.type==="images-to-pdf"){
      send({type:"pdf",requestId:request.requestId,blob:await imagesToPdf(request.images,request.pageSize,request.margin)});
    }else if(request.type==="combine-pages"){
      send({type:"pdf",requestId:request.requestId,blob:await combinePages(request.original,request.replacements,request.password)});
    }
  }catch(error:any){
    const message=error instanceof Error?error.message:String(error);
    send({type:"error",requestId:request.requestId,code:message.split(":")[0]||"PDF_ENGINE_FAILED",message});
  }
};
