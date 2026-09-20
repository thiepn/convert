export interface ConversionEdge {
  from:string;
  to:string;
  engineId:string;
  qualityLoss:number;
  metadataLoss:string[];
  temporaryMultiplier:number;
  streaming:boolean;
  baseCost?:number;
}

export class ConversionGraph {
  constructor(private readonly edges:ConversionEdge[]) {}
  outgoing(formatId:string):ConversionEdge[] { return this.edges.filter(edge=>edge.from===formatId); }
  all():ConversionEdge[] { return [...this.edges]; }
}

const IMAGE_INPUTS=["jpeg","png","webp","gif","tiff","avif","heic","jxl","svg"];
const IMAGE_OUTPUTS=["jpeg","png","webp","gif","tiff","avif","jxl"];

function qualityLoss(target:string):number {
  if (target==="jpeg") return 0.12;
  if (target==="gif") return 0.22;
  if (target==="webp" || target==="avif" || target==="jxl") return 0.04;
  return 0;
}

export function createConversionGraph():ConversionGraph {
  const edges:ConversionEdge[]=[];
  for (const from of IMAGE_INPUTS) {
    for (const to of IMAGE_OUTPUTS) {
      edges.push({
        from,to,engineId:"vips-image",
        qualityLoss:qualityLoss(to),
        metadataLoss:from==="heic"?["EXIF","XMP","ICC"]:[],
        temporaryMultiplier:2,
        streaming:false,
        baseCost:0
      });
    }
  }

  const fallbackPairs=[
    ["jpeg","png"],["jpeg","webp"],["png","jpeg"],["png","webp"],
    ["webp","jpeg"],["webp","png"]
  ];
  for (const [from,to] of fallbackPairs) {
    edges.push({
      from,to,engineId:"browser-image-proof",
      qualityLoss:qualityLoss(to)+0.15,
      metadataLoss:["EXIF","XMP","ICC"],
      temporaryMultiplier:3,
      streaming:false,
      baseCost:500
    });
  }
  return new ConversionGraph(edges);
}
