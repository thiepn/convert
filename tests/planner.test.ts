import { describe, expect, it } from "vitest";
import type { ConversionEngine } from "../src/core/engines/Engine";
import { EngineRegistry } from "../src/core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { createPhase1Graph } from "../src/core/planner/ConversionGraph";
import { ConversionPlanner } from "../src/core/planner/ConversionPlanner";

const fakeEngine: ConversionEngine = {
  id: "vips-image",
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
  const planner = new ConversionPlanner(createPhase1Graph(), createDefaultFormatRegistry(), engines);

  it("prefers a direct production image route", () => {
    const route = planner.plan("png", "webp", { alpha: true });
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].engineId).toBe("vips-image");
  });

  it("uses actual source traits for alpha loss warnings", () => {
    const route = planner.plan("png", "jpeg", { alpha: true });
    expect(route.warnings.map(warning => warning.code)).toContain("ALPHA_LOSS");
  });

  it("does not warn about alpha solely because PNG supports alpha", () => {
    const route = planner.plan("png", "jpeg", { alpha: false });
    expect(route.warnings.map(warning => warning.code)).not.toContain("ALPHA_LOSS");
  });

  it("can force a same-format processing route", () => {
    const route = planner.plan("jpeg", "jpeg", { alpha: false }, true);
    expect(route.edges).toHaveLength(1);
    expect(route.edges[0].from).toBe("jpeg");
    expect(route.edges[0].to).toBe("jpeg");
  });
});
