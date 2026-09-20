export type DocumentRoutePreference = "semantic" | "fidelity";
export type TrackChangesPolicy = "accept" | "reject" | "all";
export type AssetPolicy = "extract" | "embed";

export interface DetailedDocumentInspection {
  formatId:string;
  family:"writer"|"presentation"|"ebook"|"text"|"legacy";
  compressedSize:number;
  expandedSize:number|null;
  packageEntries:number|null;
  paragraphs:number|null;
  headings:number|null;
  tables:number|null;
  images:number|null;
  comments:number|null;
  trackedChanges:number|null;
  footnotes:number|null;
  endnotes:number|null;
  equations:number|null;
  sections:number|null;
  slides:number|null;
  speakerNotes:number|null;
  charts:number|null;
  embeddedObjects:number|null;
  macros:boolean;
  externalLinks:number|null;
  fonts:string[];
  title:string|null;
  author:string|null;
  warnings:string[];
  engine:string;
}

export interface DocumentConversionOptions {
  routePreference:DocumentRoutePreference;
  trackChanges:TrackChangesPolicy;
  assets:AssetPolicy;
  standalone:boolean;
  tableOfContents:boolean;
  preserveComments:boolean;
  referenceDocument?:Blob;
  referenceDocumentName?:string;
  resources?:Array<{name:string;blob:Blob}>;
  fonts?:Array<{filename:string;data:ArrayBuffer}>;
}
