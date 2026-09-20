import { FormatRegistry } from "../formats/FormatRegistry";
import type { MetadataPolicy } from "../image/types";
import { inspectFile } from "../inspection/inspectFile";

export interface ValidationExpectation {
  width?: number;
  height?: number;
  frameCount?: number;
  metadataPolicy?: MetadataPolicy;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  properties: Record<string, unknown>;
}

export interface OutputValidator {
  validate(blob: Blob, targetFormatId: string, expectation?: ValidationExpectation): Promise<ValidationResult>;
}

export class ImageOutputValidator implements OutputValidator {
  constructor(private readonly formats: FormatRegistry) {}

  async validate(blob: Blob, targetFormatId: string, expectation?: ValidationExpectation): Promise<ValidationResult> {
    const target = this.formats.get(targetFormatId);
    const inspection = await inspectFile(
      Object.assign(blob, { name: "output." + (target?.extensions[0] ?? "bin") }),
      this.formats
    );
    const errors: string[] = [];
    const warnings: string[] = [];

    if (inspection.detection.format?.id !== targetFormatId) {
      errors.push("Output signature does not match requested format.");
    }
    if (blob.size === 0) errors.push("Output is empty.");

    if (expectation?.width && inspection.width && expectation.width !== inspection.width) {
      errors.push("Output width differs from the conversion result.");
    }
    if (expectation?.height && inspection.height && expectation.height !== inspection.height) {
      errors.push("Output height differs from the conversion result.");
    }
    if (expectation?.frameCount && inspection.image?.frameCount && expectation.frameCount !== inspection.image.frameCount) {
      errors.push("Output frame count differs from the conversion result.");
    }

    if (expectation?.metadataPolicy === "strip" && inspection.image) {
      const metadata = inspection.image.metadata;
      if (metadata.exif || metadata.xmp || metadata.iptc || metadata.icc || metadata.gps) {
        errors.push("Output still contains metadata after Strip metadata was requested.");
      }
    }
    if (expectation?.metadataPolicy === "privacy" && inspection.image?.metadata.gps) {
      errors.push("Output still contains GPS metadata after Privacy mode was requested.");
    }

    if (typeof createImageBitmap === "function" && ["jpeg", "png", "webp", "gif", "avif"].includes(targetFormatId)) {
      try {
        const bitmap = await createImageBitmap(blob);
        if (!bitmap.width || !bitmap.height) errors.push("Decoded output has invalid dimensions.");
        bitmap.close();
      } catch {
        warnings.push("The browser could not independently decode the output, but its file structure was recognized.");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      properties: {
        format: inspection.detection.format?.id,
        width: inspection.width,
        height: inspection.height,
        frameCount: inspection.image?.frameCount,
        size: blob.size,
        metadata: inspection.image?.metadata
      }
    };
  }
}
