import type { ImageInspectionDetails } from "../image/types";

export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceLimitError";
  }
}

export function estimateDecodedImageBytes(image?: ImageInspectionDetails): number | null {
  if (!image?.width || !image.height) return null;
  const bytesPerSample = (image.bitDepth ?? 8) <= 8 ? 1 : (image.bitDepth ?? 8) <= 16 ? 2 : 4;
  const channels = image.alpha ? 4 : 3;
  const frames = Math.max(1, Math.min(image.frameCount ?? 1, 256));
  return image.width * image.height * channels * bytesPerSample * frames;
}

export function assertSafeImageInspection(image?: ImageInspectionDetails): void {
  if (!image?.width || !image.height) return;

  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const maxPixelsPerFrame = coarse ? 90_000_000 : 220_000_000;
  const maxDecodedBytes = coarse ? 768 * 1024 * 1024 : 2 * 1024 * 1024 * 1024;

  const pixels = image.width * image.height;
  if (!Number.isSafeInteger(pixels) || pixels > maxPixelsPerFrame) {
    throw new ResourceLimitError("Image dimensions exceed this device's safe pixel budget.");
  }

  const estimated = estimateDecodedImageBytes(image);
  if (estimated !== null && estimated > maxDecodedBytes) {
    throw new ResourceLimitError("Estimated decoded image memory exceeds this device's safe budget.");
  }
}

export function assertSafeImageDimensions(width?: number, height?: number): void {
  assertSafeImageInspection(width && height ? {
    width,
    height,
    metadata: { exif: false, xmp: false, iptc: false, icc: false, gps: false }
  } : undefined);
}
