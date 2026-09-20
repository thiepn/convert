import type {
  DetailedPdfInspection,
  PdfCreateImage,
  PdfRenderOptions,
  PdfSplitRange,
  PdfTextResult
} from "../../core/pdf/types";

type Base={requestId:string;pdfWorkerUrl:string};

export type PdfWorkerRequest =
  | (Base & {type:"inspect";source:Blob;password?:string})
  | (Base & {type:"render";source:Blob;options:PdfRenderOptions})
  | (Base & {type:"extract-text";source:Blob;password?:string})
  | (Base & {type:"merge";sources:Blob[]})
  | (Base & {type:"split";source:Blob;ranges:PdfSplitRange[];password?:string})
  | (Base & {type:"reorder";source:Blob;order:number[];password?:string})
  | (Base & {type:"rotate";source:Blob;pages:number[];degrees:90|180|270;password?:string})
  | (Base & {type:"flatten-forms";source:Blob;password?:string})
  | (Base & {type:"images-to-pdf";images:PdfCreateImage[];pageSize:"auto"|"a4"|"letter";margin:number})
  | (Base & {type:"combine-pages";original:Blob;replacements:Array<{page:number;pdf:Blob}>;password?:string});

export type PdfWorkerResponse =
  | {type:"inspection";requestId:string;inspection:DetailedPdfInspection}
  | {type:"render";requestId:string;blob:Blob;width:number;height:number}
  | {type:"text";requestId:string;result:PdfTextResult}
  | {type:"pdf";requestId:string;blob:Blob}
  | {type:"pdfs";requestId:string;outputs:Array<{name:string;blob:Blob}>}
  | {type:"error";requestId:string;code:string;message:string};
