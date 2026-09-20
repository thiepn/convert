export type RouteMode="semantic"|"fidelity"|"neutral";

export interface ConversionEdge {
  from:string;
  to:string;
  engineId:string;
  qualityLoss:number;
  metadataLoss:string[];
  temporaryMultiplier:number;
  streaming:boolean;
  baseCost?:number;
  mode?:RouteMode;
}

export class ConversionGraph {
  constructor(private readonly edges:ConversionEdge[]) {}
  outgoing(formatId:string):ConversionEdge[] { return this.edges.filter(edge=>edge.from===formatId); }
  all():ConversionEdge[] { return [...this.edges]; }
}

const IMAGE_INPUTS=["jpeg","png","webp","gif","tiff","avif","heic","jxl","svg"];
const IMAGE_OUTPUTS=["jpeg","png","webp","gif","tiff","avif","jxl"];
const MEDIA_INPUTS=["mp4","mov","webm-media","mkv","ogg","mp3","wav","flac","aac","mpegts"];
const MEDIA_OUTPUTS=["mp4","mov","webm-media","mkv","ogg","mp3","wav","flac","aac","mpegts"];

const SEMANTIC_INPUTS=["docx","docm","odt","rtf","html-doc","markdown","txt","latex","typst","epub","pptx","pptm"];
const SEMANTIC_OUTPUTS=["docx","odt","rtf","html-doc","markdown","txt","latex","typst","epub","pptx"];
const OFFICE_WRITER_INPUTS=["doc","docx","odt","rtf","html-doc","txt","epub"];
const OFFICE_WRITER_OUTPUTS=["pdf","docx","doc","odt","rtf","txt","html-doc"];
const OFFICE_PRESENTATION_INPUTS=["ppt","pptx","odp"];
const OFFICE_PRESENTATION_OUTPUTS=["pdf","pptx","ppt","odp","html-doc"];

function imageQualityLoss(target:string):number {
  if(target==="jpeg") return .12;
  if(target==="gif") return .22;
  if(target==="webp"||target==="avif"||target==="jxl") return .04;
  return 0;
}

function semanticCost(target:string):number{
  if(target==="docx") return 6;
  if(target==="pptx") return 7;
  if(target==="odt"||target==="epub") return 8;
  if(target==="html-doc") return 10;
  return 7;
}

export function createConversionGraph():ConversionGraph {
  const edges:ConversionEdge[]=[];

  for(const from of IMAGE_INPUTS){
    for(const to of IMAGE_OUTPUTS){
      edges.push({
        from,to,engineId:"vips-image",
        qualityLoss:imageQualityLoss(to),
        metadataLoss:from==="heic"?["EXIF","XMP","ICC"]:[],
        temporaryMultiplier:2,streaming:false,baseCost:0,mode:"neutral"
      });
    }
  }

  for(const [from,to] of [
    ["jpeg","png"],["jpeg","webp"],["png","jpeg"],["png","webp"],
    ["webp","jpeg"],["webp","png"]
  ]){
    edges.push({
      from,to,engineId:"browser-image-proof",
      qualityLoss:imageQualityLoss(to)+.15,
      metadataLoss:["EXIF","XMP","ICC"],
      temporaryMultiplier:3,streaming:false,baseCost:500,mode:"neutral"
    });
  }

  for(const from of MEDIA_INPUTS){
    for(const to of MEDIA_OUTPUTS){
      edges.push({
        from,to,engineId:"mediabunny",
        qualityLoss:0,metadataLoss:[],temporaryMultiplier:1.35,
        streaming:true,baseCost:5,mode:"neutral"
      });
    }
  }

  for(const from of ["jpeg","png"]){
    edges.push({
      from,to:"pdf",engineId:"pdf-engine",
      qualityLoss:0,metadataLoss:["image metadata"],temporaryMultiplier:2,
      streaming:false,baseCost:15,mode:"neutral"
    });
  }
  edges.push({
    from:"pdf",to:"pdf",engineId:"pdf-engine",
    qualityLoss:0,metadataLoss:[],temporaryMultiplier:2,streaming:false,baseCost:5,mode:"neutral"
  });

  for(const from of SEMANTIC_INPUTS){
    for(const to of SEMANTIC_OUTPUTS){
      edges.push({
        from,to,engineId:"pandoc-document",
        qualityLoss:from===to?0:.03,
        metadataLoss:[],
        temporaryMultiplier:4,
        streaming:false,
        baseCost:semanticCost(to),
        mode:"semantic"
      });
    }
  }

  for(const from of OFFICE_WRITER_INPUTS){
    for(const to of OFFICE_WRITER_OUTPUTS){
      edges.push({
        from,to,engineId:"libreoffice-document",
        qualityLoss:to==="pdf"||from===to?0:.015,
        metadataLoss:[],
        temporaryMultiplier:4,
        streaming:false,
        baseCost:5,
        mode:"fidelity"
      });
    }
  }
  for(const from of OFFICE_PRESENTATION_INPUTS){
    for(const to of OFFICE_PRESENTATION_OUTPUTS){
      edges.push({
        from,to,engineId:"libreoffice-document",
        qualityLoss:to==="pdf"||from===to?0:.015,
        metadataLoss:[],
        temporaryMultiplier:4,
        streaming:false,
        baseCost:5,
        mode:"fidelity"
      });
    }
  }

  for(const to of ["txt","markdown","html-doc","docx","odt","rtf","latex","typst","epub"]){
    edges.push({
      from:"pdf",to,engineId:"pdf-reconstruction",
      qualityLoss:.45,
      metadataLoss:["page layout","exact pagination","fonts","floating objects","forms","annotations"],
      temporaryMultiplier:3,
      streaming:false,
      baseCost:90,
      mode:"semantic"
    });
  }

  return new ConversionGraph(edges);
}
