import { describe,expect,it } from "vitest";
import type { ConversionEngine } from "../src/core/engines/Engine";
import { EngineRegistry } from "../src/core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { createConversionGraph } from "../src/core/planner/ConversionGraph";
import { ConversionPlanner } from "../src/core/planner/ConversionPlanner";

function engine(id:string):ConversionEngine{
  return {
    id,version:"test",isAvailable:()=>true,canConvert:()=>true,
    estimate:async()=>({temporaryBytes:1,outputBytes:1,notes:[]}),
    convert:async()=>({blob:new Blob()}),dispose:()=>{}
  };
}

describe("ConversionPlanner",()=>{
  const engines=new EngineRegistry();
  [
    "vips-image","browser-image-proof","mediabunny","pdf-engine",
    "pandoc-document","libreoffice-document","pdf-reconstruction","archive-engine",
    "sheetjs-spreadsheet","duckdb-data","sqlite-data",
    "subtitle-compat","mesh-compat","raw-preview","scientific-metadata",
    "fb2-compat","psd-layered","font-compat","ffmpeg-legacy"
  ].forEach(id=>engines.register(engine(id)));
  const planner=new ConversionPlanner(createConversionGraph(),createDefaultFormatRegistry(),engines);

  it("prefers the production image engine",()=>{
    expect(planner.plan("png","webp").edges[0].engineId).toBe("vips-image");
  });

  it("routes MP4 to WebM through the media engine",()=>{
    expect(planner.plan("mp4","webm-media").edges[0].engineId).toBe("mediabunny");
  });

  it("chooses Pandoc for semantic DOCX to ODT conversion",()=>{
    const route=planner.plan("docx","odt","semantic");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("pandoc-document");
  });

  it("chooses LibreOffice for fidelity DOCX to ODT conversion",()=>{
    const route=planner.plan("docx","odt","fidelity");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("libreoffice-document");
  });

  it("uses Pandoc then LibreOffice for Markdown to PDF",()=>{
    const route=planner.plan("markdown","pdf","fidelity");
    expect(route.edges[0].engineId).toBe("pandoc-document");
    expect(route.edges.at(-1)?.engineId).toBe("libreoffice-document");
  });

  it("uses semantic macro-stripping intermediate before DOCM to PDF",()=>{
    const route=planner.plan("docm","pdf","fidelity");
    expect(route.edges[0].engineId).toBe("pandoc-document");
    expect(route.edges.at(-1)?.engineId).toBe("libreoffice-document");
  });

  it("routes PDF to editable DOCX through explicit reconstruction",()=>{
    const route=planner.plan("pdf","docx","semantic");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("pdf-reconstruction");
    expect(route.warnings.some(w=>w.code==="METADATA_LOSS")).toBe(true);
  });

  it("does not leak PDF reconstruction targets into image inputs",()=>{
    const targets=planner.availableTargets("jpeg");
    expect(targets).toContain("pdf");
    expect(targets).not.toContain("docx");
    expect(()=>planner.plan("jpeg","docx","semantic")).toThrow();
  });

  it("advertises PDF and semantic targets from document inputs",()=>{
    const targets=planner.availableTargets("docx");
    expect(targets).toContain("pdf");
    expect(targets).toContain("markdown");
  });

  it("routes RAR and 7z through the archive repacker",()=>{
    expect(planner.plan("rar","zip").edges[0].engineId).toBe("archive-engine");
    expect(planner.plan("7z","tar-gzip").edges[0].engineId).toBe("archive-engine");
  });

  it("advertises archive output targets without leaking them into ordinary files",()=>{
    expect(planner.availableTargets("rar")).toContain("zip");
    expect(planner.availableTargets("rar")).toContain("tar-xz");
    expect(planner.availableTargets("jpeg")).not.toContain("zip");
  });

  it("chooses SheetJS for semantic workbook conversion",()=>{
    const route=planner.plan("xlsx","ods","semantic");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("sheetjs-spreadsheet");
  });

  it("chooses LibreOffice Calc for fidelity workbook to PDF",()=>{
    const route=planner.plan("xlsx","pdf","fidelity");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("libreoffice-document");
  });

  it("strips XLSM macro payload through SheetJS before fidelity PDF",()=>{
    const route=planner.plan("xlsm","pdf","fidelity");
    expect(route.edges[0].engineId).toBe("sheetjs-spreadsheet");
    expect(route.edges.at(-1)?.engineId).toBe("libreoffice-document");
  });

  it("bridges workbook and Parquet through JSON data",()=>{
    const toParquet=planner.plan("xlsx","parquet","semantic");
    expect(toParquet.edges[0].engineId).toBe("sheetjs-spreadsheet");
    expect(toParquet.edges.at(-1)?.engineId).toBe("duckdb-data");

    const toWorkbook=planner.plan("parquet","xlsx","semantic");
    expect(toWorkbook.edges[0].engineId).toBe("duckdb-data");
    expect(toWorkbook.edges.at(-1)?.engineId).toBe("sheetjs-spreadsheet");
  });

  it("bridges SQLite and workbooks through structured data",()=>{
    const toWorkbook=planner.plan("sqlite","xlsx","semantic");
    expect(toWorkbook.edges[0].engineId).toBe("sqlite-data");
    expect(toWorkbook.edges.at(-1)?.engineId).toBe("sheetjs-spreadsheet");

    const toSqlite=planner.plan("xlsx","sqlite","semantic");
    expect(toSqlite.edges[0].engineId).toBe("sheetjs-spreadsheet");
    expect(toSqlite.edges.at(-1)?.engineId).toBe("sqlite-data");
  });

  it("keeps flat data on semantic engines instead of LibreOffice when requested",()=>{
    const route=planner.plan("csv","xlsx","semantic");
    expect(route.edges[0].engineId).toBe("sheetjs-spreadsheet");
  });

  it("routes legacy AVI through the isolated FFmpeg compatibility fallback",()=>{
    expect(planner.plan("avi","mp4").edges[0].engineId).toBe("ffmpeg-legacy");
  });

  it("keeps specialist conversions explicit and loss-aware",()=>{
    expect(planner.plan("psd","png").edges[0].engineId).toBe("psd-layered");
    expect(planner.plan("camera-raw","jpeg").edges[0].engineId).toBe("raw-preview");
    expect(planner.plan("ass","vtt").edges[0].engineId).toBe("subtitle-compat");
    expect(planner.plan("obj","stl").edges[0].engineId).toBe("mesh-compat");
    expect(planner.plan("otf","woff2").edges.map(edge=>edge.engineId)).toEqual(["font-compat","font-compat"]);
    expect(planner.plan("fits","json-data").edges[0].engineId).toBe("scientific-metadata");
  });

  it("bridges FB2 into the semantic document pipeline",()=>{
    const route=planner.plan("fb2","docx","semantic");
    expect(route.edges[0].engineId).toBe("fb2-compat");
    expect(route.edges.at(-1)?.engineId).toBe("pandoc-document");
  });

  it("does not advertise recognition-only specialist formats as convertible",()=>{
    expect(planner.availableTargets("psb")).toEqual([]);
    expect(planner.availableTargets("mobi-kindle")).toEqual([]);
    expect(planner.availableTargets("dwg")).toEqual([]);
    expect(planner.availableTargets("hdf5")).toEqual([]);
    expect(planner.availableTargets("glb")).toEqual([]);
  });
});
