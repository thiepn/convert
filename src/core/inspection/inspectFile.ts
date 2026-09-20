import type { FormatDetection } from "../formats/types";
import { FormatRegistry } from "../formats/FormatRegistry";

export interface FileInspection {
  name: string;
  size: number;
  mime: string;
  detection: FormatDetection;
  width?: number;
  height?: number;
}

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width:view.getUint32(16), height:view.getUint32(20) };
}

function gifDimensions(bytes: Uint8Array) {
  if (bytes.length < 10) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width:view.getUint16(6,true), height:view.getUint16(8,true) };
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  let offset = 2;
  const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if (sof.has(marker)) {
      return {
        height:(bytes[offset+3] << 8) | bytes[offset+4],
        width:(bytes[offset+5] << 8) | bytes[offset+6]
      };
    }
    offset += length;
  }
}

function dimensions(formatId:string|undefined, bytes:Uint8Array) {
  if (formatId === "png") return pngDimensions(bytes);
  if (formatId === "jpeg") return jpegDimensions(bytes);
  if (formatId === "gif") return gifDimensions(bytes);
  return undefined;
}

export async function inspectFile(file:Blob & {name?:string}, registry:FormatRegistry):Promise<FileInspection> {
  const probeSize = Math.min(file.size, 256 * 1024);
  const bytes = new Uint8Array(await file.slice(0, probeSize).arrayBuffer());
  const name = file.name ?? "unnamed";
  const mime = file.type ?? "";
  const detection = registry.detect(bytes, name, mime);
  const size = dimensions(detection.format?.id, bytes);
  return { name, size:file.size, mime, detection, width:size?.width, height:size?.height };
}
