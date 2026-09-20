import { inspectDocumentBlob } from "../core/document/inspectDocument";
import type { DocumentInspectRequest, DocumentInspectResponse } from "../engines/document/inspect-protocol";

const scope=globalThis as unknown as {
  postMessage(message:DocumentInspectResponse):void;
  onmessage:((event:MessageEvent<DocumentInspectRequest>)=>void)|null;
};

scope.onmessage=async(event)=>{
  const request=event.data;
  try{
    const inspection=await inspectDocumentBlob(request.source,request.formatId);
    scope.postMessage({type:"inspection",requestId:request.requestId,inspection});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    scope.postMessage({
      type:"error",
      requestId:request.requestId,
      code:message.split(":")[0]||"DOCUMENT_INSPECTION_FAILED",
      message
    });
  }
};
