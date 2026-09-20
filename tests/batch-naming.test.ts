import { describe,expect,it } from "vitest";
import { renderBatchName,uniqueBatchName } from "../src/core/batch/naming";

describe("Phase 8 batch naming",()=>{
  it("expands deterministic naming tokens and appends the target extension",()=>{
    expect(renderBatchName("{index:03}-{name}-{format}",{
      sourceName:"holiday.photo.jpg",
      targetExtension:"webp",
      targetFormatId:"webp",
      index:6,
      total:20,
      date:new Date(2026,8,20)
    })).toBe("007-holiday.photo-webp.webp");
  });

  it("sanitizes unsafe path characters",()=>{
    expect(renderBatchName("../{name}:converted",{
      sourceName:"a?.png",
      targetExtension:"jpg",
      targetFormatId:"jpeg",
      index:0,
      total:1
    })).toBe("_a__converted.jpg");
  });

  it("deduplicates names case-insensitively",()=>{
    const used=new Set<string>();
    expect(uniqueBatchName("file.png",used)).toBe("file.png");
    expect(uniqueBatchName("FILE.png",used)).toBe("FILE-2.png");
    expect(uniqueBatchName("file.png",used)).toBe("file-3.png");
  });
});
