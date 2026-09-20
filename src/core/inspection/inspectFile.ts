import type { FormatDetection } from "../formats/types";
import { FormatRegistry } from "../formats/FormatRegistry";
import type { ImageInspectionDetails } from "../image/types";
import { inspectImageHeader } from "./imageHeaders";

export interface FileInspection {
  name: string;
  size: number;
  mime: string;
  detection: FormatDetection;
  width?: number;
  height?: number;
  image?: ImageInspectionDetails;
}

export async function inspectFile(file: Blob & { name?: string }, registry: FormatRegistry): Promise<FileInspection> {
  const probeSize = Math.min(file.size, 512 * 1024);
  const bytes = new Uint8Array(await file.slice(0, probeSize).arrayBuffer());
  const name = file.name ?? "unnamed";
  const mime = file.type ?? "";
  const detection = registry.detect(bytes, name, mime);
  const image = detection.format?.category === "image"
    ? inspectImageHeader(detection.format.id, bytes)
    : undefined;

  return {
    name,
    size: file.size,
    mime,
    detection,
    width: image?.width,
    height: image?.height,
    image
  };
}
