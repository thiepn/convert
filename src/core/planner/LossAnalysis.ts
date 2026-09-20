import type { FormatDefinition } from "../formats/types";
import type { ImageTraits } from "../image/types";
import type { ConversionEdge } from "./ConversionGraph";

export interface LossWarning {
  code: string;
  message: string;
}

export function analyzeLoss(
  source: FormatDefinition,
  target: FormatDefinition,
  edges: ConversionEdge[],
  traits?: ImageTraits
): LossWarning[] {
  const warnings: LossWarning[] = [];

  if (traits?.alpha === true && !target.capabilities.alpha) {
    warnings.push({ code: "ALPHA_LOSS", message: target.name + " cannot preserve transparency. Transparent pixels will be flattened." });
  }
  if (traits?.animated === true && !target.capabilities.animation) {
    warnings.push({ code: "ANIMATION_LOSS", message: target.name + " cannot preserve animation. The first frame will be used." });
  }
  if (traits?.multiplePages === true && !target.capabilities.multiplePages && !target.capabilities.animation) {
    warnings.push({ code: "PAGE_LOSS", message: target.name + " cannot represent multiple pages. The first page will be used." });
  }
  if (traits?.hdr === true && !target.capabilities.hdr) {
    warnings.push({ code: "HDR_LOSS", message: target.name + " cannot preserve the source HDR representation. Output will be SDR-oriented." });
  }

  const metadata = [...new Set(edges.flatMap(edge => edge.metadataLoss).filter(item => item !== "alpha" && item !== "animation"))];
  if (metadata.length) {
    warnings.push({
      code: "METADATA_LOSS",
      message: "The selected engine cannot preserve: " + metadata.join(", ") + "."
    });
  }

  const quality = edges.reduce((sum, edge) => sum + edge.qualityLoss, 0);
  if (quality > 0) {
    warnings.push({ code: "LOSSY_ROUTE", message: "This route may re-encode through a lossy image format." });
  }

  if (source.id === "jpeg" && target.id === "png") {
    warnings.push({
      code: "NO_QUALITY_RECOVERY",
      message: "PNG prevents further lossy encoding, but cannot restore detail already removed by JPEG compression."
    });
  }

  return warnings;
}
