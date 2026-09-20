import { describe, expect, it } from "vitest";
import type { ConversionEngine } from "../src/core/engines/Engine";
import { EngineRegistry } from "../src/core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { createPhase0Graph } from "../src/core/planner/ConversionGraph";
import { ConversionPlanner } from "../src/core/planner/ConversionPlanner";

const fakeEngine: ConversionEngine = {
  id: "browser-image-proof",
  version: "test",
  isAvailable: () => true,
  canConvert: () => true,
  estimate: async () => ({ temporaryBytes: 1, outputBytes: 1, notes: [] }),
  convert: async () => ({ blob: new Blob() }),
  dispose: () => {}
};

describe("ConversionPlanner", () => {
  const engines = new EngineRegistry();
  engines.register(fakeEngine);
  const planner = new ConversionPlanner(
    createPhase0Graph(),
    createDefaultFormatRegistry(),
    engines
  );

  it("finds a direct local route", () => {
    const route = planner.plan("png", "webp");
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("browser-image-proof");
  });

  it("reports alpha and metadata loss for PNG to JPEG", () => {
    const route = planner.plan("png", "jpeg");
    const codes = route.warnings.map(warning => warning.code);
    expect(codes).toContain("ALPHA_LOSS");
    expect(codes).toContain("METADATA_LOSS");
    expect(codes).toContain("LOSSY_ROUTE");
  });
});
