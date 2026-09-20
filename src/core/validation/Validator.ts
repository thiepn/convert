import { FormatRegistry } from "../formats/FormatRegistry";
import { inspectFile } from "../inspection/inspectFile";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  properties: Record<string, unknown>;
}

export interface OutputValidator {
  validate(blob: Blob, targetFormatId: string): Promise<ValidationResult>;
}

export class ImageOutputValidator implements OutputValidator {
  constructor(private readonly formats: FormatRegistry) {}

  async validate(blob: Blob, targetFormatId: string): Promise<ValidationResult> {
    const target = this.formats.get(targetFormatId);
    const inspection = await inspectFile(
      Object.assign(blob, { name: "output." + (target?.extensions[0] ?? "bin") }),
      this.formats
    );
    const errors: string[] = [];

    if (inspection.detection.format?.id !== targetFormatId) {
      errors.push("Output signature does not match requested format.");
    }
    if (blob.size === 0) errors.push("Output is empty.");

    let width: number | undefined;
    let height: number | undefined;
    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
        if (!width || !height) errors.push("Decoded output has invalid dimensions.");
      }
    } catch {
      errors.push("Output could not be decoded as an image.");
    }

    return {
      valid: errors.length === 0,
      errors,
      properties: { format: inspection.detection.format?.id, width, height, size: blob.size }
    };
  }
}
