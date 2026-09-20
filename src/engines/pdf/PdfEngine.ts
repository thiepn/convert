import { createQpdfRunner } from "qpdf-run";
import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type {
  DetailedPdfInspection,
  PdfCreateImage,
  PdfOcrOptions,
  PdfRenderOptions,
  PdfSplitRange,
  PdfTextResult
} from "../../core/pdf/types";
import { PdfOcrEngine } from "./PdfOcrEngine";
import { assertMemoryBackedSource } from "../../core/performance/Budget";
import type { PdfWorkerRequest, PdfWorkerResponse } from "./protocol";

const DIRECT_INPUTS=new Set(["jpeg","png","pdf"]);

export class PdfEngine implements ConversionEngine {
  readonly id="pdf-engine";
  readonly version="pdfjs-6.3.289+pdf-lib-1.17.1+qpdf-run-0.2.1";
  private worker:Worker|null=null;
  private pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
  private pdfWorkerUrl="";
  private qpdfBase="";
  private ocr=new PdfOcrEngine();
  private qpdfRunner:Awaited<ReturnType<typeof createQpdfRunner>>|null=null;
  private cancelEpoch=0;

  async prepare():Promise<void>{
    this.pdfWorkerUrl=new URL("engines/pdfjs/pdf.worker.min.mjs",document.baseURI).href;
    this.qpdfBase=new URL("engines/qpdf/",document.baseURI).href;
  }

  isAvailable():boolean{
    return typeof Worker!=="undefined"&&typeof WebAssembly!=="undefined";
  }

  canConvert(from:string,to:string):boolean{
    return (DIRECT_INPUTS.has(from)&&to==="pdf")||(from==="pdf"&&to==="pdf");
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    const memoryBytes=Math.max(source.size*2,192*1024*1024);
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:Math.max(96*1024*1024,source.size*1.25),
      outputBytes:source.size,
      sourceAccess:"buffered",
      outputAccess:"buffered",
      notes:["PDF.js/pdf-lib and qpdf WASM use memory-backed byte arrays; large PDFs are device-budgeted."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(request.targetFormatId!=="pdf") throw new Error("PDF_ROUTE_UNSUPPORTED: Target must be PDF.");
    const options=request.options??{};

    let blob:Blob;
    const warnings:string[]=[];

    if(request.sourceFormatId==="jpeg"||request.sourceFormatId==="png"){
      blob=await this.imagesToPdf([{
        blob:request.source,
        format:request.sourceFormatId,
        name:"image"
      }],"auto",0);
    }else if(request.sourceFormatId==="pdf"){
      const operation=String(options.pdfOperation??"optimize");
      if(operation==="flatten-forms"){
        blob=await this.flattenForms(request.source,String(options.password??"")||undefined);
      }else if(operation==="linearize"){
        blob=await this.qpdfTransform(request.source,["--linearize"],String(options.password??"")||undefined);
      }else if(operation==="repair"){
        blob=await this.qpdfTransform(request.source,[],String(options.password??"")||undefined);
      }else if(operation==="decrypt"){
        const password=String(options.password??"");
        if(!password) throw new Error("PDF_PASSWORD_REQUIRED: Password is required for decryption.");
        blob=await this.decrypt(request.source,password);
      }else if(operation==="encrypt"){
        const password=String(options.newPassword??"");
        if(!password) throw new Error("PDF_PASSWORD_REQUIRED: New password is required for encryption.");
        blob=await this.encrypt(request.source,password,String(options.password??"")||undefined);
      }else{
        blob=await this.qpdfTransform(
          request.source,
          ["--object-streams=generate","--stream-data=compress"],
          String(options.password??"")||undefined
        );
      }
    }else{
      throw new Error("PDF_ROUTE_UNSUPPORTED: This input requires an image normalization step before PDF creation.");
    }

    if(request.outputHandle){
      const writer=await request.outputHandle.createWritable();
      await writer.write(blob);
      await writer.close();
      blob=await request.outputHandle.getFile();
      return {blob,warnings,outputInWorkspace:true};
    }
    return {blob,warnings};
  }

  async inspect(source:Blob,password?:string):Promise<DetailedPdfInspection>{
    this.assertPdfMemory(source,"inspect");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"inspect",requestId,source,password,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<DetailedPdfInspection>;
  }

  async render(source:Blob,options:PdfRenderOptions):Promise<{blob:Blob;width:number;height:number}>{
    this.assertPdfMemory(source,"render");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"render",requestId,source,options,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<{blob:Blob;width:number;height:number}>;
  }

  async extractText(source:Blob,password?:string):Promise<PdfTextResult>{
    this.assertPdfMemory(source,"text extraction");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"extract-text",requestId,source,password,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<PdfTextResult>;
  }

  async merge(sources:Blob[]):Promise<Blob>{
    for(const source of sources) this.assertPdfMemory(source,"merge");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"merge",requestId,sources,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<Blob>;
  }

  async split(source:Blob,ranges:PdfSplitRange[],password?:string):Promise<Array<{name:string;blob:Blob}>>{
    this.assertPdfMemory(source,"split");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"split",requestId,source,ranges,password,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<Array<{name:string;blob:Blob}>>;
  }

  async reorder(source:Blob,order:number[],password?:string):Promise<Blob>{
    this.assertPdfMemory(source,"reorder");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"reorder",requestId,source,order,password,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<Blob>;
  }

  async rotate(source:Blob,pages:number[],degrees:90|180|270,password?:string):Promise<Blob>{
    this.assertPdfMemory(source,"rotate");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"rotate",requestId,source,pages,degrees,password,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<Blob>;
  }

  async flattenForms(source:Blob,password?:string):Promise<Blob>{
    this.assertPdfMemory(source,"form flattening");
    const requestId=crypto.randomUUID();
    return this.request({
      type:"flatten-forms",requestId,source,password,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<Blob>;
  }

  async imagesToPdf(images:PdfCreateImage[],pageSize:"auto"|"a4"|"letter",margin:number):Promise<Blob>{
    const requestId=crypto.randomUUID();
    return this.request({
      type:"images-to-pdf",requestId,images,pageSize,margin,pdfWorkerUrl:this.pdfWorkerUrl
    }) as Promise<Blob>;
  }

  async exportPages(
    source:Blob,
    format:"png"|"jpeg"|"webp",
    dpi:number,
    quality:number,
    pages:number[],
    password?:string,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<Array<{name:string;blob:Blob}>>{
    const outputs=[];
    for(let index=0;index<pages.length;index++){
      const page=pages[index];
      onProgress?.(index/pages.length,"Rendering page "+page);
      const rendered=await this.render(source,{page,dpi,format,quality,password});
      const extension=format==="jpeg"?"jpg":format;
      outputs.push({name:"page-"+String(page).padStart(3,"0")+"."+extension,blob:rendered.blob});
    }
    onProgress?.(1,"Rendered pages");
    return outputs;
  }

  async ocrSearchable(
    source:Blob,
    options:PdfOcrOptions,
    password?:string,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<{blob:Blob;text:string;pages:number[]}>{
    const inspection=await this.inspect(source,password);
    const pages=options.pages==="all"
      ? inspection.pagesInfo.map(page=>page.page)
      : inspection.pagesInfo.filter(page=>page.scanned).map(page=>page.page);
    if(!pages.length) return {blob:source,text:"",pages:[]};

    const replacements:Array<{page:number;pdf:Blob}>=[];
    const texts:string[]=[];
    let currentOcrIndex=0;
    await this.ocr.prepare(options.language,(progress,status)=>{
      onProgress?.((currentOcrIndex+progress)/Math.max(1,pages.length),status);
    });

    try{
      for(let index=0;index<pages.length;index++){
        currentOcrIndex=index;
        const page=pages[index];
        const base=index/pages.length;
        onProgress?.(base,"Rendering page "+page+" for OCR");
        const rendered=await this.render(source,{
          page,
          dpi:options.dpi,
          format:"png",
          quality:1,
          password
        });
        const ocr=await this.ocr.recognize(rendered.blob,"Page "+page);
        replacements.push({page,pdf:ocr.pdf});
        texts.push(ocr.text);
        onProgress?.((index+1)/pages.length,"OCR page "+page+" complete");
      }

      const requestId=crypto.randomUUID();
      const blob=await this.request({
        type:"combine-pages",
        requestId,
        original:source,
        replacements,
        password,
        pdfWorkerUrl:this.pdfWorkerUrl
      }) as Blob;
      return {blob,text:texts.join("\n\n"),pages};
    }finally{
      await this.ocr.dispose();
    }
  }

  async optimize(source:Blob,password?:string):Promise<Blob>{
    return this.qpdfTransform(source,["--object-streams=generate","--stream-data=compress"],password);
  }

  async linearize(source:Blob,password?:string):Promise<Blob>{
    return this.qpdfTransform(source,["--linearize"],password);
  }

  async repair(source:Blob,password?:string):Promise<Blob>{
    return this.qpdfTransform(source,[],password);
  }

  async decrypt(source:Blob,password:string):Promise<Blob>{
    return this.qpdfTransform(source,["--decrypt"],password);
  }

  async encrypt(source:Blob,newPassword:string,currentPassword?:string):Promise<Blob>{
    this.assertQpdfMemory(source);
    const owner="owner-"+crypto.randomUUID();
    const prefix=currentPassword?["--password="+currentPassword]:[];
    return this.qpdfTransform(
      source,
      [...prefix,"--encrypt",newPassword,owner,"256"],
      undefined,
      true
    );
  }

  cancelActive():void{
    this.cancelEpoch++;
    this.worker?.terminate();
    this.worker=null;
    const error=new DOMException("PDF operation cancelled.","AbortError");
    for(const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    void this.ocr.dispose();

    const runner=this.qpdfRunner;
    this.qpdfRunner=null;
    if(runner) void runner.destroy().catch(()=>{});
  }

  dispose():void{
    this.cancelActive();
  }

  private async qpdfTransform(
    source:Blob,
    options:string[],
    password?:string,
    optionsContainPassword=false
  ):Promise<Blob>{
    this.assertQpdfMemory(source);
    const epoch=this.cancelEpoch;
    const bytes=new Uint8Array(await source.arrayBuffer());
    if(epoch!==this.cancelEpoch) throw new DOMException("PDF operation cancelled.","AbortError");
    const runner=await createQpdfRunner({
      workerUrl:new URL("worker.js",this.qpdfBase).href,
      qpdfJsUrl:new URL("lib/qpdf.js",this.qpdfBase).href,
      wasmUrl:new URL("lib/qpdf.wasm",this.qpdfBase).href,
      timeoutMs:120000
    } as any);
    if(epoch!==this.cancelEpoch){
      try{await runner.destroy();}catch{}
      throw new DOMException("PDF operation cancelled.","AbortError");
    }
    this.qpdfRunner=runner;
    try{
      const passwordArgs=password&&!optionsContainPassword?["--password="+password]:[];
      const output=await runner.runOne({
        input:bytes,
        inputName:"input.pdf",
        outputName:"output.pdf",
        args:[...passwordArgs,...options,"--","input.pdf","output.pdf"]
      } as any);
      const outputBytes=output as Uint8Array;
      const buffer=new ArrayBuffer(outputBytes.byteLength);
      new Uint8Array(buffer).set(outputBytes);
      return new Blob([buffer],{type:"application/pdf"});
    }finally{
      if(this.qpdfRunner===runner) this.qpdfRunner=null;
      try{await runner.destroy();}catch{}
    }
  }

  private assertPdfMemory(source:Blob,operation:string){
    assertMemoryBackedSource(source.size,"PDF "+operation,2,1024*1024*1024);
  }

  private assertQpdfMemory(source:Blob){
    assertMemoryBackedSource(source.size,"qpdf structural processing",3,512*1024*1024);
  }

  private getWorker():Worker{
    if(this.worker) return this.worker;
    const worker=new Worker(new URL("../../workers/pdf.worker.ts",import.meta.url),{type:"module"});
    worker.onmessage=(event:MessageEvent<PdfWorkerResponse>)=>{
      const message=event.data;
      const pending=this.pending.get(message.requestId);
      if(!pending) return;
      this.pending.delete(message.requestId);
      if(message.type==="error") pending.reject(new Error(message.code+": "+message.message));
      else if(message.type==="inspection") pending.resolve(message.inspection);
      else if(message.type==="render") pending.resolve({blob:message.blob,width:message.width,height:message.height});
      else if(message.type==="text") pending.resolve(message.result);
      else if(message.type==="pdf") pending.resolve(message.blob);
      else pending.resolve(message.outputs);
    };
    worker.onerror=event=>{
      const error=new Error(event.message||"PDF worker crashed.");
      for(const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.worker=null;
      worker.terminate();
    };
    this.worker=worker;
    return worker;
  }

  private request(request:PdfWorkerRequest):Promise<unknown>{
    return new Promise((resolve,reject)=>{
      this.pending.set(request.requestId,{resolve,reject});
      this.getWorker().postMessage(request);
    });
  }
}
