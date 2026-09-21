import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { EngineRegistry } from "../src/core/engines/EngineRegistry";
import { createConversionGraph } from "../src/core/planner/ConversionGraph";
import { ConversionPlanner } from "../src/core/planner/ConversionPlanner";
import { FontEngine } from "../src/engines/specialist/FontEngine";

describe("recognition-only capability truth",()=>{
  it("does not advertise WOFF2 as a production conversion format",()=>{
    const formats=createDefaultFormatRegistry();
    const woff2=formats.get("woff2");
    expect(woff2?.readOnly).toBe(true);
    expect(woff2?.status).toBe("experimental");

    const engines=new EngineRegistry();
    engines.register(new FontEngine());
    const planner=new ConversionPlanner(createConversionGraph(),formats,engines);
    expect(planner.availableTargets("woff2")).toEqual([]);
  });
});
