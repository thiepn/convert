import type { DetailedImageInspection, ImageConversionOptions } from "../../core/image/types";

export type ImageWorkerRequest =
  | { type:"inspect"; requestId:string; source:Blob; sourceFormatId:string }
  | { type:"convert"; requestId:string; jobId:string; source:Blob; sourceFormatId:string; targetFormatId:string; quality:number; options:ImageConversionOptions };

export type ImageWorkerResponse =
  | { type:"ready"; requestId:string }
  | { type:"progress"; requestId:string; progress:number; stage:string }
  | { type:"inspection"; requestId:string; inspection:DetailedImageInspection }
  | { type:"result"; requestId:string; blob:Blob; width:number; height:number; warnings:string[] }
  | { type:"error"; requestId:string; code:string; message:string };
