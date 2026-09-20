import {
  BlobReader,
  BlobWriter,
  ZipReader,
  ZipWriter
} from "@zip.js/zip.js";
import {
  Archive,
  ArchiveCompression,
  ArchiveFormat
} from "libarchive.js";
import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import {
  assessArchiveEntries,
  assertExtractionBudget,
  normalizeArchivePath
} from "../../core/archive/security";
import type {
  ArchiveConversionOptions,
  ArchiveEntryInfo,
  DetailedArchiveInspection,
  ExtractedArchiveFile
} from "../../core/archive/types";

const INPUTS=new Set([
  "zip","7z","rar","tar","gzip","bzip2","xz","zstd",
  "tar-gzip","tar-bzip2","tar-xz","cpio"
]);
const OUTPUTS=new Set(["zip","7z","tar","tar-gzip","tar-bzip2","tar-xz"]);

const MIME:Record<string,string>={
  zip:"application/zip",
  "7z":"application/x-7z-compressed",
  tar:"application/x-tar",
  "tar-gzip":"application/gzip",
  "tar-bzip2":"application/x-bzip2",
  "tar-xz":"application/x-xz"
};

const EXT:Record<string,string>={
  zip:"zip","7z":"7z",tar:"tar","tar-gzip":"tar.gz","tar-bzip2":"tar.bz2","tar-xz":"tar.xz"
};

function defaultOptions():ArchiveConversionOptions{
  return {compressionLevel:6,preservePaths:true};
}

function toFile(source:Blob,name:string):File{
  if(source instanceof File) return source;
  return new File([source],name,{type:source.type||"application/octet-stream"});
}

function basename(path:string):string{
  const parts=path.split("/");
  return parts[parts.length-1]||"file";
}

export class ArchiveEngine implements ConversionEngine{
  readonly id="archive-engine";
  readonly version="zip.js-2.16.0+libarchive.js-2.0.2";
  private workerUrl="";
  private available=false;

  async prepare():Promise<void>{
    this.workerUrl=new URL("engines/libarchive/worker-bundle.js",document.baseURI).href;
    Archive.init({workerUrl:this.workerUrl});
    this.available=typeof Worker!=="undefined"&&typeof WebAssembly!=="undefined";
  }

  isAvailable():boolean{return this.available;}

  canConvert(from:string,to:string):boolean{
    return INPUTS.has(from)&&OUTPUTS.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    return {
      temporaryBytes:Math.max(256*1024*1024,source.size*3),
      outputBytes:null,
      notes:[
        "Archive repacking materializes extracted entries in browser memory.",
        "ZIP output streams incrementally when an OPFS output handle is available."
      ]
    };
  }

  async inspect(
    source:Blob,
    sourceFormatId:string,
    password?:string
  ):Promise<DetailedArchiveInspection>{
    if(sourceFormatId==="zip") return this.inspectZip(source,password);
    return this.inspectLibarchive(source,sourceFormatId,password);
  }

  async extract(
    source:Blob,
    sourceFormatId:string,
    password?:string,
    selectedPaths?:string[],
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<ExtractedArchiveFile[]>{
    const inspection=await this.inspect(source,sourceFormatId,password);
    const selected=selectedPaths?.length?new Set(selectedPaths.map(normalizeArchivePath)):null;
    const candidates=inspection.entries.filter(entry=>!entry.directory&&(!selected||selected.has(entry.path)));
    const selectedSize=candidates.reduce((sum,entry)=>sum+entry.size,0);
    assertExtractionBudget(selectedSize,candidates.length);

    if(sourceFormatId==="zip"){
      return this.extractZip(source,password,selected,onProgress);
    }
    return this.extractLibarchive(source,sourceFormatId,password,selected,onProgress);
  }

  async createFromFiles(
    files:Array<{blob:Blob;path:string;lastModified?:number|null}>,
    targetFormatId:string,
    options:Partial<ArchiveConversionOptions>={},
    outputHandle?:FileSystemFileHandle,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<{blob:Blob;outputInWorkspace:boolean}>{
    if(!OUTPUTS.has(targetFormatId)){
      throw new Error("ARCHIVE_TARGET_UNSUPPORTED: Unsupported archive output.");
    }
    if(!files.length) throw new Error("ARCHIVE_EMPTY: No files selected.");

    const normalized=files.map(item=>({
      ...item,
      path:normalizeArchivePath(item.path)
    }));
    const total=normalized.reduce((sum,item)=>sum+item.blob.size,0);
    const mobile=typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
    const maxTotal=mobile?256*1024*1024:1024*1024*1024;
    if(total>maxTotal){
      throw new Error("ARCHIVE_CREATE_BUDGET: Selected files exceed the browser archive-creation memory budget.");
    }

    const merged={...defaultOptions(),...options};
    if(targetFormatId==="zip"){
      return this.createZip(normalized,merged,outputHandle,onProgress);
    }
    return this.createLibarchive(normalized,targetFormatId,outputHandle,onProgress);
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("ARCHIVE_ROUTE_UNSUPPORTED: Unsupported archive route.");
    }
    const options={...defaultOptions(),...(request.options??{})} as ArchiveConversionOptions;

    request.onProgress?.(.04,"Inspecting archive entries");
    const inspection=await this.inspect(request.source,request.sourceFormatId,options.inputPassword);
    assertExtractionBudget(inspection.expandedSize,inspection.files);

    request.onProgress?.(.12,"Extracting archive locally");
    const extracted=await this.extract(
      request.source,
      request.sourceFormatId,
      options.inputPassword,
      undefined,
      (progress,stage)=>request.onProgress?.(.12+progress*.48,stage)
    );

    request.signal.throwIfAborted?.();
    request.onProgress?.(.62,"Creating "+request.targetFormatId.toUpperCase()+" archive");
    const created=await this.createFromFiles(
      extracted.map(item=>({blob:item.blob,path:item.path,lastModified:item.lastModified})),
      request.targetFormatId,
      options,
      request.outputHandle,
      (progress,stage)=>request.onProgress?.(.62+progress*.34,stage)
    );

    return {
      blob:created.blob,
      outputInWorkspace:created.outputInWorkspace,
      warnings:[
        ...inspection.warnings,
        "Archive was repacked by extracting entries locally and creating a new container."
      ]
    };
  }

  dispose():void{}

  private async inspectZip(source:Blob,password?:string):Promise<DetailedArchiveInspection>{
    const reader=new ZipReader(new BlobReader(source),password?{password}:undefined as any);
    try{
      const raw=await reader.getEntries();
      const entries:ArchiveEntryInfo[]=raw.map((entry:any)=>({
        path:String(entry.filename??""),
        name:basename(String(entry.filename??"")),
        size:Number(entry.uncompressedSize??0),
        compressedSize:Number.isFinite(entry.compressedSize)?Number(entry.compressedSize):null,
        directory:Boolean(entry.directory),
        encrypted:Boolean(entry.encrypted),
        lastModified:entry.lastModDate instanceof Date?entry.lastModDate.getTime():null,
        comment:typeof entry.comment==="string"?entry.comment:null
      }));
      const assessed=assessArchiveEntries(entries,source.size);
      const encrypted=assessed.normalized.some(entry=>entry.encrypted===true);
      return {
        formatId:"zip",
        files:assessed.normalized.filter(entry=>!entry.directory).length,
        directories:assessed.normalized.filter(entry=>entry.directory).length,
        compressedSize:source.size,
        expandedSize:assessed.expandedSize,
        compressionRatio:source.size?assessed.expandedSize/source.size:1,
        encrypted,
        passwordRequired:encrypted&&!password,
        entries:assessed.normalized,
        duplicatePaths:assessed.duplicatePaths,
        warnings:assessed.warnings,
        engine:"zip.js 2.16.0"
      };
    }finally{
      await reader.close();
    }
  }

  private async inspectLibarchive(
    source:Blob,
    sourceFormatId:string,
    password?:string
  ):Promise<DetailedArchiveInspection>{
    const file=toFile(source,"archive."+sourceFormatId);
    const archive=await Archive.open(file);
    try{
      const encrypted=await archive.hasEncryptedData();
      if(password) await archive.usePassword(password);

      let listed:any[];
      try{
        listed=await archive.getFilesArray();
      }catch(error){
        if(encrypted&&!password){
          throw new Error("ARCHIVE_PASSWORD_REQUIRED: Encrypted archive requires a password before its entries can be listed.");
        }
        throw error;
      }

      const entries:ArchiveEntryInfo[]=listed.map((item:any)=>{
        const parent=String(item.path??"").replaceAll("\\","/");
        const name=String(item.file?.name??"file");
        const path=(parent.endsWith("/")||!parent?parent:parent+"/")+name;
        return {
          path,
          name,
          size:Number(item.file?.size??0),
          compressedSize:null,
          directory:false,
          encrypted:encrypted===null?null:Boolean(encrypted),
          lastModified:Number.isFinite(item.file?.lastModified)?Math.floor(Number(item.file.lastModified)/1_000_000):null,
          comment:null
        };
      });

      const assessed=assessArchiveEntries(entries,source.size);
      return {
        formatId:sourceFormatId,
        files:assessed.normalized.length,
        directories:0,
        compressedSize:source.size,
        expandedSize:assessed.expandedSize,
        compressionRatio:source.size?assessed.expandedSize/source.size:1,
        encrypted,
        passwordRequired:Boolean(encrypted)&&!password,
        entries:assessed.normalized,
        duplicatePaths:assessed.duplicatePaths,
        warnings:assessed.warnings,
        engine:"libarchive.js 2.0.2"
      };
    }finally{
      await archive.close();
    }
  }

  private async extractZip(
    source:Blob,
    password:string|undefined,
    selected:Set<string>|null,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<ExtractedArchiveFile[]>{
    const reader=new ZipReader(new BlobReader(source),password?{password}:undefined as any);
    const outputs:ExtractedArchiveFile[]=[];
    try{
      const entries=(await reader.getEntries()).filter((entry:any)=>!entry.directory);
      const targets=entries.filter((entry:any)=>!selected||selected.has(normalizeArchivePath(String(entry.filename))));
      for(let index=0;index<targets.length;index++){
        const entry:any=targets[index];
        const path=normalizeArchivePath(String(entry.filename));
        onProgress?.(index/Math.max(1,targets.length),"Extracting "+path);
        const writer=new BlobWriter("application/octet-stream");
        const blob=await entry.getData(writer,password?{password}:undefined);
        outputs.push({
          path,
          blob,
          lastModified:entry.lastModDate instanceof Date?entry.lastModDate.getTime():null
        });
      }
      onProgress?.(1,"Archive extracted");
      return outputs;
    }finally{
      await reader.close();
    }
  }

  private async extractLibarchive(
    source:Blob,
    sourceFormatId:string,
    password:string|undefined,
    selected:Set<string>|null,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<ExtractedArchiveFile[]>{
    const archive=await Archive.open(toFile(source,"archive."+sourceFormatId));
    const outputs:ExtractedArchiveFile[]=[];
    try{
      if(password) await archive.usePassword(password);
      const entries=await archive.getFilesArray();
      const targets=entries.filter((item:any)=>{
        const parent=String(item.path??"").replaceAll("\\","/");
        const path=normalizeArchivePath((parent.endsWith("/")||!parent?parent:parent+"/")+String(item.file?.name??"file"));
        return !selected||selected.has(path);
      });
      for(let index=0;index<targets.length;index++){
        const item:any=targets[index];
        const parent=String(item.path??"").replaceAll("\\","/");
        const path=normalizeArchivePath((parent.endsWith("/")||!parent?parent:parent+"/")+String(item.file?.name??"file"));
        onProgress?.(index/Math.max(1,targets.length),"Extracting "+path);
        const file:File=await item.file.extract();
        outputs.push({path,blob:file,lastModified:file.lastModified||null});
      }
      onProgress?.(1,"Archive extracted");
      return outputs;
    }finally{
      await archive.close();
    }
  }

  private async createZip(
    files:Array<{blob:Blob;path:string;lastModified?:number|null}>,
    options:ArchiveConversionOptions,
    outputHandle?:FileSystemFileHandle,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<{blob:Blob;outputInWorkspace:boolean}>{
    const writerOptions:any={
      zip64:true,
      bufferedWrite:false
    };
    if(options.outputPassword){
      writerOptions.password=options.outputPassword;
      writerOptions.encryptionStrength=3;
    }

    let sink:any;
    let blobWriter:BlobWriter|undefined;
    let writable:FileSystemWritableFileStream|undefined;
    if(outputHandle){
      writable=await outputHandle.createWritable();
      sink=writable;
    }else{
      blobWriter=new BlobWriter("application/zip");
      sink=blobWriter;
    }

    const writer=new ZipWriter(sink,writerOptions);
    try{
      for(let index=0;index<files.length;index++){
        const item=files[index];
        const path=options.preservePaths?item.path:basename(item.path);
        onProgress?.(index/Math.max(1,files.length),"Compressing "+path);
        await writer.add(path,new BlobReader(item.blob),{
          level:Math.max(0,Math.min(9,Math.round(options.compressionLevel))),
          lastModDate:item.lastModified?new Date(item.lastModified):undefined
        });
      }
      await writer.close();
    }catch(error){
      try{await writer.close();}catch{}
      throw error;
    }

    onProgress?.(1,"ZIP archive complete");
    if(outputHandle){
      const blob=await outputHandle.getFile();
      return {blob,outputInWorkspace:true};
    }
    const blob=await blobWriter!.getData();
    return {blob,outputInWorkspace:false};
  }

  private async createLibarchive(
    files:Array<{blob:Blob;path:string;lastModified?:number|null}>,
    targetFormatId:string,
    outputHandle?:FileSystemFileHandle,
    onProgress?:(progress:number,stage:string)=>void
  ):Promise<{blob:Blob;outputInWorkspace:boolean}>{
    const mapping:Record<string,{format:ArchiveFormat;compression:ArchiveCompression}>={
      "7z":{format:ArchiveFormat.SEVEN_ZIP,compression:ArchiveCompression.LZMA},
      tar:{format:ArchiveFormat.USTAR,compression:ArchiveCompression.NONE},
      "tar-gzip":{format:ArchiveFormat.USTAR,compression:ArchiveCompression.GZIP},
      "tar-bzip2":{format:ArchiveFormat.USTAR,compression:ArchiveCompression.BZIP2},
      "tar-xz":{format:ArchiveFormat.USTAR,compression:ArchiveCompression.XZ}
    };
    const config=mapping[targetFormatId];
    if(!config) throw new Error("ARCHIVE_TARGET_UNSUPPORTED: Unsupported libarchive output.");

    onProgress?.(.05,"Preparing archive writer");
    const inputFiles=files.map(item=>({
      file:new File([item.blob],basename(item.path),{
        type:item.blob.type||"application/octet-stream",
        lastModified:item.lastModified??Date.now()
      }),
      pathname:item.path
    }));

    const output=await Archive.write({
      files:inputFiles as any,
      outputFileName:"output."+EXT[targetFormatId],
      compression:config.compression,
      format:config.format,
      passphrase:null
    } as any);

    let blob:Blob=new Blob([await output.arrayBuffer()],{type:MIME[targetFormatId]||"application/octet-stream"});
    if(outputHandle){
      const writer=await outputHandle.createWritable();
      await writer.write(blob);
      await writer.close();
      blob=await outputHandle.getFile();
    }
    onProgress?.(1,"Archive complete");
    return {blob,outputInWorkspace:Boolean(outputHandle)};
  }
}
