import { describe, expect, it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { inspectFile } from "../src/core/inspection/inspectFile";

describe("inspectFile", () => {
  const registry = createDefaultFormatRegistry();

  it("reads PNG dimensions without decoding the full image", async () => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49,0x48,0x44,0x52], 12);
    view.setUint32(16, 4000);
    view.setUint32(20, 3000);
    bytes[24] = 8;
    bytes[25] = 6;
    const blob = Object.assign(new Blob([bytes], { type: "image/png" }), { name: "photo.png" });

    const result = await inspectFile(blob, registry);
    expect(result.width).toBe(4000);
    expect(result.height).toBe(3000);
    expect(result.image?.alpha).toBe(true);
    expect(result.detection.format?.id).toBe("png");
  });

  it("detects animated PNG frame count from acTL", async () => {
    const bytes = new Uint8Array(53);
    bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49,0x48,0x44,0x52], 12);
    view.setUint32(16, 100);
    view.setUint32(20, 80);
    bytes[24] = 8;
    bytes[25] = 6;
    view.setUint32(33, 8);
    bytes.set([0x61,0x63,0x54,0x4c], 37);
    view.setUint32(41, 7);
    view.setUint32(45, 0);
    const blob = Object.assign(new Blob([bytes], { type: "image/png" }), { name: "animated.png" });
    const result = await inspectFile(blob, registry);
    expect(result.image?.animated).toBe(true);
    expect(result.image?.frameCount).toBe(7);
  });

  it("reads BMP dimensions and bit depth", async () => {
    const bytes = new Uint8Array(54);
    bytes.set([0x42,0x4d], 0);
    const view = new DataView(bytes.buffer);
    view.setInt32(18, 1920, true);
    view.setInt32(22, 1080, true);
    view.setUint16(28, 24, true);
    const blob = Object.assign(new Blob([bytes], { type: "image/bmp" }), { name: "image.bmp" });
    const result = await inspectFile(blob, registry);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.image?.bitDepth).toBe(24);
  });
});
