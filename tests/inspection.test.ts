import { describe, expect, it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { inspectFile } from "../src/core/inspection/inspectFile";

describe("inspectFile", () => {
  it("reads PNG dimensions without decoding the full image", async () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 4000);
    view.setUint32(20, 3000);
    const blob = Object.assign(new Blob([bytes], { type: "image/png" }), { name: "photo.png" });

    const result = await inspectFile(blob, createDefaultFormatRegistry());
    expect(result.width).toBe(4000);
    expect(result.height).toBe(3000);
    expect(result.detection.format?.id).toBe("png");
  });
});
