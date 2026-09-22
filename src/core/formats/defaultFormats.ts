import { FormatRegistry } from "./FormatRegistry";
import type { FormatDefinition } from "./types";

const ascii = (bytes:Uint8Array,start:number,length:number) =>
  String.fromCharCode(...bytes.slice(start,start+length));

const isIsoBmffBrand = (bytes:Uint8Array,brands:string[]) => {
  if (bytes.length<12 || ascii(bytes,4,4)!=="ftyp") return false;
  const end=Math.min(bytes.length,96);
  for(let offset=8;offset+4<=end;offset+=4){
    if(brands.includes(ascii(bytes,offset,4))) return true;
  }
  return false;
};

const isSvg = (bytes:Uint8Array) => {
  try {
    const text=new TextDecoder().decode(bytes.slice(0,Math.min(bytes.length,8192)))
      .replace(/^\uFEFF/,"").trimStart();
    return /^(?:<\?xml[^>]*>\s*)?(?:<!--(?:.|\n|\r)*?-->\s*)*<svg(?:\s|>)/i.test(text);
  } catch { return false; }
};

const isRiff=(bytes:Uint8Array,type:string) =>
  bytes.length>=12 && ascii(bytes,0,4)==="RIFF" && ascii(bytes,8,4)===type;

const starts=(bytes:Uint8Array,values:number[]) =>
  bytes.length>=values.length && values.every((v,i)=>bytes[i]===v);

const isEbml=(bytes:Uint8Array)=>starts(bytes,[0x1a,0x45,0xdf,0xa3]);
const ebmlHeaderText=(bytes:Uint8Array)=>{
  try { return new TextDecoder().decode(bytes.slice(0,Math.min(bytes.length,4096))).toLowerCase(); }
  catch { return ""; }
};

export const JPEG:FormatDefinition={
  id:"jpeg",name:"JPEG",category:"image",extensions:["jpg","jpeg","jpe"],mimeTypes:["image/jpeg"],
  signatures:[[{offset:0,bytes:[0xff,0xd8,0xff]}]],
  capabilities:{alpha:false,animation:false,hdr:false,metadata:true},status:"production"
};
export const PNG:FormatDefinition={
  id:"png",name:"PNG",category:"image",extensions:["png"],mimeTypes:["image/png"],
  signatures:[[{offset:0,bytes:[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]}]],
  capabilities:{alpha:true,animation:false,hdr:false,metadata:true},status:"production"
};
export const WEBP:FormatDefinition={
  id:"webp",name:"WebP",category:"image",extensions:["webp"],mimeTypes:["image/webp"],
  signatures:[[{offset:0,bytes:[0x52,0x49,0x46,0x46]},{offset:8,bytes:[0x57,0x45,0x42,0x50]}]],
  capabilities:{alpha:true,animation:true,hdr:false,metadata:true},status:"production"
};
export const GIF:FormatDefinition={
  id:"gif",name:"GIF",category:"image",extensions:["gif"],mimeTypes:["image/gif"],
  signatures:[
    [{offset:0,bytes:[0x47,0x49,0x46,0x38,0x37,0x61]}],
    [{offset:0,bytes:[0x47,0x49,0x46,0x38,0x39,0x61]}]
  ],
  capabilities:{alpha:true,animation:true,hdr:false,metadata:false},status:"production"
};
export const TIFF:FormatDefinition={
  id:"tiff",name:"TIFF",category:"image",extensions:["tif","tiff"],mimeTypes:["image/tiff"],
  signatures:[
    [{offset:0,bytes:[0x49,0x49,0x2a,0x00]}],
    [{offset:0,bytes:[0x4d,0x4d,0x00,0x2a]}]
  ],
  capabilities:{alpha:true,animation:false,hdr:true,metadata:true,multiplePages:true},status:"production"
};
export const AVIF:FormatDefinition={
  id:"avif",name:"AVIF",category:"image",extensions:["avif"],mimeTypes:["image/avif"],
  signatures:[],matcher:bytes=>isIsoBmffBrand(bytes,["avif","avis"]),
  capabilities:{alpha:true,animation:true,hdr:true,metadata:true},status:"beta"
};
export const HEIC:FormatDefinition={
  id:"heic",name:"HEIC / HEIF",category:"image",extensions:["heic","heif","hif"],
  mimeTypes:["image/heic","image/heif","image/heic-sequence","image/heif-sequence"],
  signatures:[],matcher:bytes=>isIsoBmffBrand(bytes,["heic","heix","hevc","hevx","heis","heim"]),
  capabilities:{alpha:true,animation:false,hdr:true,metadata:true,multiplePages:true},
  readOnly:true,status:"beta"
};
export const JXL:FormatDefinition={
  id:"jxl",name:"JPEG XL",category:"image",extensions:["jxl"],mimeTypes:["image/jxl"],
  signatures:[
    [{offset:0,bytes:[0xff,0x0a]}],
    [{offset:0,bytes:[0x00,0x00,0x00,0x0c,0x4a,0x58,0x4c,0x20,0x0d,0x0a,0x87,0x0a]}]
  ],
  capabilities:{alpha:true,animation:true,hdr:true,metadata:true},status:"beta"
};
export const SVG:FormatDefinition={
  id:"svg",name:"SVG",category:"image",extensions:["svg","svgz"],mimeTypes:["image/svg+xml"],
  signatures:[],matcher:isSvg,
  capabilities:{alpha:true,animation:false,hdr:false,metadata:true,vector:true},
  readOnly:true,status:"production"
};

export const MP4:FormatDefinition={
  id:"mp4",name:"MP4 / M4A",category:"video",
  extensions:["mp4","m4v","m4a","f4v"],mimeTypes:["video/mp4","audio/mp4","application/mp4"],
  signatures:[],matcher:bytes=>isIsoBmffBrand(bytes,[
    "isom","iso2","iso3","iso4","iso5","iso6","mp41","mp42","M4V ","M4A ","avc1","dash"
  ]),
  capabilities:{metadata:true,multipleStreams:true,subtitles:true,chapters:true,hdr:true},
  status:"production"
};
export const MOV:FormatDefinition={
  id:"mov",name:"QuickTime MOV",category:"video",extensions:["mov","qt"],
  mimeTypes:["video/quicktime"],signatures:[],matcher:bytes=>isIsoBmffBrand(bytes,["qt  "]),
  capabilities:{metadata:true,multipleStreams:true,subtitles:true,chapters:true,hdr:true},
  status:"production"
};
export const WEBM_MEDIA:FormatDefinition={
  id:"webm-media",name:"WebM",category:"video",extensions:["webm"],mimeTypes:["video/webm","audio/webm"],
  signatures:[],matcher:bytes=>isEbml(bytes)&&ebmlHeaderText(bytes).includes("webm"),
  capabilities:{metadata:true,multipleStreams:true,subtitles:true,chapters:true,hdr:true},
  status:"production"
};
export const MKV:FormatDefinition={
  id:"mkv",name:"Matroska MKV",category:"video",extensions:["mkv","mka","mks"],mimeTypes:["video/x-matroska","audio/x-matroska"],
  signatures:[],matcher:bytes=>isEbml(bytes)&&!ebmlHeaderText(bytes).includes("webm"),
  capabilities:{metadata:true,multipleStreams:true,subtitles:true,chapters:true,hdr:true},
  status:"production"
};
export const OGG:FormatDefinition={
  id:"ogg",name:"Ogg",category:"audio",extensions:["ogg","oga","ogv","opus"],mimeTypes:["audio/ogg","video/ogg"],
  signatures:[[{offset:0,bytes:[0x4f,0x67,0x67,0x53]}]],
  capabilities:{metadata:true,multipleStreams:true},status:"production"
};
const isMp3FrameHeader=(bytes:Uint8Array)=>{
  if(bytes.length<4||bytes[0]!==0xff||(bytes[1]&0xe0)!==0xe0) return false;
  const version=bytes[1]&0x18;
  const layer=bytes[1]&0x06;
  const bitrateIndex=(bytes[2]>>4)&0x0f;
  const sampleRateIndex=(bytes[2]>>2)&0x03;
  return version!==0x08
    &&layer===0x02
    &&bitrateIndex>0
    &&bitrateIndex<0x0f
    &&sampleRateIndex!==0x03;
};

export const MP3:FormatDefinition={
  id:"mp3",name:"MP3",category:"audio",extensions:["mp3"],mimeTypes:["audio/mpeg"],
  signatures:[[{offset:0,bytes:[0x49,0x44,0x33]}]],
  matcher:isMp3FrameHeader,
  capabilities:{metadata:true},status:"production"
};
export const WAV:FormatDefinition={
  id:"wav",name:"WAVE",category:"audio",extensions:["wav","wave"],mimeTypes:["audio/wav","audio/wave","audio/x-wav"],
  signatures:[],matcher:bytes=>isRiff(bytes,"WAVE"),
  capabilities:{metadata:true},status:"production"
};
export const FLAC:FormatDefinition={
  id:"flac",name:"FLAC",category:"audio",extensions:["flac"],mimeTypes:["audio/flac"],
  signatures:[[{offset:0,bytes:[0x66,0x4c,0x61,0x43]}]],
  capabilities:{metadata:true},status:"production"
};
export const AAC:FormatDefinition={
  id:"aac",name:"AAC / ADTS",category:"audio",extensions:["aac","adts"],mimeTypes:["audio/aac","audio/aacp"],
  signatures:[],matcher:bytes=>bytes.length>2&&bytes[0]===0xff&&(bytes[1]&0xf6)===0xf0,
  capabilities:{metadata:true},status:"production"
};
export const MPEG_TS:FormatDefinition={
  id:"mpegts",name:"MPEG Transport Stream",category:"video",extensions:["ts","m2ts","mts"],mimeTypes:["video/mp2t"],
  signatures:[],matcher:bytes=>{
    if(bytes.length<376) return bytes[0]===0x47;
    return bytes[0]===0x47&&bytes[188]===0x47;
  },
  capabilities:{metadata:false,multipleStreams:true},status:"production"
};
export const AVI:FormatDefinition={
  id:"avi",name:"AVI",category:"video",extensions:["avi"],mimeTypes:["video/x-msvideo"],
  signatures:[],matcher:bytes=>isRiff(bytes,"AVI "),
  capabilities:{metadata:true,multipleStreams:true},readOnly:true,status:"experimental"
};
export const FLV:FormatDefinition={
  id:"flv",name:"Flash Video",category:"video",extensions:["flv"],mimeTypes:["video/x-flv"],
  signatures:[[{offset:0,bytes:[0x46,0x4c,0x56]}]],
  capabilities:{metadata:true,multipleStreams:true},readOnly:true,status:"experimental"
};


const isRtf=(bytes:Uint8Array)=>{
  try{return new TextDecoder().decode(bytes.slice(0,16)).startsWith("{\\rtf");}catch{return false;}
};
const isHtmlDocument=(bytes:Uint8Array)=>{
  try{
    const text=decodeProbeText(bytes,8192).trimStart();
    return /^(?:<!doctype\s+html|<html(?:\s|>))/i.test(text);
  }catch{return false;}
};
const isLatexDocument=(bytes:Uint8Array)=>{
  try{
    const text=new TextDecoder().decode(bytes.slice(0,Math.min(bytes.length,8192)));
    return /\\(?:documentclass|begin\s*\{document\})/.test(text);
  }catch{return false;}
};

export const DOCX:FormatDefinition={
  id:"docx",name:"Word DOCX",category:"document",extensions:["docx"],mimeTypes:["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  signatures:[],capabilities:{metadata:true,multiplePages:true},status:"production"
};
export const DOCM:FormatDefinition={
  id:"docm",name:"Word DOCM",category:"document",extensions:["docm"],mimeTypes:["application/vnd.ms-word.document.macroEnabled.12"],
  signatures:[],capabilities:{metadata:true,multiplePages:true,macros:true},readOnly:true,status:"beta"
};
export const DOC:FormatDefinition={
  id:"doc",name:"Word DOC",category:"document",extensions:["doc"],mimeTypes:["application/msword"],
  signatures:[],capabilities:{metadata:true,multiplePages:true,macros:true},readOnly:true,status:"beta"
};
export const ODT:FormatDefinition={
  id:"odt",name:"OpenDocument Text",category:"document",extensions:["odt"],mimeTypes:["application/vnd.oasis.opendocument.text"],
  signatures:[],capabilities:{metadata:true,multiplePages:true},status:"production"
};
export const RTF:FormatDefinition={
  id:"rtf",name:"Rich Text Format",category:"document",extensions:["rtf"],mimeTypes:["application/rtf","text/rtf"],
  signatures:[],matcher:isRtf,capabilities:{metadata:true},status:"production"
};
export const HTML_DOC:FormatDefinition={
  id:"html-doc",name:"HTML",category:"document",extensions:["html","htm"],mimeTypes:["text/html"],
  signatures:[],matcher:isHtmlDocument,capabilities:{metadata:true},status:"production"
};
export const MARKDOWN:FormatDefinition={
  id:"markdown",name:"Markdown",category:"document",extensions:["md","markdown","mdown","mkd"],mimeTypes:["text/markdown"],
  signatures:[],capabilities:{metadata:true},status:"production"
};
export const TXT:FormatDefinition={
  id:"txt",name:"Plain Text",category:"document",extensions:["txt","text"],mimeTypes:["text/plain"],
  signatures:[],capabilities:{metadata:false},status:"production"
};
export const LATEX:FormatDefinition={
  id:"latex",name:"LaTeX",category:"document",extensions:["tex","latex"],mimeTypes:["application/x-latex","text/x-tex"],
  signatures:[],matcher:isLatexDocument,capabilities:{metadata:true},status:"production"
};
export const TYPST:FormatDefinition={
  id:"typst",name:"Typst",category:"document",extensions:["typ"],mimeTypes:["text/x-typst"],
  signatures:[],capabilities:{metadata:true},status:"production"
};
export const EPUB:FormatDefinition={
  id:"epub",name:"EPUB",category:"document",extensions:["epub"],mimeTypes:["application/epub+zip"],
  signatures:[],capabilities:{metadata:true,multiplePages:true},status:"production"
};
export const PPTX:FormatDefinition={
  id:"pptx",name:"PowerPoint PPTX",category:"document",extensions:["pptx"],mimeTypes:["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  signatures:[],capabilities:{metadata:true,multiplePages:true},status:"production"
};
export const PPTM:FormatDefinition={
  id:"pptm",name:"PowerPoint PPTM",category:"document",extensions:["pptm"],mimeTypes:["application/vnd.ms-powerpoint.presentation.macroEnabled.12"],
  signatures:[],capabilities:{metadata:true,multiplePages:true,macros:true},readOnly:true,status:"beta"
};
export const PPT:FormatDefinition={
  id:"ppt",name:"PowerPoint PPT",category:"document",extensions:["ppt"],mimeTypes:["application/vnd.ms-powerpoint"],
  signatures:[],capabilities:{metadata:true,multiplePages:true,macros:true},readOnly:true,status:"beta"
};
export const ODP:FormatDefinition={
  id:"odp",name:"OpenDocument Presentation",category:"document",extensions:["odp"],mimeTypes:["application/vnd.oasis.opendocument.presentation"],
  signatures:[],capabilities:{metadata:true,multiplePages:true},status:"production"
};


const isTar=(bytes:Uint8Array)=>bytes.length>=262&&ascii(bytes,257,5)==="ustar";

export const ZIP:FormatDefinition={
  id:"zip",name:"ZIP",category:"archive",extensions:["zip","zipx"],mimeTypes:["application/zip","application/x-zip-compressed"],
  signatures:[
    [{offset:0,bytes:[0x50,0x4b,0x03,0x04]}],
    [{offset:0,bytes:[0x50,0x4b,0x05,0x06]}],
    [{offset:0,bytes:[0x50,0x4b,0x07,0x08]}]
  ],
  capabilities:{metadata:true},status:"production"
};
export const SEVEN_ZIP:FormatDefinition={
  id:"7z",name:"7-Zip",category:"archive",extensions:["7z"],mimeTypes:["application/x-7z-compressed"],
  signatures:[[{offset:0,bytes:[0x37,0x7a,0xbc,0xaf,0x27,0x1c]}]],
  capabilities:{metadata:true},status:"production"
};
export const RAR:FormatDefinition={
  id:"rar",name:"RAR",category:"archive",extensions:["rar"],mimeTypes:["application/vnd.rar","application/x-rar-compressed"],
  signatures:[
    [{offset:0,bytes:[0x52,0x61,0x72,0x21,0x1a,0x07,0x00]}],
    [{offset:0,bytes:[0x52,0x61,0x72,0x21,0x1a,0x07,0x01,0x00]}]
  ],
  capabilities:{metadata:true},readOnly:true,status:"production"
};
export const TAR:FormatDefinition={
  id:"tar",name:"TAR",category:"archive",extensions:["tar"],mimeTypes:["application/x-tar"],
  signatures:[],matcher:isTar,capabilities:{metadata:true},status:"production"
};
export const GZIP:FormatDefinition={
  id:"gzip",name:"GZIP",category:"archive",extensions:["gz","gzip"],mimeTypes:["application/gzip","application/x-gzip"],
  signatures:[[{offset:0,bytes:[0x1f,0x8b]}]],
  capabilities:{metadata:true},status:"production"
};
export const BZIP2:FormatDefinition={
  id:"bzip2",name:"BZIP2",category:"archive",extensions:["bz2","bzip2"],mimeTypes:["application/x-bzip2"],
  signatures:[[{offset:0,bytes:[0x42,0x5a,0x68]}]],
  capabilities:{metadata:true},status:"production"
};
export const XZ:FormatDefinition={
  id:"xz",name:"XZ",category:"archive",extensions:["xz"],mimeTypes:["application/x-xz"],
  signatures:[[{offset:0,bytes:[0xfd,0x37,0x7a,0x58,0x5a,0x00]}]],
  capabilities:{metadata:true},status:"production"
};
export const ZSTD:FormatDefinition={
  id:"zstd",name:"Zstandard",category:"archive",extensions:["zst","zstd"],mimeTypes:["application/zstd","application/x-zstd"],
  signatures:[[{offset:0,bytes:[0x28,0xb5,0x2f,0xfd]}]],
  capabilities:{metadata:true},status:"beta"
};
export const TAR_GZIP:FormatDefinition={
  id:"tar-gzip",name:"TAR.GZ",category:"archive",extensions:["tgz"],mimeTypes:["application/gzip"],
  signatures:[],capabilities:{metadata:true},status:"production"
};
export const TAR_BZIP2:FormatDefinition={
  id:"tar-bzip2",name:"TAR.BZ2",category:"archive",extensions:["tbz","tbz2"],mimeTypes:["application/x-bzip2"],
  signatures:[],capabilities:{metadata:true},status:"production"
};
export const TAR_XZ:FormatDefinition={
  id:"tar-xz",name:"TAR.XZ",category:"archive",extensions:["txz"],mimeTypes:["application/x-xz"],
  signatures:[],capabilities:{metadata:true},status:"production"
};
export const CPIO:FormatDefinition={
  id:"cpio",name:"CPIO",category:"archive",extensions:["cpio"],mimeTypes:["application/x-cpio"],
  signatures:[],capabilities:{metadata:true},readOnly:true,status:"beta"
};


const decodeProbeText=(bytes:Uint8Array,limit=16384)=>{
  const slice=bytes.slice(0,Math.min(bytes.length,limit));
  try{
    const encoding=
      slice.length>=2&&slice[0]===0xff&&slice[1]===0xfe?"utf-16le":
      slice.length>=2&&slice[0]===0xfe&&slice[1]===0xff?"utf-16be":
      "utf-8";
    return new TextDecoder(encoding).decode(slice).replace(/^\uFEFF/,"");
  }catch{return "";}
};

const isJsonLines=(bytes:Uint8Array)=>{
  try{
    const text=decodeProbeText(bytes,16384);
    const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(lines.length<2) return false;
    return lines.slice(0,20).every(line=>{
      try{
        const value=JSON.parse(line);
        return value!==null&&typeof value==="object";
      }catch{return false;}
    });
  }catch{return false;}
};
const isJsonDocument=(bytes:Uint8Array)=>{
  try{
    const text=decodeProbeText(bytes,8192).trimStart();
    if(!(text.startsWith("{")||text.startsWith("["))) return false;
    JSON.parse(text.length<bytes.length?"null":text);
    return true;
  }catch{
    try{
      const text=decodeProbeText(bytes,8192).trimStart();
      return text.startsWith("{")||text.startsWith("[");
    }catch{return false;}
  }
};
const isArrowFile=(bytes:Uint8Array)=>bytes.length>=6&&ascii(bytes,0,6)==="ARROW1";
const isSqlite=(bytes:Uint8Array)=>bytes.length>=16&&ascii(bytes,0,15)==="SQLite format 3"&&bytes[15]===0;

export const XLSX:FormatDefinition={
  id:"xlsx",name:"Excel XLSX",category:"spreadsheet",extensions:["xlsx"],
  mimeTypes:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  signatures:[],capabilities:{metadata:true,multiplePages:true,formulas:true},status:"production"
};
export const XLSM:FormatDefinition={
  id:"xlsm",name:"Excel XLSM",category:"spreadsheet",extensions:["xlsm"],
  mimeTypes:["application/vnd.ms-excel.sheet.macroEnabled.12"],
  signatures:[],capabilities:{metadata:true,multiplePages:true,formulas:true,macros:true},readOnly:true,status:"beta"
};
export const XLSB:FormatDefinition={
  id:"xlsb",name:"Excel XLSB",category:"spreadsheet",extensions:["xlsb"],
  mimeTypes:["application/vnd.ms-excel.sheet.binary.macroEnabled.12"],
  signatures:[],capabilities:{metadata:true,multiplePages:true,formulas:true,macros:true},status:"production"
};
export const XLS:FormatDefinition={
  id:"xls",name:"Excel XLS",category:"spreadsheet",extensions:["xls"],
  mimeTypes:["application/vnd.ms-excel"],signatures:[],
  capabilities:{metadata:true,multiplePages:true,formulas:true,macros:true},status:"production"
};
export const ODS:FormatDefinition={
  id:"ods",name:"OpenDocument Spreadsheet",category:"spreadsheet",extensions:["ods"],
  mimeTypes:["application/vnd.oasis.opendocument.spreadsheet"],signatures:[],
  capabilities:{metadata:true,multiplePages:true,formulas:true},status:"production"
};
export const FODS:FormatDefinition={
  id:"fods",name:"Flat OpenDocument Spreadsheet",category:"spreadsheet",extensions:["fods"],
  mimeTypes:["application/vnd.oasis.opendocument.spreadsheet-flat-xml"],signatures:[],
  capabilities:{metadata:true,multiplePages:true,formulas:true},status:"production"
};
export const CSV:FormatDefinition={
  id:"csv",name:"CSV",category:"data",extensions:["csv"],mimeTypes:["text/csv","application/csv"],
  signatures:[],capabilities:{metadata:false},status:"production"
};
export const TSV:FormatDefinition={
  id:"tsv",name:"TSV",category:"data",extensions:["tsv","tab"],mimeTypes:["text/tab-separated-values"],
  signatures:[],capabilities:{metadata:false},status:"production"
};
export const JSON_DATA:FormatDefinition={
  id:"json-data",name:"JSON",category:"data",extensions:["json"],mimeTypes:["application/json","text/json"],
  signatures:[],matcher:isJsonDocument,capabilities:{metadata:false},status:"production"
};
export const JSONL:FormatDefinition={
  id:"jsonl",name:"JSON Lines",category:"data",extensions:["jsonl","ndjson"],mimeTypes:["application/x-ndjson","application/ndjson"],
  signatures:[],matcher:isJsonLines,capabilities:{metadata:false},status:"production"
};
export const PARQUET:FormatDefinition={
  id:"parquet",name:"Apache Parquet",category:"data",extensions:["parquet"],mimeTypes:["application/vnd.apache.parquet","application/octet-stream"],
  signatures:[[{offset:0,bytes:[0x50,0x41,0x52,0x31]}]],capabilities:{metadata:true},status:"production"
};
export const ARROW:FormatDefinition={
  id:"arrow",name:"Apache Arrow IPC",category:"data",extensions:["arrow","feather","ipc"],
  mimeTypes:["application/vnd.apache.arrow.file","application/vnd.apache.arrow.stream","application/octet-stream"],
  signatures:[[{offset:0,bytes:[0x41,0x52,0x52,0x4f,0x57,0x31]}]],matcher:isArrowFile,
  capabilities:{metadata:true},status:"production"
};
export const SQLITE:FormatDefinition={
  id:"sqlite",name:"SQLite Database",category:"database",extensions:["sqlite","sqlite3","db","db3"],
  mimeTypes:["application/vnd.sqlite3","application/x-sqlite3","application/octet-stream"],
  signatures:[],matcher:isSqlite,capabilities:{metadata:true,multiplePages:true},status:"production"
};


const textProbe=(bytes:Uint8Array,limit=16384)=>decodeProbeText(bytes,limit);
const psdVersion=(bytes:Uint8Array,version:number)=>
  bytes.length>=6&&ascii(bytes,0,4)==="8BPS"&&bytes[4]===0&&bytes[5]===version;
const isCameraRaw=(bytes:Uint8Array)=>
  (bytes.length>=12&&ascii(bytes,8,2)==="CR")
  ||ascii(bytes,0,15)==="FUJIFILMCCD-RAW"
  ||isIsoBmffBrand(bytes,["crx "]);
const isSrt=(bytes:Uint8Array)=>{
  const text=textProbe(bytes);
  if(text.trimStart().startsWith("WEBVTT")) return false;
  return /\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(text);
};
const isVtt=(bytes:Uint8Array)=>textProbe(bytes,256).trimStart().startsWith("WEBVTT");
const isAss=(bytes:Uint8Array)=>/\[Script Info\][\s\S]*\[Events\]/i.test(textProbe(bytes));
const isObj=(bytes:Uint8Array)=>{
  const text=textProbe(bytes);
  return /(?:^|\n)\s*v\s+[+\-0-9.eE]+\s+[+\-0-9.eE]+\s+[+\-0-9.eE]+/.test(text)
    &&/(?:^|\n)\s*f\s+\S+\s+\S+\s+\S+/.test(text);
};
const isAsciiStl=(bytes:Uint8Array)=>/^solid(?:\s|$)/i.test(textProbe(bytes,256).trimStart());
const isPly=(bytes:Uint8Array)=>/^ply\s*(?:\r?\n)format\s+/i.test(textProbe(bytes,256));
const isFb2=(bytes:Uint8Array)=>/<(?:\w+:)?FictionBook(?:\s|>)/i.test(textProbe(bytes,8192));
const isDxf=(bytes:Uint8Array)=>/^\s*0\s*(?:\r?\n)\s*SECTION\b/i.test(textProbe(bytes,1024));
const isFits=(bytes:Uint8Array)=>bytes.length>=9&&ascii(bytes,0,9)==="SIMPLE  =";
const isGlb=(bytes:Uint8Array)=>bytes.length>=4&&ascii(bytes,0,4)==="glTF";
const isMobi=(bytes:Uint8Array)=>bytes.length>=68&&ascii(bytes,60,8)==="BOOKMOBI";

export const PSD:FormatDefinition={
  id:"psd",name:"Adobe Photoshop PSD",category:"layered",extensions:["psd"],mimeTypes:["image/vnd.adobe.photoshop","image/x-photoshop"],
  signatures:[],matcher:bytes=>psdVersion(bytes,1),capabilities:{metadata:true,layers:true,alpha:true},readOnly:true,status:"beta"
};
export const PSB:FormatDefinition={
  id:"psb",name:"Adobe Photoshop PSB",category:"layered",extensions:["psb"],mimeTypes:["image/vnd.adobe.photoshop"],
  signatures:[],matcher:bytes=>psdVersion(bytes,2),capabilities:{metadata:true,layers:true,alpha:true},readOnly:true,status:"experimental"
};
export const CAMERA_RAW:FormatDefinition={
  id:"camera-raw",name:"Camera RAW (embedded preview)",category:"raw",
  extensions:["cr2","cr3","nef","nrw","arw","sr2","dng","rw2","orf","raf","pef"],
  mimeTypes:["image/x-canon-cr2","image/x-nikon-nef","image/x-sony-arw","image/x-adobe-dng"],
  signatures:[],matcher:isCameraRaw,capabilities:{metadata:true,hdr:true},readOnly:true,status:"beta"
};

export const TTF:FormatDefinition={
  id:"ttf",name:"TrueType Font",category:"font",extensions:["ttf"],mimeTypes:["font/ttf","application/x-font-ttf"],
  signatures:[[{offset:0,bytes:[0x00,0x01,0x00,0x00]}]],capabilities:{metadata:true,vector:true},status:"production"
};
export const OTF:FormatDefinition={
  id:"otf",name:"OpenType Font",category:"font",extensions:["otf"],mimeTypes:["font/otf","application/vnd.ms-opentype"],
  signatures:[[{offset:0,bytes:[0x4f,0x54,0x54,0x4f]}]],capabilities:{metadata:true,vector:true},readOnly:true,status:"beta"
};
export const WOFF:FormatDefinition={
  id:"woff",name:"WOFF Font",category:"font",extensions:["woff"],mimeTypes:["font/woff","application/font-woff"],
  signatures:[[{offset:0,bytes:[0x77,0x4f,0x46,0x46]}]],capabilities:{metadata:true,vector:true},status:"production"
};
export const WOFF2:FormatDefinition={
  id:"woff2",name:"WOFF2 Font",category:"font",extensions:["woff2"],mimeTypes:["font/woff2"],
  signatures:[[{offset:0,bytes:[0x77,0x4f,0x46,0x32]}]],capabilities:{metadata:true,vector:true},readOnly:true,status:"experimental"
};
export const EOT:FormatDefinition={
  id:"eot",name:"Embedded OpenType",category:"font",extensions:["eot"],mimeTypes:["application/vnd.ms-fontobject"],
  signatures:[],capabilities:{metadata:true,vector:true},status:"beta"
};

export const SRT:FormatDefinition={
  id:"srt",name:"SubRip SRT",category:"subtitle",extensions:["srt"],mimeTypes:["application/x-subrip","text/plain"],
  signatures:[],matcher:isSrt,capabilities:{metadata:false},status:"production"
};
export const VTT:FormatDefinition={
  id:"vtt",name:"WebVTT",category:"subtitle",extensions:["vtt"],mimeTypes:["text/vtt"],
  signatures:[],matcher:isVtt,capabilities:{metadata:false},status:"production"
};
export const ASS:FormatDefinition={
  id:"ass",name:"ASS / SSA Subtitles",category:"subtitle",extensions:["ass","ssa"],mimeTypes:["text/x-ssa","text/x-ass"],
  signatures:[],matcher:isAss,capabilities:{metadata:true},status:"production"
};

export const OBJ:FormatDefinition={
  id:"obj",name:"Wavefront OBJ",category:"model",extensions:["obj"],mimeTypes:["model/obj","text/plain"],
  signatures:[],matcher:isObj,capabilities:{metadata:false},status:"beta"
};
export const STL:FormatDefinition={
  id:"stl",name:"STL Mesh",category:"model",extensions:["stl"],mimeTypes:["model/stl","application/sla"],
  signatures:[],matcher:isAsciiStl,capabilities:{metadata:false},status:"beta"
};
export const PLY:FormatDefinition={
  id:"ply",name:"PLY Mesh",category:"model",extensions:["ply"],mimeTypes:["application/octet-stream"],
  signatures:[],matcher:isPly,capabilities:{metadata:true},status:"beta"
};
export const GLTF:FormatDefinition={
  id:"gltf",name:"glTF JSON",category:"model",extensions:["gltf"],mimeTypes:["model/gltf+json"],
  signatures:[],capabilities:{metadata:true},readOnly:true,status:"experimental"
};
export const GLB:FormatDefinition={
  id:"glb",name:"glTF Binary",category:"model",extensions:["glb"],mimeTypes:["model/gltf-binary"],
  signatures:[],matcher:isGlb,capabilities:{metadata:true},readOnly:true,status:"experimental"
};

export const FB2:FormatDefinition={
  id:"fb2",name:"FictionBook FB2",category:"ebook-legacy",extensions:["fb2"],mimeTypes:["application/x-fictionbook+xml"],
  signatures:[],matcher:isFb2,capabilities:{metadata:true,multiplePages:true},readOnly:true,status:"beta"
};
export const MOBI_KINDLE:FormatDefinition={
  id:"mobi-kindle",name:"Mobipocket / Kindle",category:"ebook-legacy",extensions:["mobi","azw","azw3","prc"],mimeTypes:["application/x-mobipocket-ebook"],
  signatures:[],matcher:isMobi,capabilities:{metadata:true,multiplePages:true},readOnly:true,status:"experimental"
};

export const DXF:FormatDefinition={
  id:"dxf",name:"AutoCAD DXF",category:"vector",extensions:["dxf"],mimeTypes:["image/vnd.dxf","application/dxf"],
  signatures:[],matcher:isDxf,capabilities:{metadata:true,vector:true},readOnly:true,status:"experimental"
};
export const DWG:FormatDefinition={
  id:"dwg",name:"AutoCAD DWG",category:"vector",extensions:["dwg"],mimeTypes:["image/vnd.dwg","application/acad"],
  signatures:[],matcher:bytes=>bytes.length>=6&&ascii(bytes,0,4)==="AC10",capabilities:{metadata:true,vector:true},readOnly:true,status:"experimental"
};

export const FITS:FormatDefinition={
  id:"fits",name:"FITS Scientific Data",category:"scientific",extensions:["fits","fit","fts"],mimeTypes:["application/fits","image/fits"],
  signatures:[],matcher:isFits,capabilities:{metadata:true,multiplePages:true},readOnly:true,status:"beta"
};
export const HDF5:FormatDefinition={
  id:"hdf5",name:"HDF5",category:"scientific",extensions:["h5","hdf5","hdf"],mimeTypes:["application/x-hdf5"],
  signatures:[[{offset:0,bytes:[0x89,0x48,0x44,0x46,0x0d,0x0a,0x1a,0x0a]}]],capabilities:{metadata:true},readOnly:true,status:"experimental"
};
export const NETCDF:FormatDefinition={
  id:"netcdf",name:"NetCDF Classic",category:"scientific",extensions:["nc","cdf"],mimeTypes:["application/x-netcdf"],
  signatures:[
    [{offset:0,bytes:[0x43,0x44,0x46,0x01]}],
    [{offset:0,bytes:[0x43,0x44,0x46,0x02]}]
  ],capabilities:{metadata:true},readOnly:true,status:"experimental"
};

export const ASF:FormatDefinition={
  id:"asf",name:"ASF / WMV / WMA",category:"video",extensions:["asf","wmv","wma"],mimeTypes:["video/x-ms-asf","video/x-ms-wmv","audio/x-ms-wma"],
  signatures:[[{offset:0,bytes:[0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11,0xa6,0xd9,0x00,0xaa,0x00,0x62,0xce,0x6c]}]],
  capabilities:{metadata:true,multipleStreams:true},readOnly:true,status:"beta"
};

export const PDF:FormatDefinition={
  id:"pdf",name:"PDF",category:"pdf",extensions:["pdf"],mimeTypes:["application/pdf"],
  signatures:[[{offset:0,bytes:[0x25,0x50,0x44,0x46,0x2d]}]],
  capabilities:{metadata:true,multiplePages:true},status:"production"
};

export function createDefaultFormatRegistry():FormatRegistry {
  const registry=new FormatRegistry();
  [
    JPEG,PNG,WEBP,GIF,CAMERA_RAW,TIFF,AVIF,HEIC,JXL,SVG,
    PSD,PSB,
    MOV,MP4,WEBM_MEDIA,MKV,OGG,AAC,MP3,WAV,FLAC,MPEG_TS,AVI,FLV,ASF,PDF,
    DOCX,DOCM,DOC,ODT,RTF,HTML_DOC,MARKDOWN,TXT,LATEX,TYPST,EPUB,PPTX,PPTM,PPT,ODP,
    ZIP,SEVEN_ZIP,RAR,TAR,GZIP,BZIP2,XZ,ZSTD,TAR_GZIP,TAR_BZIP2,TAR_XZ,CPIO,
    XLSX,XLSM,XLSB,XLS,ODS,FODS,CSV,TSV,JSONL,JSON_DATA,PARQUET,ARROW,SQLITE,
    TTF,OTF,WOFF,WOFF2,EOT,SRT,VTT,ASS,OBJ,STL,PLY,GLTF,GLB,FB2,MOBI_KINDLE,DXF,DWG,FITS,HDF5,NETCDF
  ].forEach(format=>registry.register(format));
  return registry;
}
