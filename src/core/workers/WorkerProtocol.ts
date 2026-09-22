export interface ConvertImageMessage {
  type: "convert-image";
  jobId: string;
  source: Blob;
  targetMime: string;
  quality: number;
  maxDimension?: number;
  background?: string;
}

export interface CancelMessage {
  type: "cancel";
  jobId: string;
}

export type WorkerRequest = ConvertImageMessage | CancelMessage;

export type WorkerResponse =
  | { type: "progress"; jobId: string; progress: number; stage: string }
  | { type: "result"; jobId: string; blob: Blob; width: number; height: number }
  | { type: "error"; jobId: string; code: string; message: string };
