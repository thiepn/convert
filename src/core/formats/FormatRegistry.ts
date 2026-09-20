import type { ByteSignature, FormatDefinition, FormatDetection } from "./types";

function matchesSignature(bytes: Uint8Array, signature: ByteSignature[]): boolean {
  return signature.every(part => {
    if (bytes.length < part.offset + part.bytes.length) return false;
    return part.bytes.every((value, index) => bytes[part.offset + index] === value);
  });
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1).toLowerCase();
}

export class FormatRegistry {
  private formats = new Map<string, FormatDefinition>();

  register(format: FormatDefinition): void {
    if (this.formats.has(format.id)) throw new Error("Duplicate format: " + format.id);
    this.formats.set(format.id, format);
  }

  get(id: string): FormatDefinition | undefined {
    return this.formats.get(id);
  }

  all(): FormatDefinition[] {
    return [...this.formats.values()];
  }

  detect(bytes: Uint8Array, name = "", mime = ""): FormatDetection {
    const extension = extensionOf(name);
    const binaryMatch = this.all().find(format =>
      format.signatures.some(signature => matchesSignature(bytes, signature))
    );

    const mimeMatch = mime
      ? this.all().find(format => format.mimeTypes.includes(mime.toLowerCase()))
      : undefined;

    const extensionMatch = extension
      ? this.all().find(format => format.extensions.includes(extension))
      : undefined;

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (binaryMatch) reasons.push("Matched file signature");
    if (mimeMatch) reasons.push("Matched MIME hint");
    if (extensionMatch) reasons.push("Matched filename extension");

    const format = binaryMatch ?? mimeMatch ?? extensionMatch ?? null;
    const confidence = binaryMatch ? 0.99 : mimeMatch ? 0.75 : extensionMatch ? 0.55 : 0;

    if (binaryMatch && extensionMatch && binaryMatch.id !== extensionMatch.id) {
      warnings.push("Filename extension does not match the file signature.");
    }
    if (binaryMatch && mimeMatch && binaryMatch.id !== mimeMatch.id) {
      warnings.push("Reported MIME type does not match the file signature.");
    }

    return { format, confidence, reasons, warnings };
  }
}
