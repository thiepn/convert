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

export function createPhase0Graph(): ConversionGraph {
  const engineId = "browser-image-proof";
  return new ConversionGraph([
    { from: "jpeg", to: "png", engineId, qualityLoss: 0, metadataLoss: ["EXIF", "XMP", "ICC"], temporaryMultiplier: 2, streaming: false },
    { from: "jpeg", to: "webp", engineId, qualityLoss: 0.15, metadataLoss: ["EXIF", "XMP", "ICC"], temporaryMultiplier: 2, streaming: false },
    { from: "png", to: "jpeg", engineId, qualityLoss: 0.4, metadataLoss: ["EXIF", "XMP", "ICC", "alpha"], temporaryMultiplier: 2, streaming: false },
    { from: "png", to: "webp", engineId, qualityLoss: 0.08, metadataLoss: ["EXIF", "XMP", "ICC"], temporaryMultiplier: 2, streaming: false },
    { from: "webp", to: "jpeg", engineId, qualityLoss: 0.3, metadataLoss: ["EXIF", "XMP", "ICC", "animation", "alpha"], temporaryMultiplier: 2, streaming: false },
    { from: "webp", to: "png", engineId, qualityLoss: 0, metadataLoss: ["EXIF", "XMP", "ICC", "animation"], temporaryMultiplier: 2, streaming: false }
  ]);
}
