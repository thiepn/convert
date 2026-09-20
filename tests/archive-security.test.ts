import { describe,expect,it } from "vitest";
import { assessArchiveEntries,normalizeArchivePath } from "../src/core/archive/security";
import type { ArchiveEntryInfo } from "../src/core/archive/types";

function entry(path:string,size:number):ArchiveEntryInfo{
  return {
    path,
    name:path.split("/").pop()||path,
    size,
    compressedSize:null,
    directory:false,
    encrypted:false,
    lastModified:null,
    comment:null
  };
}

describe("archive security",()=>{
  it("normalizes safe relative paths",()=>{
    expect(normalizeArchivePath("./folder\\file.txt")).toBe("folder/file.txt");
  });

  it("rejects traversal and absolute paths",()=>{
    expect(()=>normalizeArchivePath("../evil.txt")).toThrow(/ARCHIVE_PATH_UNSAFE/);
    expect(()=>normalizeArchivePath("/etc/passwd")).toThrow(/ARCHIVE_PATH_UNSAFE/);
    expect(()=>normalizeArchivePath("C:\\Windows\\file.txt")).toThrow(/ARCHIVE_PATH_UNSAFE/);
    expect(()=>normalizeArchivePath("safe/../../evil")).toThrow(/ARCHIVE_PATH_UNSAFE/);
  });

  it("rejects suspicious expansion bombs",()=>{
    expect(()=>assessArchiveEntries(
      [entry("huge.bin",128*1024*1024)],
      64*1024,
      {maxExpandedBytes:1024*1024*1024,maxRatio:1000}
    )).toThrow(/ARCHIVE_BOMB_SUSPECTED/);
  });

  it("reports duplicate and case-colliding paths without overwriting",()=>{
    const result=assessArchiveEntries([
      entry("Folder/a.txt",10),
      entry("Folder/a.txt",20),
      entry("folder/A.txt",30)
    ],100);
    expect(result.duplicatePaths).toContain("Folder/a.txt");
    expect(result.warnings.some(w=>w.includes("Case-colliding"))).toBe(true);
  });
});
