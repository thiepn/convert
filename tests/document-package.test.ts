import { describe,expect,it } from "vitest";
import { strToU8,zipSync } from "fflate";
import { openZipPackage } from "../src/core/document/PackageInspector";
import { inspectDocumentBlob } from "../src/core/document/inspectDocument";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { inspectFile } from "../src/core/inspection/inspectFile";

function asBlob(bytes:Uint8Array,name:string,type="application/zip"){
  const copy=new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return Object.assign(new Blob([copy.buffer],{type}),{name});
}

function minimalWorkbook(withMacro=false,binary=false){
  const entries:Record<string,Uint8Array>={
    "[Content_Types].xml":strToU8("<Types/>")
  };
  if(binary) entries["xl/workbook.bin"]=new Uint8Array([1,2,3]);
  else entries["xl/workbook.xml"]=strToU8('<workbook xmlns="x"><sheets/></workbook>');
  if(withMacro) entries["xl/vbaProject.bin"]=new Uint8Array([86,66,65]);
  return asBlob(
    zipSync(entries),
    binary?"book.xlsb":withMacro?"macro.xlsm":"book.xlsx"
  );
}

function minimalDocx(withMacro=false){
  const entries:Record<string,Uint8Array>={
    "[Content_Types].xml":strToU8("<Types/>"),
    "word/document.xml":strToU8(
      '<w:document xmlns:w="w" xmlns:m="m"><w:body>'+
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p>'+
      '<w:tbl></w:tbl><w:ins><w:r><w:t>new</w:t></w:r></w:ins><m:oMath/>'+
      '<w:sectPr/></w:body></w:document>'
    ),
    "word/comments.xml":strToU8('<w:comments xmlns:w="w"><w:comment w:id="0"/></w:comments>'),
    "word/footnotes.xml":strToU8('<w:footnotes xmlns:w="w"><w:footnote/><w:footnote/><w:footnote/></w:footnotes>'),
    "word/fontTable.xml":strToU8('<w:fonts xmlns:w="w"><w:font w:name="Aptos"/></w:fonts>'),
    "word/_rels/document.xml.rels":strToU8('<Relationships><Relationship TargetMode="External" Target="https://example.com"/></Relationships>'),
    "word/media/image1.png":new Uint8Array([1,2,3])
  };
  if(withMacro) entries["word/vbaProject.bin"]=new Uint8Array([86,66,65]);
  return asBlob(zipSync(entries),withMacro?"macro.docm":"document.docx");
}

describe("Office package inspection",()=>{
  it("identifies XLSX, XLSM, and XLSB from package structure",async()=>{
    const registry=createDefaultFormatRegistry();
    expect((await inspectFile(minimalWorkbook(false,false),registry)).detection.format?.id).toBe("xlsx");
    expect((await inspectFile(minimalWorkbook(true,false),registry)).detection.format?.id).toBe("xlsm");
    expect((await inspectFile(minimalWorkbook(false,true),registry)).detection.format?.id).toBe("xlsb");
  });


  it("identifies DOCX from package structure even with a generic ZIP MIME",async()=>{
    const file=minimalDocx(false);
    const inspection=await inspectFile(file,createDefaultFormatRegistry());
    expect(inspection.detection.format?.id).toBe("docx");
    expect(inspection.detection.confidence).toBeGreaterThan(.99);
  });

  it("detects macros, revisions, external relationships, and semantic features",async()=>{
    const file=minimalDocx(true);
    const inspection=await inspectDocumentBlob(file,"docm");
    expect(inspection.macros).toBe(true);
    expect(inspection.trackedChanges).toBeGreaterThan(0);
    expect(inspection.externalLinks).toBe(1);
    expect(inspection.headings).toBe(1);
    expect(inspection.tables).toBe(1);
    expect(inspection.comments).toBe(1);
    expect(inspection.images).toBe(1);
    expect(inspection.fonts).toContain("Aptos");
  });

  it("rejects archive path traversal",async()=>{
    const archive=asBlob(zipSync({"../evil.txt":strToU8("evil")}),"evil.docx");
    await expect(openZipPackage(archive)).rejects.toThrow(/DOCUMENT_PACKAGE_UNSAFE/);
  });
});
