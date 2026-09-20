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
export const MP3:FormatDefinition={
  id:"mp3",name:"MP3",category:"audio",extensions:["mp3"],mimeTypes:["audio/mpeg"],
  signatures:[[{offset:0,bytes:[0x49,0x44,0x33]}]],
  matcher:bytes=>bytes.length>2&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0,
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

export function createDefaultFormatRegistry():FormatRegistry {
  const registry=new FormatRegistry();
  [
    JPEG,PNG,WEBP,GIF,TIFF,AVIF,HEIC,JXL,SVG,
    MOV,MP4,WEBM_MEDIA,MKV,OGG,MP3,WAV,FLAC,AAC,MPEG_TS,AVI,FLV
  ].forEach(format=>registry.register(format));
  return registry;
}
