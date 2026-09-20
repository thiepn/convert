import { FormatRegistry } from "./FormatRegistry";
import type { FormatDefinition } from "./types";

export const JPEG: FormatDefinition = {
  id: "jpeg",
  name: "JPEG",
  category: "image",
  extensions: ["jpg", "jpeg", "jpe"],
  mimeTypes: ["image/jpeg"],
  signatures: [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
  capabilities: { alpha: false, animation: false, hdr: false, metadata: true }
};

export const PNG: FormatDefinition = {
  id: "png",
  name: "PNG",
  category: "image",
  extensions: ["png"],
  mimeTypes: ["image/png"],
  signatures: [[{ offset: 0, bytes: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] }]],
  capabilities: { alpha: true, animation: false, hdr: false, metadata: true }
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
  capabilities: { alpha: true, animation: true, hdr: false, metadata: true }
};

export function createDefaultFormatRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  [JPEG, PNG, WEBP].forEach(format => registry.register(format));
  return registry;
}
