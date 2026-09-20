export interface ConversionEstimate {
  temporaryBytes: number;
  outputBytes: number | null;
  notes: string[];
}

export interface EngineConvertRequest {
  jobId: string;
  source: Blob;
  sourceFormatId: string;
  targetFormatId: string;
  targetMime: string;
  quality?: number;
  signal: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
}

export interface EngineConvertResult {
  blob: Blob;
  width?: number;
  height?: number;
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
