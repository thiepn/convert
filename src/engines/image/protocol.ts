import type { DetailedImageInspection, ImageConversionOptions } from "../../core/image/types";

type WithBase = { requestId:string; assetBase:string };

export type ImageWorkerRequest =
  | (WithBase & { type:"ping" })
  | (WithBase & { type:"inspect"; source:Blob; sourceFormatId:string })
  | (WithBase & { type:"convert"; jobId:string; source:Blob; sourceFormatId:string; targetFormatId:string; quality:number; options:ImageConversionOptions });

export type ImageWorkerResponse =
  | { type:"ready"; requestId:string }
  | { type:"progress"; requestId:string; progress:number; stage:string }
  | { type:"inspection"; requestId:string; inspection:DetailedImageInspection }
  | { type:"result"; requestId:string; blob:Blob; width:number; height:number; warnings:string[] }
  | { type:"error"; requestId:string; code:string; message:string };
