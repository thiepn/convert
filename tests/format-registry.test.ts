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

  it("recognizes document text formats from content",()=>{
    expect(registry.detect(new TextEncoder().encode("{\\rtf1 hello"),"x.bin").format?.id).toBe("rtf");
    expect(registry.detect(new TextEncoder().encode("<!doctype html><html></html>"),"x.bin").format?.id).toBe("html-doc");
    expect(registry.detect(new TextEncoder().encode("\\documentclass{article}"),"x.bin").format?.id).toBe("latex");
  });

  it("prefers specific document extensions over generic text MIME",()=>{
    expect(registry.detect(new TextEncoder().encode("# title"),"notes.md","text/plain").format?.id).toBe("markdown");
    expect(registry.detect(new TextEncoder().encode("= title"),"notes.typ","text/plain").format?.id).toBe("typst");
  });

  it("detects PDF by its file header",()=>{
    const bytes=new TextEncoder().encode("%PDF-1.7\n1 0 obj");
    expect(registry.detect(bytes,"file.bin").format?.id).toBe("pdf");
  });

  it("recognizes MP4 and QuickTime MOV brands",()=>{
    expect(registry.detect(bmff("isom"),"video.bin").format?.id).toBe("mp4");
    expect(registry.detect(bmff("qt  "),"video.bin").format?.id).toBe("mov");
  });

  it("distinguishes AVIF and HEIC ISO-BMFF brands",()=>{
    expect(registry.detect(bmff("avif"),"x.bin").format?.id).toBe("avif");
    expect(registry.detect(bmff("heic"),"x.bin").format?.id).toBe("heic");
  });

  it("recognizes common audio signatures",()=>{
    expect(registry.detect(new Uint8Array([0x66,0x4c,0x61,0x43]),"x.bin").format?.id).toBe("flac");
    expect(registry.detect(new Uint8Array([0x49,0x44,0x33,4,0]),"x.bin").format?.id).toBe("mp3");
    expect(registry.detect(new Uint8Array([0xff,0xf1,0x50]),"x.bin").format?.id).toBe("aac");
  });

  it("retains image signatures",()=>{
    expect(registry.detect(new Uint8Array([71,73,70,56,57,97,1,0,1,0]),"x.bin").format?.id).toBe("gif");
    expect(registry.detect(new Uint8Array([0xff,0x0a]),"x.bin").format?.id).toBe("jxl");
  });
});
