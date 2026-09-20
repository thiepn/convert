import type { DetailedMediaInspection, MediaConversionOptions } from "../../core/media/types";

export interface MediaPlan {
  mode:"remux"|"partial-transcode"|"transcode";
  copyableTracks:number;
  selectedTracks:number;
  warnings:string[];
}

type Base={requestId:string};

export type MediaWorkerRequest =
  | (Base & {type:"inspect";source:Blob})
  | (Base & {type:"plan";source:Blob;targetFormatId:string;options:MediaConversionOptions})
  | (Base & {type:"convert";jobId:string;source:Blob;targetFormatId:string;options:MediaConversionOptions;outputHandle?:FileSystemFileHandle})
  | (Base & {type:"cancel";jobId:string});

export type MediaWorkerResponse =
  | {type:"inspection";requestId:string;inspection:DetailedMediaInspection}
  | {type:"plan";requestId:string;plan:MediaPlan}
  | {type:"progress";requestId:string;progress:number;processedTime:number;stage:string}
  | {type:"result";requestId:string;blob:Blob;warnings:string[];details:Record<string,unknown>;outputInWorkspace:boolean}
  | {type:"cancelled";requestId:string}
  | {type:"error";requestId:string;code:string;message:string};
