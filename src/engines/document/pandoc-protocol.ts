import type { DocumentConversionOptions } from "../../core/document/types";

export type PandocWorkerRequest=
  | {
      type:"convert";
      requestId:string;
      source:Blob;
      sourceName:string;
      sourceFormatId:string;
      targetFormatId:string;
      options:DocumentConversionOptions;
    };

export type PandocWorkerResponse=
  | {type:"progress";requestId:string;progress:number;stage:string}
  | {
      type:"result";
      requestId:string;
      blob:Blob;
      warnings:string[];
      extraFiles:Array<{name:string;blob:Blob}>;
    }
  | {type:"error";requestId:string;code:string;message:string};
