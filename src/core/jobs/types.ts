export type JobState =
  | "CREATED"
  | "INSPECTING"
  | "PLANNING"
  | "PREPARING"
  | "RUNNING"
  | "VALIDATING"
  | "FINALIZING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export interface JobSnapshot {
  id: string;
  state: JobState;
  progress: number;
  stage: string;
}

export interface ConversionOutput {
  blob: Blob;
  fileName: string;
  formatId: string;
  jobId: string;
}
