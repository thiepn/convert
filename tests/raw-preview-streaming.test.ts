import { describe,expect,it } from "vitest";
import { findLargestEmbeddedJpegInBlob } from "../src/core/specialist/rawPreview";

describe("Phase 9 RAW preview streaming scan",()=>{
  it("finds JPEG markers that cross chunk boundaries without loading the whole blob",async()=>{
    const bytes=new Uint8Array(180_000);
    const smallStart=4_000;
    const smallEnd=8_000;
    bytes.set([0xff,0xd8,0xff],smallStart);
    bytes.set([0xff,0xd9],smallEnd);

    const largeStart=65_535;
    const largeEnd=150_000;
    bytes.set([0xff,0xd8,0xff],largeStart);
    bytes.set([0xff,0xd9],largeEnd);

    const found=await findLargestEmbeddedJpegInBlob(new Blob([bytes]),64*1024);
    expect(found).toEqual({
      offset:largeStart,
      length:largeEnd+2-largeStart
    });
  });

  it("returns null when no complete JPEG exists",async()=>{
    const bytes=new Uint8Array(70_000);
    bytes.set([0xff,0xd8,0xff],65_535);
    expect(await findLargestEmbeddedJpegInBlob(new Blob([bytes]),64*1024)).toBeNull();
  });
});
