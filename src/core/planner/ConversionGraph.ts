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
  rootOnly?:boolean;
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
const OFFICE_SPREADSHEET_INPUTS=["xls","xlsx","ods","csv"];
const OFFICE_SPREADSHEET_OUTPUTS=["pdf","xlsx","xls","ods","csv"];
const ARCHIVE_INPUTS=["zip","7z","rar","tar","gzip","bzip2","xz","zstd","tar-gzip","tar-bzip2","tar-xz","cpio"];
const ARCHIVE_OUTPUTS=["zip","7z","tar","tar-gzip","tar-bzip2","tar-xz"];
const SHEET_INPUTS=["xlsx","xlsm","xlsb","xls","ods","fods","csv","tsv","json-data","jsonl"];
const SHEET_OUTPUTS=["xlsx","xlsb","xls","ods","fods","csv","tsv","json-data"];
const DATA_FORMATS=["csv","tsv","json-data","jsonl","parquet","arrow"];
const SQLITE_OUTPUTS=["csv","tsv","json-data","jsonl"];
const SUBTITLE_FORMATS=["srt","vtt","ass"];
const MESH_FORMATS=["obj","stl","ply"];
const FONT_COMMON=["ttf","woff","woff2","eot"];
const LEGACY_MEDIA_INPUTS=["avi","flv","asf"];
const LEGACY_MEDIA_OUTPUTS=["mp4","webm-media","mp3","wav","flac","ogg"];

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

  for(const from of OFFICE_SPREADSHEET_INPUTS){
    for(const to of OFFICE_SPREADSHEET_OUTPUTS){
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

  for(const from of ARCHIVE_INPUTS){
    for(const to of ARCHIVE_OUTPUTS){
      edges.push({
        from,to,engineId:"archive-engine",
        qualityLoss:0,
        metadataLoss:["archive-specific compression metadata","unsupported special filesystem entries"],
        temporaryMultiplier:3,
        streaming:to==="zip",
        baseCost:18,
        mode:"neutral"
      });
    }
  }

  for(const from of SHEET_INPUTS){
    for(const to of SHEET_OUTPUTS){
      edges.push({
        from,to,engineId:"sheetjs-spreadsheet",
        qualityLoss:from===to?0:.02,
        metadataLoss:["unsupported workbook styling/features"],
        temporaryMultiplier:5,
        streaming:false,
        baseCost:8,
        mode:"semantic"
      });
    }
  }

  for(const from of DATA_FORMATS){
    for(const to of DATA_FORMATS){
      edges.push({
        from,to,engineId:"duckdb-data",
        qualityLoss:0,
        metadataLoss:[],
        temporaryMultiplier:2,
        streaming:false,
        baseCost:6,
        mode:"neutral"
      });
    }
  }

  edges.push({
    from:"sqlite",to:"sqlite",engineId:"sqlite-data",
    qualityLoss:0,metadataLoss:[],
    temporaryMultiplier:3,streaming:false,baseCost:2,mode:"semantic"
  });

  for(const to of SQLITE_OUTPUTS){
    edges.push({
      from:"sqlite",to,engineId:"sqlite-data",
      qualityLoss:0,metadataLoss:["indexes","constraints","triggers","multiple tables"],
      temporaryMultiplier:3,streaming:false,baseCost:10,mode:"semantic"
    });
  }
  for(const from of ["json-data","jsonl"]){
    edges.push({
      from,to:"sqlite",engineId:"sqlite-data",
      qualityLoss:0,metadataLoss:[],
      temporaryMultiplier:3,streaming:false,baseCost:10,mode:"semantic"
    });
  }


  for(const to of ["png","jpeg","webp"]){
    edges.push({
      from:"psd",to,engineId:"psd-layered",
      qualityLoss:to==="jpeg"?.12:to==="webp"?.04:0,
      metadataLoss:["layers","masks","editable text","smart objects","Photoshop editing data"],
      temporaryMultiplier:6,streaming:false,baseCost:25,mode:"neutral"
    });
  }

  edges.push({
    from:"camera-raw",to:"jpeg",engineId:"raw-preview",
    qualityLoss:.35,metadataLoss:["RAW sensor data","develop settings","full dynamic range"],
    temporaryMultiplier:2,streaming:false,baseCost:18,mode:"neutral"
  });

  for(const from of SUBTITLE_FORMATS){
    for(const to of SUBTITLE_FORMATS){
      edges.push({
        from,to,engineId:"subtitle-compat",
        qualityLoss:from===to?0:.01,
        metadataLoss:from==="ass"&&to!=="ass"?["styles","positioning","effects"]:[],
        temporaryMultiplier:2,streaming:false,baseCost:4,mode:"semantic"
      });
    }
  }

  for(const from of MESH_FORMATS){
    for(const to of MESH_FORMATS){
      edges.push({
        from,to,engineId:"mesh-compat",
        qualityLoss:0,
        metadataLoss:["materials","textures","normals","UVs","colors","scene hierarchy"],
        temporaryMultiplier:6,streaming:false,baseCost:14,mode:"semantic"
      });
    }
  }

  for(const from of FONT_COMMON){
    for(const to of FONT_COMMON){
      edges.push({
        from,to,engineId:"font-compat",
        qualityLoss:0,metadataLoss:[],
        temporaryMultiplier:12,streaming:false,baseCost:10,mode:"neutral"
      });
    }
  }
  edges.push({
    from:"otf",to:"ttf",engineId:"font-compat",
    qualityLoss:.03,metadataLoss:["OpenType/CFF-specific data"],
    temporaryMultiplier:12,streaming:false,baseCost:12,mode:"neutral"
  });

  for(const from of LEGACY_MEDIA_INPUTS){
    for(const to of LEGACY_MEDIA_OUTPUTS){
      edges.push({
        from,to,engineId:"ffmpeg-legacy",
        qualityLoss:["mp4","webm-media","mp3","ogg"].includes(to)?.12:0,
        metadataLoss:["container-specific metadata"],
        temporaryMultiplier:4,streaming:false,baseCost:80,mode:"neutral"
      });
    }
  }

  edges.push({
    from:"fb2",to:"html-doc",engineId:"fb2-compat",
    qualityLoss:.08,metadataLoss:["embedded images","FictionBook-specific metadata","notes/styles"],
    temporaryMultiplier:5,streaming:false,baseCost:16,mode:"semantic"
  });

  edges.push({
    from:"fits",to:"json-data",engineId:"scientific-metadata",
    qualityLoss:.9,metadataLoss:["scientific data arrays","tables","binary payloads"],
    temporaryMultiplier:1,streaming:false,baseCost:20,mode:"semantic",rootOnly:true
  });

  for(const to of ["txt","markdown","html-doc","docx","odt","rtf","latex","typst","epub"]){
    edges.push({
      from:"pdf",to,engineId:"pdf-reconstruction",
      qualityLoss:.45,
      metadataLoss:["page layout","exact pagination","fonts","floating objects","forms","annotations"],
      temporaryMultiplier:3,
      streaming:false,
      baseCost:90,
      mode:"semantic",
      rootOnly:true
    });
  }

  return new ConversionGraph(edges);
}
