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
    "pandoc-document","libreoffice-document","pdf-reconstruction"
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

  it("keeps legacy AVI unsupported without a vetted compatibility engine",()=>{
    expect(()=>planner.plan("avi","mp4")).toThrow();
  });
});
