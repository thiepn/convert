import { createWorker, OEM, type Worker } from "tesseract.js";

export interface OcrPageResult {
  pdf:Blob;
  text:string;
  confidence:number|null;
}

export class PdfOcrEngine {
  private worker:Worker|null=null;
  private language="";
  private progress?: (progress:number,status:string)=>void;

  async prepare(language:string,onProgress?:(progress:number,status:string)=>void):Promise<void>{
    if(this.worker&&this.language===language){
      this.progress=onProgress;
      return;
    }
    await this.dispose();
    this.language=language;
    this.progress=onProgress;

    const base=new URL("engines/tesseract/",document.baseURI);
    const workerPath=new URL("worker.min.js",base).href;
    const corePath=new URL("core/",base).href;
    const langPath=new URL("lang",base).href.replace(/\/$/,"");

    this.worker=await createWorker(
      language,
      OEM.LSTM_ONLY,
      {
        workerPath,
        corePath,
        langPath,
        gzip:true,
        logger:message=>{
          const value=typeof message.progress==="number"?message.progress:0;
          this.progress?.(value,String(message.status??"OCR"));
        }
      } as any
    );
  }

  async recognize(image:Blob,title:string):Promise<OcrPageResult>{
    if(!this.worker) throw new Error("OCR_NOT_READY: OCR worker has not been initialized.");
    const result=await this.worker.recognize(
      image,
      {pdfTitle:title,pdfTextOnly:false} as any,
      {text:true,pdf:true,blocks:true} as any
    );
    const data:any=result.data;
    const pdfBytes:Uint8Array|undefined=data.pdf;
    if(!pdfBytes) throw new Error("OCR_PDF_FAILED: Tesseract did not return searchable PDF output.");
    const buffer=new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(buffer).set(pdfBytes);
    return {
      pdf:new Blob([buffer],{type:"application/pdf"}),
      text:String(data.text??""),
      confidence:typeof data.confidence==="number"?data.confidence:null
    };
  }

  async dispose():Promise<void>{
    const worker=this.worker;
    this.worker=null;
    this.language="";
    if(worker){
      try{await worker.terminate();}catch{}
    }
  }
}
