export interface ConversionEdge {
  from: string;
  to: string;
  engineId: string;
  qualityLoss: number;
  metadataLoss: string[];
  temporaryMultiplier: number;
  streaming: boolean;
}

export class ConversionGraph {
  constructor(private readonly edges: ConversionEdge[]) {}

  outgoing(formatId: string): ConversionEdge[] {
    return this.edges.filter(edge => edge.from === formatId);
  }

  all(): ConversionEdge[] {
    return [...this.edges];
  }
}

const IMAGE_INPUTS = ["jpeg", "png", "webp", "gif", "tiff", "bmp", "avif", "heif", "jxl", "svg"];
const IMAGE_OUTPUTS = ["jpeg", "png", "webp", "gif", "tiff", "avif", "heif", "jxl"];

function targetQualityLoss(target: string): number {
  if (target === "jpeg") return 0.28;
  if (target === "webp") return 0.12;
  if (target === "gif") return 0.35;
  if (target === "avif" || target === "heif") return 0.10;
  if (target === "jxl") return 0.08;
  return 0;
}

export function createPhase1Graph(): ConversionGraph {
  const edges: ConversionEdge[] = [];

  for (const from of IMAGE_INPUTS) {
    for (const to of IMAGE_OUTPUTS) {
      edges.push({
        from,
        to,
        engineId: "vips-image",
        qualityLoss: targetQualityLoss(to),
        metadataLoss: [],
        temporaryMultiplier: 1.35,
        streaming: true
      });
    }
  }

  for (const from of ["jpeg", "png", "webp"]) {
    for (const to of ["jpeg", "png", "webp"]) {
      edges.push({
        from,
        to,
        engineId: "browser-image-fallback",
        qualityLoss: targetQualityLoss(to),
        metadataLoss: ["EXIF", "XMP", "IPTC", "ICC"],
        temporaryMultiplier: 2,
        streaming: false
      });
    }
  }

  return new ConversionGraph(edges);
}
