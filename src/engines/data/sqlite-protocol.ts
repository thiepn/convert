import type { DataConversionOptions, DetailedDatabaseInspection, DetailedDataInspection } from "../../core/data/types";

export type SqliteWorkerRequest=
  | {type:"inspect";requestId:string;source:Blob;formatId:"sqlite";wasmUrl:string}
  | {
      type:"convert";
      requestId:string;
      source:Blob;
      sourceFormatId:"sqlite"|"json-data"|"jsonl";
      targetFormatId:"sqlite"|"csv"|"tsv"|"json-data"|"jsonl";
      options:DataConversionOptions;
      wasmUrl:string;
    }
  | {
      type:"preview";
      requestId:string;
      source:Blob;
      table:string;
      wasmUrl:string;
    };

export type SqliteWorkerResponse=
  | {type:"database-inspection";requestId:string;inspection:DetailedDatabaseInspection}
  | {type:"data-inspection";requestId:string;inspection:DetailedDataInspection}
  | {type:"progress";requestId:string;progress:number;stage:string}
  | {type:"result";requestId:string;blob:Blob;warnings:string[]}
  | {type:"error";requestId:string;code:string;message:string};
