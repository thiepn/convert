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
  const planner=new ConversionPlanner(createConversionGraph(),createDefaultFormatRegistry(),engines);

  it("prefers the production image engine",()=>{
    expect(planner.plan("png","webp").edges[0].engineId).toBe("vips-image");
  });

  it("supports same-format image optimization",()=>{
    const route=planner.plan("jpeg","jpeg");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].to).toBe("jpeg");
  });

  it("routes MP4 to WebM through the media engine",()=>{
    const route=planner.plan("mp4","webm-media");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("mediabunny");
    expect(route.edges[0].streaming).toBe(true);
  });

  it("supports audio extraction container routes without claiming quality loss in advance",()=>{
    const route=planner.plan("mov","mp3");
    expect(route.edges[0].engineId).toBe("mediabunny");
    expect(route.warnings.map(w=>w.code)).not.toContain("LOSSY_ROUTE");
  });

  it("does not advertise a route for legacy AVI without a vetted compatibility engine",()=>{
    expect(()=>planner.plan("avi","mp4")).toThrow();
  });

  it("reports image alpha loss correctly",()=>{
    const codes=planner.plan("png","jpeg").warnings.map(w=>w.code);
    expect(codes).toContain("ALPHA_LOSS");
    expect(codes).toContain("LOSSY_ROUTE");
  });
});
