import type { DetailedSpreadsheetInspection, SpreadsheetConversionOptions } from "../../core/data/types";

export type SheetJsWorkerRequest=
  | {type:"inspect";requestId:string;source:Blob;formatId:string}
  | {
      type:"convert";
      requestId:string;
      source:Blob;
      sourceFormatId:string;
      targetFormatId:string;
      options:SpreadsheetConversionOptions;
    };

export type SheetJsWorkerResponse=
  | {type:"inspection";requestId:string;inspection:DetailedSpreadsheetInspection}
  | {type:"progress";requestId:string;progress:number;stage:string}
  | {
      type:"result";
      requestId:string;
      blob:Blob;
      warnings:string[];
      extraFiles:Array<{name:string;blob:Blob}>;
    }
  | {type:"error";requestId:string;code:string;message:string};
