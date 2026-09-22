const NATIVE_COMMON=new Set(["jpeg","png","webp"]);

export function requiresFeatureCompleteImageEngine(
  sourceFormatId:string,
  targetFormatId:string,
  options:Record<string,unknown>
):boolean{
  if(!NATIVE_COMMON.has(sourceFormatId)||!NATIVE_COMMON.has(targetFormatId)) return false;

  const metadata=typeof options.metadataPolicy==="string"?options.metadataPolicy:"preserve";
  if(metadata!=="strip") return true;

  if(Number(options.maxDimension)>0) return true;
  if(Number(options.targetBytes)>0) return true;
  if(options.lossless===true) return true;

  // The browser-native proof path decodes one bitmap. WebP can be animated,
  // so preserve-animation semantics require libvips even when no other option
  // is selected.
  if(sourceFormatId==="webp"&&options.preserveAnimation!==false) return true;

  // PNG/WebP alpha compositing must honor the chosen JPEG background.
  if(targetFormatId==="jpeg"&&sourceFormatId!=="jpeg") return true;

  return false;
}
