import { FormatRegistry } from "./FormatRegistry";
import type { FormatDefinition } from "./types";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function isoBmffBrands(bytes: Uint8Array): Set<string> {
  const brands = new Set<string>();
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return brands;
  brands.add(ascii(bytes, 8, 4));
  for (let offset = 16; offset + 4 <= Math.min(bytes.length, 128); offset += 4) {
    brands.add(ascii(bytes, offset, 4));
  }
  return brands;
}

function isAvif(bytes: Uint8Array): boolean {
  const brands = isoBmffBrands(bytes);
  return brands.has("avif") || brands.has("avis");
}

function isHeif(bytes: Uint8Array): boolean {
  const brands = isoBmffBrands(bytes);
  if (brands.has("avif") || brands.has("avis")) return false;
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].some(brand => brands.has(brand));
}

function isSvg(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 16 * 1024));
  return /<svg(?:\s|>)/i.test(text.replace(/^\uFEFF/, ""));
}

export const JPEG: FormatDefinition = {
  id: "jpeg",
  name: "JPEG",
  category: "image",
  extensions: ["jpg", "jpeg", "jpe"],
  mimeTypes: ["image/jpeg"],
  signatures: [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
  capabilities: { alpha: false, animation: false, hdr: false, highBitDepth: false, metadata: true }
};

export const PNG: FormatDefinition = {
  id: "png",
  name: "PNG",
  category: "image",
  extensions: ["png"],
  mimeTypes: ["image/png"],
  signatures: [[{ offset: 0, bytes: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] }]],
  capabilities: { alpha: true, animation: false, hdr: false, highBitDepth: true, metadata: true }
};

export const WEBP: FormatDefinition = {
  id: "webp",
  name: "WebP",
  category: "image",
  extensions: ["webp"],
  mimeTypes: ["image/webp"],
  signatures: [[
    { offset: 0, bytes: [0x52,0x49,0x46,0x46] },
    { offset: 8, bytes: [0x57,0x45,0x42,0x50] }
  ]],
  capabilities: { alpha: true, animation: true, hdr: false, highBitDepth: false, metadata: true }
};

export const GIF: FormatDefinition = {
  id: "gif",
  name: "GIF",
  category: "image",
  extensions: ["gif"],
  mimeTypes: ["image/gif"],
  signatures: [
    [{ offset: 0, bytes: [0x47,0x49,0x46,0x38,0x37,0x61] }],
    [{ offset: 0, bytes: [0x47,0x49,0x46,0x38,0x39,0x61] }]
  ],
  capabilities: { alpha: true, animation: true, hdr: false, highBitDepth: false, metadata: false }
};

export const TIFF: FormatDefinition = {
  id: "tiff",
  name: "TIFF",
  category: "image",
  extensions: ["tif", "tiff"],
  mimeTypes: ["image/tiff"],
  signatures: [
    [{ offset: 0, bytes: [0x49,0x49,0x2a,0x00] }],
    [{ offset: 0, bytes: [0x4d,0x4d,0x00,0x2a] }]
  ],
  capabilities: { alpha: true, animation: false, hdr: true, highBitDepth: true, metadata: true, multiplePages: true }
};

export const BMP: FormatDefinition = {
  id: "bmp",
  name: "BMP",
  category: "image",
  extensions: ["bmp", "dib"],
  mimeTypes: ["image/bmp", "image/x-ms-bmp"],
  signatures: [[{ offset: 0, bytes: [0x42,0x4d] }]],
  capabilities: { alpha: true, animation: false, hdr: false, highBitDepth: false, metadata: false }
};

export const AVIF: FormatDefinition = {
  id: "avif",
  name: "AVIF",
  category: "image",
  extensions: ["avif", "avifs"],
  mimeTypes: ["image/avif"],
  signatures: [],
  matcher: isAvif,
  capabilities: { alpha: true, animation: false, hdr: true, highBitDepth: true, metadata: true }
};

export const HEIF: FormatDefinition = {
  id: "heif",
  name: "HEIC / HEIF",
  category: "image",
  extensions: ["heic", "heif", "heics", "heifs"],
  mimeTypes: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"],
  signatures: [],
  matcher: isHeif,
  capabilities: { alpha: true, animation: false, hdr: true, highBitDepth: true, metadata: true, multiplePages: true }
};

export const JXL: FormatDefinition = {
  id: "jxl",
  name: "JPEG XL",
  category: "image",
  extensions: ["jxl"],
  mimeTypes: ["image/jxl"],
  signatures: [
    [{ offset: 0, bytes: [0xff,0x0a] }],
    [{ offset: 0, bytes: [0x00,0x00,0x00,0x0c,0x4a,0x58,0x4c,0x20,0x0d,0x0a,0x87,0x0a] }]
  ],
  capabilities: { alpha: true, animation: false, hdr: true, highBitDepth: true, metadata: true }
};

export const SVG: FormatDefinition = {
  id: "svg",
  name: "SVG",
  category: "image",
  extensions: ["svg", "svgz"],
  mimeTypes: ["image/svg+xml"],
  signatures: [],
  matcher: isSvg,
  capabilities: { alpha: true, animation: false, hdr: false, metadata: false, vector: true }
};

export function createDefaultFormatRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  [JPEG, PNG, WEBP, GIF, TIFF, BMP, AVIF, HEIF, JXL, SVG].forEach(format => registry.register(format));
  return registry;
}
