export interface ArchiveEntryInfo {
  path:string;
  name:string;
  size:number;
  compressedSize:number|null;
  directory:boolean;
  encrypted:boolean|null;
  lastModified:number|null;
  comment:string|null;
  type?:"file"|"directory"|"symlink"|"other";
}

export interface DetailedArchiveInspection {
  formatId:string;
  files:number;
  directories:number;
  compressedSize:number;
  expandedSize:number;
  compressionRatio:number;
  encrypted:boolean|null;
  passwordRequired:boolean;
  entries:ArchiveEntryInfo[];
  duplicatePaths:string[];
  warnings:string[];
  engine:string;
}

export interface ArchiveConversionOptions {
  inputPassword?:string;
  outputPassword?:string;
  compressionLevel:number;
  preservePaths:boolean;
}

export interface ExtractedArchiveFile {
  path:string;
  blob:Blob;
  lastModified:number|null;
}
