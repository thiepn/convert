export interface PdfPageInfo {
  page:number;
  width:number;
  height:number;
  rotation:number;
  textItems:number;
  textChars:number;
  annotations:number;
  scanned:boolean;
}

export interface DetailedPdfInspection {
  pages:number;
  version:string|null;
  title:string|null;
  author:string|null;
  subject:string|null;
  creator:string|null;
  producer:string|null;
  textPages:number;
  scannedPages:number;
  mixed:boolean;
  forms:number;
  annotations:number;
  signatures:number;
  attachments:number;
  outlineItems:number;
  javascriptActions:number;
  permissions:number[]|null;
  pagesInfo:PdfPageInfo[];
  encrypted:boolean;
  passwordRequired:boolean;
  engine:string;
  warnings:string[];
}

export interface PdfRenderOptions {
  page:number;
  dpi:number;
  format:"png"|"jpeg"|"webp";
  quality:number;
  password?:string;
}

export interface PdfTextResult {
  text:string;
  pages:Array<{page:number;text:string}>;
}

export interface PdfSplitRange {
  name:string;
  pages:number[];
}

export interface PdfCreateImage {
  blob:Blob;
  format:"jpeg"|"png";
  name:string;
}

export interface PdfOcrOptions {
  language:string;
  dpi:number;
  pages:"scanned"|"all";
}

export type PdfOperation =
  | "optimize"
  | "linearize"
  | "repair"
  | "encrypt"
  | "decrypt"
  | "flatten-forms";
