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

  it("distinguishes AVIF and HEIC ISO-BMFF brands", () => {
    const avif = new Uint8Array([0,0,0,24,0x66,0x74,0x79,0x70,0x61,0x76,0x69,0x66,0,0,0,0,0x61,0x76,0x69,0x66]);
    const heic = new Uint8Array([0,0,0,24,0x66,0x74,0x79,0x70,0x68,0x65,0x69,0x63,0,0,0,0,0x6d,0x69,0x66,0x31]);
    expect(registry.detect(avif, "x.bin").format?.id).toBe("avif");
    expect(registry.detect(heic, "x.bin").format?.id).toBe("heif");
  });

  it("recognizes JPEG XL codestream and SVG structure", () => {
    expect(registry.detect(new Uint8Array([0xff,0x0a,0,0]), "x.bin").format?.id).toBe("jxl");
    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg viewBox="0 0 10 10"></svg>');
    expect(registry.detect(svg, "x.txt").format?.id).toBe("svg");
  });
});
