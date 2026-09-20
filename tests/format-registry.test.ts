import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";

function bmff(brand:string) {
  const bytes=new Uint8Array(32);
  bytes.set([0,0,0,24,0x66,0x74,0x79,0x70],0);
  bytes.set([...brand].map(c=>c.charCodeAt(0)),8);
  return bytes;
}

describe("FormatRegistry",()=>{
  const registry=createDefaultFormatRegistry();

  it("prefers PNG signature over a misleading filename",()=>{
    const bytes=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
    const result=registry.detect(bytes,"photo.jpg","image/jpeg");
    expect(result.format?.id).toBe("png");
    expect(result.confidence).toBeGreaterThan(.9);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("recognizes GIF and TIFF signatures",()=>{
    expect(registry.detect(new Uint8Array([71,73,70,56,57,97,1,0,1,0]),"x.bin").format?.id).toBe("gif");
    expect(registry.detect(new Uint8Array([0x49,0x49,0x2a,0x00]),"x.bin").format?.id).toBe("tiff");
  });

  it("distinguishes AVIF and HEIC ISO-BMFF brands",()=>{
    expect(registry.detect(bmff("avif"),"x.bin").format?.id).toBe("avif");
    expect(registry.detect(bmff("heic"),"x.bin").format?.id).toBe("heic");
  });

  it("recognizes both JPEG XL forms",()=>{
    expect(registry.detect(new Uint8Array([0xff,0x0a]),"x.bin").format?.id).toBe("jxl");
    expect(registry.detect(new Uint8Array([0,0,0,12,0x4a,0x58,0x4c,0x20,0x0d,0x0a,0x87,0x0a]),"x.bin").format?.id).toBe("jxl");
  });

  it("recognizes SVG by content",()=>{
    const bytes=new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(registry.detect(bytes,"vector.txt","text/plain").format?.id).toBe("svg");
  });
});
