import type { DetailedDocumentInspection } from "../../core/document/types";
import type { DocumentInspectRequest, DocumentInspectResponse } from "./inspect-protocol";

export class DocumentInspector {
  private worker:Worker|null=null;
  private pending=new Map<string,{resolve:(value:DetailedDocumentInspection)=>void;reject:(error:Error)=>void}>();

  async inspect(source:Blob,formatId:string):Promise<DetailedDocumentInspection>{
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      this.pending.set(requestId,{resolve,reject});
      this.getWorker().postMessage({type:"inspect",requestId,source,formatId} satisfies DocumentInspectRequest);
    });
  }

  dispose():void{
    this.worker?.terminate();
    this.worker=null;
    const error=new DOMException("Document inspector terminated.","AbortError");
    for(const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private getWorker():Worker{
    if(this.worker) return this.worker;
    const worker=new Worker(new URL("../../workers/document-inspect.worker.ts",import.meta.url),{type:"module"});
    worker.onmessage=(event:MessageEvent<DocumentInspectResponse>)=>{
      const message=event.data;
      const pending=this.pending.get(message.requestId);
      if(!pending) return;
      this.pending.delete(message.requestId);
      if(message.type==="error") pending.reject(new Error(message.code+": "+message.message));
      else pending.resolve(message.inspection);
    };
    worker.onerror=event=>{
      const error=new Error(event.message||"Document inspection worker crashed.");
      for(const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      worker.terminate();
      this.worker=null;
    };
    this.worker=worker;
    return worker;
  }
}
