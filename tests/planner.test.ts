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
  engines.register(engine("vips-image"));
  engines.register(engine("browser-image-proof"));
  engines.register(engine("mediabunny"));
  engines.register(engine("pdf-engine"));
  const planner=new ConversionPlanner(createConversionGraph(),createDefaultFormatRegistry(),engines);

  it("prefers the production image engine",()=>{
    expect(planner.plan("png","webp").edges[0].engineId).toBe("vips-image");
  });

  it("routes MP4 to WebM through the media engine",()=>{
    expect(planner.plan("mp4","webm-media").edges[0].engineId).toBe("mediabunny");
  });

  it("routes JPEG directly into PDF",()=>{
    const route=planner.plan("jpeg","pdf");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("pdf-engine");
  });

  it("normalizes WebP through PNG before PDF creation",()=>{
    const route=planner.plan("webp","pdf");
    expect(route.edges.at(-1)?.engineId).toBe("pdf-engine");
    expect(route.edges.at(-1)?.from).toBe("png");
    expect(planner.availableTargets("webp")).toContain("pdf");
  });

  it("supports PDF-to-PDF structural work",()=>{
    const route=planner.plan("pdf","pdf");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("pdf-engine");
  });

  it("does not advertise PDF to raster through the one-output planner",()=>{
    expect(()=>planner.plan("pdf","png")).toThrow();
  });

  it("keeps legacy AVI unsupported without a vetted compatibility engine",()=>{
    expect(()=>planner.plan("avi","mp4")).toThrow();
  });
});
