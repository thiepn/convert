import { FormatRegistry } from "./FormatRegistry";
import type { FormatDefinition } from "./types";

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length));

const isIsoBmffBrand = (bytes: Uint8Array, brands: string[]) => {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return false;
  const end = Math.min(bytes.length, 80);
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    if (brands.includes(ascii(bytes, offset, 4))) return true;
  }
  return false;
};

const isSvg = (bytes: Uint8Array) => {
  try {
    const text = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 8192)))
      .replace(/^\uFEFF/, "")
      .trimStart();
    return /^(?:<\?xml[^>]*>\s*)?(?:<!--(?:.|\n|\r)*?-->\s*)*<svg(?:\s|>)/i.test(text);
  } catch {
    return false;
  }
};

export const JPEG: FormatDefinition = {
  id: "jpeg", name: "JPEG", category: "image",
  extensions: ["jpg","jpeg","jpe"], mimeTypes: ["image/jpeg"],
  signatures: [[{ offset: 0, bytes: [0xff,0xd8,0xff] }]],
  capabilities: { alpha:false, animation:false, hdr:false, metadata:true },
  status:"production"
};
export const PNG: FormatDefinition = {
  id:"png", name:"PNG", category:"image", extensions:["png"], mimeTypes:["image/png"],
  signatures:[[{ offset:0, bytes:[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] }]],
  capabilities:{ alpha:true, animation:false, hdr:false, metadata:true }, status:"production"
};
export const WEBP: FormatDefinition = {
  id:"webp", name:"WebP", category:"image", extensions:["webp"], mimeTypes:["image/webp"],
  signatures:[[{offset:0,bytes:[0x52,0x49,0x46,0x46]},{offset:8,bytes:[0x57,0x45,0x42,0x50]}]],
  capabilities:{alpha:true,animation:true,hdr:false,metadata:true}, status:"production"
};
export const GIF: FormatDefinition = {
  id:"gif", name:"GIF", category:"image", extensions:["gif"], mimeTypes:["image/gif"],
  signatures:[
    [{offset:0,bytes:[0x47,0x49,0x46,0x38,0x37,0x61]}],
    [{offset:0,bytes:[0x47,0x49,0x46,0x38,0x39,0x61]}]
  ],
  capabilities:{alpha:true,animation:true,hdr:false,metadata:false}, status:"production"
};
export const TIFF: FormatDefinition = {
  id:"tiff", name:"TIFF", category:"image", extensions:["tif","tiff"], mimeTypes:["image/tiff"],
  signatures:[
    [{offset:0,bytes:[0x49,0x49,0x2a,0x00]}],
    [{offset:0,bytes:[0x4d,0x4d,0x00,0x2a]}]
  ],
  capabilities:{alpha:true,animation:false,hdr:true,metadata:true,multiplePages:true}, status:"production"
};
export const AVIF: FormatDefinition = {
  id:"avif", name:"AVIF", category:"image", extensions:["avif"], mimeTypes:["image/avif"],
  signatures:[], matcher:bytes => isIsoBmffBrand(bytes, ["avif","avis"]),
  capabilities:{alpha:true,animation:true,hdr:true,metadata:true}, status:"beta"
};
export const HEIC: FormatDefinition = {
  id:"heic", name:"HEIC / HEIF", category:"image", extensions:["heic","heif","hif"],
  mimeTypes:["image/heic","image/heif","image/heic-sequence","image/heif-sequence"],
  signatures:[], matcher:bytes => isIsoBmffBrand(bytes, ["heic","heix","hevc","hevx","heis","heim"]),
  capabilities:{alpha:true,animation:false,hdr:true,metadata:true,multiplePages:true},
  readOnly:true, status:"beta"
};
export const JXL: FormatDefinition = {
  id:"jxl", name:"JPEG XL", category:"image", extensions:["jxl"], mimeTypes:["image/jxl"],
  signatures:[
    [{offset:0,bytes:[0xff,0x0a]}],
    [{offset:0,bytes:[0x00,0x00,0x00,0x0c,0x4a,0x58,0x4c,0x20,0x0d,0x0a,0x87,0x0a]}]
  ],
  capabilities:{alpha:true,animation:true,hdr:true,metadata:true}, status:"beta"
};
export const SVG: FormatDefinition = {
  id:"svg", name:"SVG", category:"image", extensions:["svg","svgz"], mimeTypes:["image/svg+xml"],
  signatures:[], matcher:isSvg,
  capabilities:{alpha:true,animation:false,hdr:false,metadata:true,vector:true},
  readOnly:true, status:"production"
};

export function createDefaultFormatRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  [JPEG,PNG,WEBP,GIF,TIFF,AVIF,HEIC,JXL,SVG].forEach(format => registry.register(format));
  return registry;
}
