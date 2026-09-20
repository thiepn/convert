export type FormatCategory =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "pdf"
  | "archive"
  | "spreadsheet"
  | "data"
  | "database";

export interface FormatCapabilities {
  alpha?: boolean;
  animation?: boolean;
  hdr?: boolean;
  metadata?: boolean;
  multiplePages?: boolean;
  multipleStreams?: boolean;
  subtitles?: boolean;
  chapters?: boolean;
  layers?: boolean;
  formulas?: boolean;
  macros?: boolean;
}

export interface ByteSignature {
  offset: number;
  bytes: number[];
}

export interface FormatDefinition {
  id: string;
  name: string;
  category: FormatCategory;
  extensions: string[];
  mimeTypes: string[];
  signatures: ByteSignature[][];
  capabilities: FormatCapabilities;
}

export interface FormatDetection {
  format: FormatDefinition | null;
  confidence: number;
  reasons: string[];
  warnings: string[];
}
