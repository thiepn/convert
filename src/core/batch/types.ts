import type { ConversionOutput } from "../jobs/types";

export type BatchExecutionMode="auto"|"sequential";
export type BatchTaskState="pending"|"running"|"completed"|"failed"|"cancelled";

export type PipelineStep =
  | {kind:"select-sheet";label:string}
  | {kind:"select-table";label:string}
  | {kind:"filter";label:string}
  | {kind:"resize";label:string}
  | {kind:"quality";label:string}
  | {kind:"metadata";label:string}
  | {kind:"compress";label:string}
  | {kind:"convert";label:string}
  | {kind:"package";label:string};

export interface BatchPipeline {
  targetFormatId:string;
  quality:number;
  options:Record<string,unknown>;
  namingTemplate:string;
  executionMode:BatchExecutionMode;
  packageResults:boolean;
  steps:PipelineStep[];
}

export interface BatchTaskSnapshot {
  id:string;
  index:number;
  sourceName:string;
  sourceFormatId:string|null;
  state:BatchTaskState;
  progress:number;
  stage:string;
  attempts:number;
  outputName?:string;
  error?:string;
  warnings:string[];
  exclusive:boolean;
}

export interface BatchSnapshot {
  total:number;
  pending:number;
  running:number;
  completed:number;
  failed:number;
  cancelled:number;
  progress:number;
  stage:string;
  resumable:boolean;
  tasks:BatchTaskSnapshot[];
}

export interface BatchFailure {
  name:string;
  error:string;
}

export interface BatchRunResult {
  outputs:ConversionOutput[];
  failures:BatchFailure[];
  tasks:BatchTaskSnapshot[];
  cancelled:boolean;
}
