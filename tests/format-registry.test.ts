import { describe, expect, it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";

describe("FormatRegistry", () => {
  const registry = createDefaultFormatRegistry();

  it("identifies PNG by signature even with a wrong extension", () => {
    const bytes = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
    const result = registry.detect(bytes, "photo.jpg", "image/jpeg");

    expect(result.format?.id).toBe("png");
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("identifies WebP from RIFF and WEBP signatures", () => {
    const bytes = new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);
    expect(registry.detect(bytes, "x.bin").format?.id).toBe("webp");
  });
});
