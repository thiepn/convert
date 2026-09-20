export interface ConversionEstimate {
  temporaryBytes: number;
  outputBytes: number | null;
  notes: string[];
  memoryBytes?: number;
  workspaceBytes?: number;
  sourceAccess?: "streaming" | "buffered";
  outputAccess?: "streaming" | "buffered";
}

export interface EngineConvertRequest {
  jobId: string;
  source: Blob;
  sourceFormatId: string;
  targetFormatId: string;
  targetMime: string;
  quality?: number;
  options?: Record<string, unknown>;
  outputHandle?: FileSystemFileHandle;
  signal: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
}

export interface EngineConvertResult {
  blob: Blob;
  width?: number;
  height?: number;
  warnings?: string[];
  details?: Record<string, unknown>;
  outputInWorkspace?: boolean;
  extraFiles?: Array<{name:string;blob:Blob}>;
}

export interface ConversionEngine {
  readonly id: string;
  readonly version: string;
  prepare?(): Promise<void>;
  isAvailable(): boolean;
  canConvert(from: string, to: string): boolean;
  estimate(source: Blob, from: string, to: string): Promise<ConversionEstimate>;
  convert(request: EngineConvertRequest): Promise<EngineConvertResult>;
  dispose(): void;
}
