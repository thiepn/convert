import type { FormatDefinition } from "../formats/types";
import type { ConversionEdge } from "./ConversionGraph";

export interface LossWarning {
  code: string;
  message: string;
}

export function analyzeLoss(source: FormatDefinition, target: FormatDefinition, edges: ConversionEdge[]): LossWarning[] {
  const warnings: LossWarning[] = [];

  if (source.capabilities.alpha && !target.capabilities.alpha) {
    warnings.push({ code: "ALPHA_LOSS", message: target.name + " cannot preserve transparency. Transparent pixels will be flattened." });
  }
  if (source.capabilities.animation && !target.capabilities.animation) {
    warnings.push({ code: "ANIMATION_LOSS", message: target.name + " cannot preserve animation through this route." });
  }
  if (source.capabilities.hdr && !target.capabilities.hdr) {
    warnings.push({ code: "HDR_LOSS", message: target.name + " cannot preserve the source HDR representation." });
  }

  const metadata = [...new Set(edges.flatMap(edge => edge.metadataLoss).filter(item => item !== "alpha" && item !== "animation"))];
  if (metadata.length) {
    warnings.push({
      code: "METADATA_LOSS",
      message: "Phase 0 proof conversion does not preserve: " + metadata.join(", ") + ". Phase 1 replaces this image path with metadata-aware codecs."
    });
  }

  const quality = edges.reduce((sum, edge) => sum + edge.qualityLoss, 0);
  if (quality > 0) {
    warnings.push({ code: "LOSSY_ROUTE", message: "This route re-encodes through a lossy image format and may reduce visual quality." });
  }

  return warnings;
}
