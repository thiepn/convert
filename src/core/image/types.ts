export type MetadataPolicy = "preserve" | "privacy" | "strip";

export interface ImageConversionOptions {
  metadataPolicy: MetadataPolicy;
  maxDimension?: number;
  targetBytes?: number;
  background: string;
  lossless: boolean;
  preserveAnimation: boolean;
}

export interface DetailedImageInspection {
  width: number;
  height: number;
  pageHeight: number;
  frames: number;
  bands: number;
  bitDepth: number | null;
  alpha: boolean;
  colorSpace: string | null;
  orientation: number | null;
  hdr: boolean;
  metadata: {
    exif: boolean;
    xmp: boolean;
    iptc: boolean;
    icc: boolean;
  };
  estimatedDecodedBytes: number;
  engine: string;
  warnings: string[];
}
