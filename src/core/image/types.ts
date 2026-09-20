export type MetadataPolicy = "preserve" | "privacy" | "strip";
export type ResizeMode = "original" | "longest-edge" | "width" | "height" | "percentage";

export interface ImageResizeSettings {
  mode: ResizeMode;
  value?: number;
  allowUpscale?: boolean;
}

export interface ImageConversionSettings {
  quality: number;
  metadataPolicy: MetadataPolicy;
  resize: ImageResizeSettings;
  background: string;
  lossless: boolean;
  targetBytes?: number | null;
  autoOrient: boolean;
  preserveAnimation: boolean;
}

export interface ImageMetadataSummary {
  exif: boolean;
  xmp: boolean;
  iptc: boolean;
  icc: boolean;
  gps: boolean;
}

export interface ImageTraits {
  alpha?: boolean;
  animated?: boolean;
  hdr?: boolean;
  multiplePages?: boolean;
  frameCount?: number;
}

export interface ImageInspectionDetails extends ImageTraits {
  width?: number;
  height?: number;
  bitDepth?: number;
  orientation?: number;
  colorSpace?: string;
  metadata: ImageMetadataSummary;
}

export function defaultImageSettings(): ImageConversionSettings {
  return {
    quality: 0.82,
    metadataPolicy: "privacy",
    resize: { mode: "original", allowUpscale: false },
    background: "#ffffff",
    lossless: false,
    targetBytes: null,
    autoOrient: true,
    preserveAnimation: true
  };
}

export function traitsFromImageInspection(image?: ImageInspectionDetails): ImageTraits | undefined {
  if (!image) return undefined;
  return {
    alpha: image.alpha,
    animated: image.animated,
    hdr: image.hdr,
    multiplePages: image.multiplePages,
    frameCount: image.frameCount
  };
}
