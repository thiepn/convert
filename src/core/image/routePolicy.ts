import type { CommonImageSourceTraits } from "./sourceTraits";

const NATIVE_COMMON=new Set(["jpeg","png","webp"]);

export function requiresFeatureCompleteImageEngine(
  sourceFormatId:string,
  targetFormatId:string,
  options:Record<string,unknown>,
  traits?:CommonImageSourceTraits
):boolean{
  if(!NATIVE_COMMON.has(sourceFormatId)||!NATIVE_COMMON.has(targetFormatId)) return false;

  const metadata=typeof options.metadataPolicy==="string"?options.metadataPolicy:"preserve";
  if(metadata!=="strip"&&(!traits?.known||traits.metadata)) return true;

  if(Number(options.targetBytes)>0) return true;

  // PNG output is lossless by definition. Browser WebP does not expose a
  // certified lossless switch, and JPEG has no lossless mode in this path.
  if(options.lossless===true&&targetFormatId==="webp") return true;

  if(
    options.preserveAnimation!==false
    &&(sourceFormatId==="png"||sourceFormatId==="webp")
    &&(!traits?.known||traits.animation)
  ) return true;

  // Resize and JPEG background compositing are handled by the native worker.
  return false;
}
