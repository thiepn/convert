import type { DetailedImageInspection, ImageConversionOptions, MetadataPolicy } from "../core/image/types";
import type { ImageWorkerRequest, ImageWorkerResponse } from "../engines/image/protocol";

declare const self: DedicatedWorkerGlobalScope;

let vipsPromise: Promise<any> | null = null;
let loadedBase = "";

function send(message:ImageWorkerResponse) { self.postMessage(message); }

async function getVips(assetBase:string):Promise<any> {
  if (vipsPromise && loadedBase === assetBase) return vipsPromise;
  loadedBase = assetBase;
  vipsPromise = (async () => {
    const moduleUrl = new URL("vips-es6.js",assetBase).href;
    const imported = await import(/* @vite-ignore */ moduleUrl);
    const Vips = imported.default;
    const vips = await Vips({
      locateFile:(path:string) => new URL(path,assetBase).href,
      dynamicLibraries:[
        new URL("vips-heif.wasm",assetBase).href,
        new URL("vips-jxl.wasm",assetBase).href,
        new URL("vips-resvg.wasm",assetBase).href
      ],
      print:() => {},
      printErr:() => {}
    });
    vips.blockUntrusted?.(true);
    const cores = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1));
    vips.concurrency?.(cores);
    vips.Cache?.maxMem?.(64 * 1024 * 1024);
    return vips;
  })();
  return vipsPromise;
}

function fields(image:any):string[] {
  try {
    const value = image.getFields();
    if (Array.isArray(value)) return value;
    if (value && typeof value.size === "function" && typeof value.get === "function") {
      const result:string[] = [];
      for (let i=0;i<value.size();i++) result.push(String(value.get(i)));
      value.delete?.();
      return result;
    }
    return Array.from(value ?? []).map(String);
  } catch { return []; }
}

function intMeta(image:any,name:string,fallback:number):number {
  try { return image.getInt(name); } catch { return fallback; }
}

function stringMeta(image:any,name:string):string|null {
  try { return image.getString(name); } catch { return null; }
}

function bytesPerSample(format:string):number {
  const f=String(format).toLowerCase();
  if (f.includes("double") || f.includes("dpcomplex")) return 8;
  if (f.includes("ushort") || f.includes("short")) return 2;
  if (f.includes("uint") || f === "int" || f.includes("float") || f.includes("complex")) return 4;
  return 1;
}

function bitDepth(format:string):number|null {
  const f=String(format).toLowerCase();
  if (f.includes("uchar") || f === "char") return 8;
  if (f.includes("ushort") || f === "short") return 16;
  if (f.includes("uint") || f === "int" || f.includes("float")) return 32;
  if (f.includes("double")) return 64;
  return null;
}

function hasField(all:string[],patterns:string[]):boolean {
  const lower=all.map(x=>x.toLowerCase());
  return patterns.some(pattern=>lower.some(field=>field.includes(pattern)));
}

function inspectVipsImage(image:any, engine:string, warnings:string[]):DetailedImageInspection {
  const all=fields(image);
  const pageHeight=intMeta(image,"page-height",image.height);
  const frames=Math.max(1,intMeta(image,"n-pages",Math.max(1,Math.round(image.height/pageHeight))));
  const format=String(image.format ?? "uchar");
  const interpretation=String(image.interpretation ?? "");
  const bits=bitDepth(format);
  const estimatedDecodedBytes=image.width * pageHeight * Math.max(1,image.bands) * bytesPerSample(format) * frames;
  const orientation=intMeta(image,"orientation",0) || null;
  const icc=hasField(all,["icc-profile-data"]);
  const exif=hasField(all,["exif-data","exif-ifd"]);
  const xmp=hasField(all,["xmp-data"]);
  const iptc=hasField(all,["iptc-data"]);
  const hdr=bits !== null && bits > 8 && /scrgb|rgb16|grey16|xyz|lab/i.test(interpretation);
  return {
    width:image.width,
    height:pageHeight,
    pageHeight,
    frames,
    bands:image.bands,
    bitDepth:bits,
    alpha:Boolean(image.hasAlpha?.()),
    colorSpace:interpretation || null,
    orientation,
    hdr,
    metadata:{exif,xmp,iptc,icc},
    estimatedDecodedBytes,
    engine,
    warnings
  };
}

async function loadImage(vips:any,source:Blob,sourceFormatId:string,preserveAnimation=true):Promise<{image:any;warnings:string[]}> {
  const warnings:string[]=[];
  if (sourceFormatId === "heic") {
    const { LibheifDecoder } = await import("@keeratita/heic-converter");
    const decoder = new LibheifDecoder();
    try {
      await decoder.initialize();
      const decoded = await decoder.decode(new Uint8Array(await source.arrayBuffer()));
      const rgba = new Uint8Array(decoded.data.buffer,decoded.data.byteOffset,decoded.data.byteLength);
      const image = vips.Image.newFromMemory(rgba,decoded.width,decoded.height,4,vips.BandFormat.uchar);
      warnings.push("HEIC is decoded through the local HEVC fallback. Embedded EXIF/XMP/ICC metadata is not currently transferred through this fallback.");
      return {image,warnings};
    } finally {
      decoder.free();
    }
  }

  const bytes=new Uint8Array(await source.arrayBuffer());
  const options:Record<string,unknown>={access:"sequential",failOn:"error"};
  if (preserveAnimation && ["gif","webp","tiff","avif","jxl"].includes(sourceFormatId)) options.n=-1;
  const image=vips.Image.newFromBuffer(bytes,options);
  return {image,warnings};
}

function safeLimits(inspect:DetailedImageInspection) {
  const mobile=(navigator.maxTouchPoints ?? 0)>0 && (navigator.hardwareConcurrency ?? 8)<=8;
  const maxPixels=mobile ? 80_000_000 : 200_000_000;
  const totalPixels=inspect.width*inspect.height*inspect.frames;
  if (!Number.isSafeInteger(totalPixels) || totalPixels>maxPixels) throw new Error("IMAGE_DIMENSIONS_UNSAFE: Decoded pixel count exceeds this device's safety limit.");
  if (inspect.frames>1000) throw new Error("IMAGE_FRAME_LIMIT_EXCEEDED: More than 1000 frames/pages are not processed automatically.");
}

function parseHex(hex:string):number[] {
  const normalized=/^#[0-9a-f]{6}$/i.test(hex)?hex:"#ffffff";
  return [1,3,5].map(i=>parseInt(normalized.slice(i,i+2),16));
}

function keepMask(vips:any,policy:MetadataPolicy):number {
  if (policy==="strip") return vips.ForeignKeep?.none ?? 0;
  if (policy==="privacy") return vips.ForeignKeep?.icc ?? 8;
  return vips.ForeignKeep?.all ?? 31;
}

function targetSuffix(target:string):string {
  return ({jpeg:".jpg",png:".png",webp:".webp",gif:".gif",tiff:".tif",avif:".avif",jxl:".jxl"} as Record<string,string>)[target] ?? ".png";
}

function saveOptions(vips:any,target:string,quality:number,options:ImageConversionOptions):Record<string,unknown> {
  const Q=Math.max(1,Math.min(100,Math.round(quality*100)));
  const common:Record<string,unknown>={keep:keepMask(vips,options.metadataPolicy)};
  if (target==="jpeg") return {...common,Q,strip:false,background:parseHex(options.background),optimizeCoding:true,interlace:true};
  if (target==="png") return {...common,compression:6,strip:false};
  if (target==="webp") return {...common,Q,effort:4,lossless:options.lossless,background:parseHex(options.background)};
  if (target==="tiff") return {...common,compression:options.lossless?"deflate":"jpeg",Q};
  if (target==="avif") return {...common,Q,effort:4,lossless:options.lossless,compression:vips.ForeignHeifCompression?.av1};
  if (target==="jxl") return {...common,Q,effort:4,lossless:options.lossless};
  return common;
}

function resizeImage(image:any,maxDimension:number|undefined,frames:number,pageHeight:number):any {
  if (!maxDimension || maxDimension<=0) return image;
  const width=image.width;
  const height=pageHeight;
  const longest=Math.max(width,height);
  if (longest<=maxDimension) return image;
  const scale=maxDimension/longest;
  const resized=image.resize(scale);
  if (frames>1) {
    try { resized.setInt("page-height",Math.max(1,Math.round(pageHeight*scale))); } catch {}
  }
  return resized;
}

function flattenAlpha(image:any,vips:any,background:string):any {
  if (!image.hasAlpha?.()) return image;
  const bg=parseHex(background);
  return image.flatten({background:bg});
}

function firstFrame(image:any,pageHeight:number):any {
  if (image.height<=pageHeight) return image;
  return image.crop(0,0,image.width,pageHeight);
}

function encode(image:any,vips:any,target:string,quality:number,options:ImageConversionOptions):Uint8Array {
  return image.writeToBuffer(targetSuffix(target),saveOptions(vips,target,quality,options));
}

function encodeTargetSize(image:any,vips:any,target:string,quality:number,options:ImageConversionOptions,warnings:string[]):Uint8Array {
  const targetBytes=options.targetBytes;
  if (!targetBytes || targetBytes<=0 || options.lossless || !["jpeg","webp","avif","jxl"].includes(target)) return encode(image,vips,target,quality,options);
  let lo=0.12,hi=Math.max(lo,quality),best:Uint8Array|null=null;
  for (let i=0;i<6;i++) {
    const q=(lo+hi)/2;
    const out=encode(image,vips,target,q,options);
    if (out.byteLength<=targetBytes) { best=out; lo=q; } else { hi=q; }
  }
  if (!best) {
    best=encode(image,vips,target,0.1,options);
    warnings.push("The requested target size could not be reached at acceptable encoder settings without also reducing dimensions.");
  }
  return best;
}

async function inspectSource(vips:any,source:Blob,sourceFormatId:string):Promise<DetailedImageInspection> {
  const loaded=await loadImage(vips,source,sourceFormatId,true);
  try {
    const inspection=inspectVipsImage(loaded.image,sourceFormatId==="heic"?"HEIC local fallback":"wasm-vips",loaded.warnings);
    safeLimits(inspection);
    return inspection;
  } finally { loaded.image.delete?.(); }
}

self.onmessage=async(event:MessageEvent<ImageWorkerRequest>)=>{
  const request=event.data;
  try {
    const vips=await getVips(request.assetBase);
    if (request.type==="ping") { send({type:"ready",requestId:request.requestId}); return; }
    if (request.type==="inspect") {
      const inspection=await inspectSource(vips,request.source,request.sourceFormatId);
      send({type:"inspection",requestId:request.requestId,inspection});
      return;
    }

    send({type:"progress",requestId:request.requestId,progress:0.08,stage:"Decoding and inspecting"});
    const loaded=await loadImage(vips,request.source,request.sourceFormatId,request.options.preserveAnimation);
    let image=loaded.image;
    const owned:any[]=[image];
    const warnings=[...loaded.warnings];
    try {
      const inspection=inspectVipsImage(image,request.sourceFormatId==="heic"?"HEIC local fallback":"wasm-vips",warnings);
      safeLimits(inspection);

      send({type:"progress",requestId:request.requestId,progress:0.3,stage:"Applying image transformations"});
      if (inspection.frames>1 && !["gif","webp","tiff","avif","jxl"].includes(request.targetFormatId)) {
        const frame=firstFrame(image,inspection.pageHeight); owned.push(frame); image=frame;
        warnings.push("The target format is static, so only the first frame/page was exported.");
      }
      const resized=resizeImage(image,request.options.maxDimension,inspection.frames,inspection.pageHeight);
      if (resized!==image) { owned.push(resized); image=resized; }

      if (request.targetFormatId==="jpeg" && image.hasAlpha?.()) {
        const flattened=flattenAlpha(image,vips,request.options.background); owned.push(flattened); image=flattened;
        warnings.push("Transparency was flattened against the selected background because JPEG has no alpha channel.");
      }

      send({type:"progress",requestId:request.requestId,progress:0.66,stage:"Encoding output"});
      const output=encodeTargetSize(image,vips,request.targetFormatId,request.quality,request.options,warnings);
      const mime=({
        jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif",
        tiff:"image/tiff",avif:"image/avif",jxl:"image/jxl"
      } as Record<string,string>)[request.targetFormatId] ?? "application/octet-stream";
      const blob=new Blob([output],{type:mime});
      send({type:"progress",requestId:request.requestId,progress:0.94,stage:"Finalizing"});
      send({type:"result",requestId:request.requestId,blob,width:image.width,height:image.height,warnings});
    } finally {
      for (let i=owned.length-1;i>=0;i--) {
        try { owned[i]?.delete?.(); } catch {}
      }
    }
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    send({type:"error",requestId:request.requestId,code:message.split(":")[0]||"IMAGE_ENGINE_FAILED",message});
  }
};
