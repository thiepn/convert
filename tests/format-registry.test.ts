import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";

function bmff(brand:string){
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

  it("distinguishes AVIF and HEIC ISO-BMFF brands",()=>{
    expect(registry.detect(bmff("avif"),"x.bin").format?.id).toBe("avif");
    expect(registry.detect(bmff("heic"),"x.bin").format?.id).toBe("heic");
  });

  it("recognizes MP4 and QuickTime MOV brands",()=>{
    expect(registry.detect(bmff("isom"),"video.bin").format?.id).toBe("mp4");
    expect(registry.detect(bmff("qt  "),"video.bin").format?.id).toBe("mov");
  });

  it("recognizes RIFF WAVE without confusing it with WebP",()=>{
    const bytes=new Uint8Array(16);
    bytes.set([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x41,0x56,0x45],0);
    expect(registry.detect(bytes,"audio.bin").format?.id).toBe("wav");
  });

  it("recognizes common audio signatures",()=>{
    expect(registry.detect(new Uint8Array([0x66,0x4c,0x61,0x43]),"x.bin").format?.id).toBe("flac");
    expect(registry.detect(new Uint8Array([0x4f,0x67,0x67,0x53,0,0]),"x.bin").format?.id).toBe("ogg");
    expect(registry.detect(new Uint8Array([0x49,0x44,0x33,4,0]),"x.bin").format?.id).toBe("mp3");
    expect(registry.detect(new Uint8Array([0xff,0xf1,0x50]),"x.bin").format?.id).toBe("aac");
  });

  it("recognizes WebM versus generic Matroska from EBML header content",()=>{
    const webm=new Uint8Array(64);
    webm.set([0x1a,0x45,0xdf,0xa3],0);
    webm.set([...new TextEncoder().encode("webm")],12);
    expect(registry.detect(webm,"x.bin").format?.id).toBe("webm-media");

    const mkv=new Uint8Array(64);
    mkv.set([0x1a,0x45,0xdf,0xa3],0);
    mkv.set([...new TextEncoder().encode("matroska")],12);
    expect(registry.detect(mkv,"x.bin").format?.id).toBe("mkv");
  });

  it("recognizes MPEG transport stream sync bytes",()=>{
    const bytes=new Uint8Array(376);
    bytes[0]=0x47;bytes[188]=0x47;
    expect(registry.detect(bytes,"x.bin").format?.id).toBe("mpegts");
  });

  it("retains Phase 1 image signatures",()=>{
    expect(registry.detect(new Uint8Array([71,73,70,56,57,97,1,0,1,0]),"x.bin").format?.id).toBe("gif");
    expect(registry.detect(new Uint8Array([0x49,0x49,0x2a,0x00]),"x.bin").format?.id).toBe("tiff");
    expect(registry.detect(new Uint8Array([0xff,0x0a]),"x.bin").format?.id).toBe("jxl");
  });
});
