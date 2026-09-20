import { describe,expect,it } from "vitest";
import type { ConversionEngine } from "../src/core/engines/Engine";
import { EngineRegistry } from "../src/core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { createConversionGraph } from "../src/core/planner/ConversionGraph";
import { ConversionPlanner } from "../src/core/planner/ConversionPlanner";

function engine(id:string):ConversionEngine {
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
  const planner=new ConversionPlanner(createConversionGraph(),createDefaultFormatRegistry(),engines);

  it("prefers the production image engine",()=>{
    const route=planner.plan("png","webp");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("vips-image");
  });

  it("supports same-format optimization",()=>{
    const route=planner.plan("jpeg","jpeg");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].from).toBe("jpeg");
    expect(route.edges[0].to).toBe("jpeg");
  });

  it("reports alpha loss without inventing metadata loss",()=>{
    const codes=planner.plan("png","jpeg").warnings.map(w=>w.code);
    expect(codes).toContain("ALPHA_LOSS");
    expect(codes).toContain("LOSSY_ROUTE");
    expect(codes).not.toContain("METADATA_LOSS");
  });

  it("reports HEIC fallback metadata limitations",()=>{
    expect(planner.plan("heic","jpeg").warnings.map(w=>w.code)).toContain("METADATA_LOSS");
  });
});
