import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { inspectFile } from "../src/core/inspection/inspectFile";

describe("archive format detection",()=>{
  const registry=createDefaultFormatRegistry();

  it("recognizes ZIP, 7z, and RAR signatures",()=>{
    expect(registry.detect(new Uint8Array([0x50,0x4b,0x03,0x04]),"x.bin").format?.id).toBe("zip");
    expect(registry.detect(new Uint8Array([0x37,0x7a,0xbc,0xaf,0x27,0x1c]),"x.bin").format?.id).toBe("7z");
    expect(registry.detect(new Uint8Array([0x52,0x61,0x72,0x21,0x1a,0x07,0x01,0x00]),"x.bin").format?.id).toBe("rar");
  });

  it("recognizes gzip, bzip2, xz, and zstd",()=>{
    expect(registry.detect(new Uint8Array([0x1f,0x8b,0x08]),"x.bin").format?.id).toBe("gzip");
    expect(registry.detect(new Uint8Array([0x42,0x5a,0x68,0x39]),"x.bin").format?.id).toBe("bzip2");
    expect(registry.detect(new Uint8Array([0xfd,0x37,0x7a,0x58,0x5a,0x00]),"x.bin").format?.id).toBe("xz");
    expect(registry.detect(new Uint8Array([0x28,0xb5,0x2f,0xfd]),"x.bin").format?.id).toBe("zstd");
  });

  it("recognizes USTAR TAR headers",()=>{
    const bytes=new Uint8Array(512);
    bytes.set(new TextEncoder().encode("ustar"),257);
    expect(registry.detect(bytes,"x.bin").format?.id).toBe("tar");
  });

  it("uses compound suffixes to distinguish compressed TAR",async()=>{
    const gzip=Object.assign(
      new Blob([new Uint8Array([0x1f,0x8b,0x08,0,0,0,0,0])],{type:"application/gzip"}),
      {name:"backup.tar.gz"}
    );
    const result=await inspectFile(gzip,registry);
    expect(result.detection.format?.id).toBe("tar-gzip");
  });
});
