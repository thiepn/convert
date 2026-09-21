import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { inspectFile } from "../src/core/inspection/inspectFile";
import { sourceIntegrityWarnings } from "../src/core/inspection/sourceIntegrity";

function pngWithoutIend():Uint8Array{
  return new Uint8Array([
    137,80,78,71,13,10,26,10,
    0,0,0,13,73,72,68,82,
    0,0,0,1,0,0,0,1,
    8,6,0,0,0,0,0,0,0
  ]);
}

describe("source integrity warnings",()=>{
  it("surfaces a likely truncated PNG through normal file inspection",async()=>{
    const file=new File([pngWithoutIend()],"broken.png",{type:"image/png"});
    const inspection=await inspectFile(file,createDefaultFormatRegistry());
    expect(inspection.detection.format?.id).toBe("png");
    expect(inspection.detection.warnings.some(warning=>/IEND|truncated/i.test(warning))).toBe(true);
  });

  it("warns when RIFF length exceeds the available WebP bytes",async()=>{
    const bytes=new Uint8Array([
      82,73,70,70, 100,0,0,0, 87,69,66,80
    ]);
    const warnings=await sourceIntegrityWarnings(new Blob([bytes]),"webp");
    expect(warnings.some(warning=>/truncated/i.test(warning))).toBe(true);
  });

  it("flags a PDF without a nearby EOF marker as repairable damage",async()=>{
    const warnings=await sourceIntegrityWarnings(new Blob(["%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"]),"pdf");
    expect(warnings.some(warning=>/Repair mode/i.test(warning))).toBe(true);
  });

  it("does not warn for a JPEG that contains an end marker",async()=>{
    const warnings=await sourceIntegrityWarnings(
      new Blob([new Uint8Array([0xff,0xd8,0xff,0xd9])]),
      "jpeg"
    );
    expect(warnings).toEqual([]);
  });

  it("warns when a ZIP central directory terminator is absent",async()=>{
    const localHeader=new Uint8Array([0x50,0x4b,0x03,0x04,0,0,0,0,0,0,0,0]);
    const warnings=await sourceIntegrityWarnings(new Blob([localHeader]),"zip");
    expect(warnings.some(warning=>/central-directory|truncated/i.test(warning))).toBe(true);
  });
});
