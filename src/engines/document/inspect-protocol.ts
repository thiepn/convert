import type { DetailedDocumentInspection } from "../../core/document/types";

export type DocumentInspectRequest={
  type:"inspect";
  requestId:string;
  source:Blob;
  formatId:string;
};

export type DocumentInspectResponse=
  | {type:"inspection";requestId:string;inspection:DetailedDocumentInspection}
  | {type:"error";requestId:string;code:string;message:string};
