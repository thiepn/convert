import type { ImageConversionSettings, ImageMetadataSummary } from "../../core/image/types";

export interface VipsConvertMessage {
  type: "convert";
  jobId: string;
  source: Blob;
  sourceFormatId: string;
  targetFormatId: string;
  targetMime: string;
  settings: ImageConversionSettings;
  assetBaseUrl: string;
  dynamicLibraries: string[];
  concurrency: number;
}

export type VipsWorkerRequest = VipsConvertMessage;

export type VipsWorkerResponse =
  | { type: "progress"; jobId: string; progress: number; stage: string }
  | {
      type: "result";
      jobId: string;
      blob: Blob;
      width: number;
      height: number;
      frameCount: number;
      hasAlpha: boolean;
      bitDepth?: number;
      metadata: ImageMetadataSummary;
      actualQuality?: number;
    }
  | { type: "error"; jobId: string; code: string; message: string };
