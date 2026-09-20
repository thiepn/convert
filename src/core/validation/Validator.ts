import { FormatRegistry } from "../formats/FormatRegistry";
import { inspectFile } from "../inspection/inspectFile";
import type { DetailedMediaInspection } from "../media/types";
import type { DetailedPdfInspection } from "../pdf/types";
import type { DetailedDocumentInspection } from "../document/types";
import type { DetailedArchiveInspection } from "../archive/types";
import { parseSubtitle } from "../specialist/subtitles";
import { parseMesh } from "../specialist/mesh";
import type {
  DetailedSpreadsheetInspection,
  DetailedDataInspection,
  DetailedDatabaseInspection
} from "../data/types";

export interface ValidationResult {
  valid:boolean;
  errors:string[];
  properties:Record<string,unknown>;
}

export interface OutputValidator {
  validate(blob:Blob,targetFormatId:string,options?:Record<string,unknown>):Promise<ValidationResult>;
}

export class ImageOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe?:(blob:Blob,formatId:string)=>Promise<{width:number;height:number}>
  ) {}

  async validate(blob:Blob,targetFormatId:string,_options:Record<string,unknown>={}):Promise<ValidationResult>{
    const target=this.formats.get(targetFormatId);
    const inspection=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    const errors:string[]=[];
    if(inspection.detection.format?.id!==targetFormatId) errors.push("Output signature does not match requested format.");
    if(blob.size===0) errors.push("Output is empty.");

    let width=inspection.width,height=inspection.height,decoded=false;
    try{
      if(typeof createImageBitmap==="function"){
        const bitmap=await createImageBitmap(blob);
        width=bitmap.width;height=bitmap.height;decoded=Boolean(width&&height);
        bitmap.close();
      }
    }catch{}

    if(!decoded&&this.probe){
      try{
        const result=await this.probe(blob,targetFormatId);
        width=result.width;height=result.height;decoded=Boolean(width&&height);
      }catch{}
    }

    if(!decoded&&["jpeg","png","webp","gif","avif"].includes(targetFormatId)){
      errors.push("Output could not be decoded after conversion.");
    }
    return {valid:errors.length===0,errors,properties:{format:inspection.detection.format?.id,width,height,size:blob.size}};
  }
}

export class MediaOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe:(blob:Blob)=>Promise<DetailedMediaInspection>
  ) {}

  async validate(blob:Blob,targetFormatId:string,_options:Record<string,unknown>={}):Promise<ValidationResult>{
    const target=this.formats.get(targetFormatId);
    const errors:string[]=[];
    if(blob.size===0) errors.push("Output is empty.");

    const shallow=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    if(shallow.detection.format?.id!==targetFormatId) errors.push("Output container signature does not match requested format.");

    let media:DetailedMediaInspection|null=null;
    try{media=await this.probe(blob);}catch{errors.push("Output could not be reopened by the media parser.");}
    if(media){
      if(media.tracks.length===0) errors.push("Output contains no media tracks.");
      if(media.duration!=null&&media.duration<0) errors.push("Output reports an invalid negative duration.");
    }
    return {
      valid:errors.length===0,
      errors,
      properties:{format:shallow.detection.format?.id,size:blob.size,duration:media?.duration??null,tracks:media?.tracks.length??0}
    };
  }
}

export class PdfOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe:(blob:Blob,password?:string)=>Promise<DetailedPdfInspection>
  ) {}

  async validate(blob:Blob,targetFormatId:string,options:Record<string,unknown>={}):Promise<ValidationResult>{
    const errors:string[]=[];
    const shallow=await inspectFile(Object.assign(blob,{name:"output.pdf"}),this.formats);
    if(shallow.detection.format?.id!=="pdf") errors.push("Output signature is not PDF.");
    if(blob.size===0) errors.push("Output is empty.");

    const password=String(options.newPassword??options.password??"")||undefined;
    let pdf:DetailedPdfInspection|null=null;
    try{pdf=await this.probe(blob,password);}
    catch(error){errors.push("Output PDF could not be reopened: "+(error instanceof Error?error.message:String(error)));}

    if(pdf&&pdf.pages<1) errors.push("Output PDF contains no pages.");
    return {
      valid:errors.length===0,
      errors,
      properties:{format:targetFormatId,size:blob.size,pages:pdf?.pages??null,scannedPages:pdf?.scannedPages??null}
    };
  }
}


export class DocumentOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe:(blob:Blob,formatId:string)=>Promise<DetailedDocumentInspection>
  ) {}

  async validate(blob:Blob,targetFormatId:string,_options:Record<string,unknown>={}):Promise<ValidationResult>{
    const target=this.formats.get(targetFormatId);
    const errors:string[]=[];
    if(blob.size===0) errors.push("Output is empty.");

    const shallow=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    if(shallow.detection.format?.id!==targetFormatId){
      errors.push("Output format does not match the requested document type.");
    }

    let document:DetailedDocumentInspection|null=null;
    try{document=await this.probe(blob,targetFormatId);}
    catch(error){errors.push("Output document could not be reopened: "+(error instanceof Error?error.message:String(error)));}

    return {
      valid:errors.length===0,
      errors,
      properties:{
        format:shallow.detection.format?.id,
        size:blob.size,
        paragraphs:document?.paragraphs??null,
        slides:document?.slides??null,
        packageEntries:document?.packageEntries??null
      }
    };
  }
}


export class ArchiveOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe:(blob:Blob,formatId:string,password?:string)=>Promise<DetailedArchiveInspection>
  ) {}

  async validate(blob:Blob,targetFormatId:string,options:Record<string,unknown>={}):Promise<ValidationResult>{
    const target=this.formats.get(targetFormatId);
    const errors:string[]=[];
    if(blob.size===0) errors.push("Output is empty.");

    const shallow=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    if(shallow.detection.format?.id!==targetFormatId){
      errors.push("Output archive signature/format does not match the requested target.");
    }

    const password=String(options.outputPassword??"")||undefined;
    let archive:DetailedArchiveInspection|null=null;
    try{archive=await this.probe(blob,targetFormatId,password);}
    catch(error){errors.push("Output archive could not be reopened: "+(error instanceof Error?error.message:String(error)));}

    return {
      valid:errors.length===0,
      errors,
      properties:{
        format:shallow.detection.format?.id,
        size:blob.size,
        files:archive?.files??null,
        expandedSize:archive?.expandedSize??null,
        encrypted:archive?.encrypted??null
      }
    };
  }
}


export class SpreadsheetOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe:(blob:Blob,formatId:string)=>Promise<DetailedSpreadsheetInspection>
  ) {}

  async validate(blob:Blob,targetFormatId:string,_options:Record<string,unknown>={}):Promise<ValidationResult>{
    const target=this.formats.get(targetFormatId);
    const errors:string[]=[];
    if(blob.size===0) errors.push("Output is empty.");
    const shallow=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    if(shallow.detection.format?.id!==targetFormatId){
      errors.push("Output workbook format does not match requested target.");
    }
    let workbook:DetailedSpreadsheetInspection|null=null;
    try{workbook=await this.probe(blob,targetFormatId);}
    catch(error){errors.push("Output workbook could not be reopened: "+(error instanceof Error?error.message:String(error)));}
    if(workbook&&workbook.sheets.length===0) errors.push("Output workbook contains no worksheets.");
    return {
      valid:errors.length===0,
      errors,
      properties:{format:shallow.detection.format?.id,size:blob.size,sheets:workbook?.sheets.length??null}
    };
  }
}

export class DataOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe:(blob:Blob,formatId:string,options?:Record<string,unknown>)=>Promise<DetailedDataInspection>
  ) {}

  async validate(blob:Blob,targetFormatId:string,options:Record<string,unknown>={}):Promise<ValidationResult>{
    const target=this.formats.get(targetFormatId);
    const errors:string[]=[];
    if(blob.size===0) errors.push("Output is empty.");
    const shallow=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    if(shallow.detection.format?.id!==targetFormatId){
      errors.push("Output data format does not match requested target.");
    }
    let data:DetailedDataInspection|null=null;
    try{data=await this.probe(blob,targetFormatId,options);}
    catch(error){errors.push("Output data could not be reopened: "+(error instanceof Error?error.message:String(error)));}
    return {
      valid:errors.length===0,
      errors,
      properties:{format:shallow.detection.format?.id,size:blob.size,rows:data?.rows??null,columns:data?.columns.length??null}
    };
  }
}

export class DatabaseOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly probe:(blob:Blob)=>Promise<DetailedDatabaseInspection>
  ) {}

  async validate(blob:Blob,targetFormatId:string,_options:Record<string,unknown>={}):Promise<ValidationResult>{
    const errors:string[]=[];
    if(blob.size===0) errors.push("Output is empty.");
    const shallow=await inspectFile(Object.assign(blob,{name:"output.sqlite"}),this.formats);
    if(shallow.detection.format?.id!=="sqlite") errors.push("Output signature is not SQLite.");
    let database:DetailedDatabaseInspection|null=null;
    try{database=await this.probe(blob);}
    catch(error){errors.push("Output SQLite database could not be reopened: "+(error instanceof Error?error.message:String(error)));}
    return {
      valid:errors.length===0,
      errors,
      properties:{format:targetFormatId,size:blob.size,tables:database?.tables.length??null}
    };
  }
}


export class SpecialistOutputValidator implements OutputValidator {
  constructor(private readonly formats:FormatRegistry) {}

  async validate(blob:Blob,targetFormatId:string,_options:Record<string,unknown>={}):Promise<ValidationResult>{
    const target=this.formats.get(targetFormatId);
    const errors:string[]=[];
    if(blob.size===0) errors.push("Output is empty.");
    const shallow=await inspectFile(
      Object.assign(blob,{name:"output."+(target?.extensions[0]??"bin")}),
      this.formats
    );
    if(shallow.detection.format?.id!==targetFormatId){
      errors.push("Output format does not match requested specialist target.");
    }

    if(target?.category==="subtitle"){
      try{parseSubtitle(await blob.text(),targetFormatId);}
      catch(error){errors.push("Subtitle output could not be reparsed: "+(error instanceof Error?error.message:String(error)));}
    }
    if(target?.category==="model"&&["obj","stl","ply"].includes(targetFormatId)){
      try{parseMesh(new Uint8Array(await blob.arrayBuffer()),targetFormatId);}
      catch(error){errors.push("Mesh output could not be reparsed: "+(error instanceof Error?error.message:String(error)));}
    }

    return {
      valid:errors.length===0,
      errors,
      properties:{format:shallow.detection.format?.id,size:blob.size,category:target?.category??null}
    };
  }
}

export class UniversalOutputValidator implements OutputValidator {
  constructor(
    private readonly formats:FormatRegistry,
    private readonly image:ImageOutputValidator,
    private readonly media:MediaOutputValidator,
    private readonly pdf:PdfOutputValidator,
    private readonly document:DocumentOutputValidator,
    private readonly archive:ArchiveOutputValidator,
    private readonly spreadsheet:SpreadsheetOutputValidator,
    private readonly data:DataOutputValidator,
    private readonly database:DatabaseOutputValidator,
    private readonly specialist:SpecialistOutputValidator
  ) {}

  validate(blob:Blob,targetFormatId:string,options:Record<string,unknown>={}):Promise<ValidationResult>{
    const category=this.formats.get(targetFormatId)?.category;
    if(category==="image") return this.image.validate(blob,targetFormatId,options);
    if(category==="audio"||category==="video") return this.media.validate(blob,targetFormatId,options);
    if(category==="pdf") return this.pdf.validate(blob,targetFormatId,options);
    if(category==="document") return this.document.validate(blob,targetFormatId,options);
    if(category==="archive") return this.archive.validate(blob,targetFormatId,options);
    if(category==="spreadsheet") return this.spreadsheet.validate(blob,targetFormatId,options);
    if(category==="data") return this.data.validate(blob,targetFormatId,options);
    if(category==="database") return this.database.validate(blob,targetFormatId,options);
    if(["layered","raw","font","subtitle","model","vector","scientific","ebook-legacy"].includes(category??"")){
      return this.specialist.validate(blob,targetFormatId,options);
    }
    return Promise.resolve({valid:blob.size>0,errors:blob.size?[]:["Output is empty."],properties:{size:blob.size}});
  }
}
