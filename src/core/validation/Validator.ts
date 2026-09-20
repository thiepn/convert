import { FormatRegistry } from "../formats/FormatRegistry";
import { inspectFile } from "../inspection/inspectFile";

export interface ValidationResult {
  valid:boolean;
  errors:string[];
  properties:Record<string,unknown>;
}

export interface OutputValidator {
  validate(blob:Blob,targetFormatId:string):Promise<ValidationResult>;
}

export class ImageOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe?: (blob:Blob,formatId:string)=>Promise<{width:number;height:number}>
  ) {}

  async validate(blob:Blob,targetFormatId:string):Promise<ValidationResult> {
    const target=this.formats.get(targetFormatId);
    const inspection=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    const errors:string[]=[];
    if (inspection.detection.format?.id!==targetFormatId) {
      errors.push("Output signature does not match requested format.");
    }
    if (blob.size===0) errors.push("Output is empty.");

    let width=inspection.width;
    let height=inspection.height;
    let decoded=false;
    try {
      if (typeof createImageBitmap==="function") {
        const bitmap=await createImageBitmap(blob);
        width=bitmap.width; height=bitmap.height; decoded=Boolean(width&&height);
        bitmap.close();
      }
    } catch {}

    if (!decoded && this.probe) {
      try {
        const result=await this.probe(blob,targetFormatId);
        width=result.width; height=result.height; decoded=Boolean(width&&height);
      } catch {}
    }

    if (!decoded && ["jpeg","png","webp","gif","avif"].includes(targetFormatId)) {
      errors.push("Output could not be decoded after conversion.");
    }
    if ((width!==undefined && width<=0)||(height!==undefined && height<=0)) {
      errors.push("Decoded output has invalid dimensions.");
    }
    return {
      valid:errors.length===0,
      errors,
      properties:{format:inspection.detection.format?.id,width,height,size:blob.size}
    };
  }
}
