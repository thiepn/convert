export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceLimitError";
  }
}

export function assertSafeImageDimensions(width?: number, height?: number): void {
  if (!width || !height) return;

  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const maxPixels = coarse ? 80_000_000 : 200_000_000;
  const maxDecodedBytes = coarse ? 512 * 1024 * 1024 : 1536 * 1024 * 1024;

  const pixels = width * height;
  const estimatedDecodedBytes = pixels * 4;

  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) {
    throw new ResourceLimitError("Image dimensions exceed this device's safe pixel budget.");
  }
  if (estimatedDecodedBytes > maxDecodedBytes) {
    throw new ResourceLimitError("Estimated decoded image memory exceeds this device's safe budget.");
  }
}
