import { describe,expect,it } from "vitest";
import { requiresFeatureCompleteImageEngine } from "../src/core/image/routePolicy";

describe("image route option policy",()=>{
  it("requires the feature-complete engine for metadata preservation",()=>{
    expect(requiresFeatureCompleteImageEngine("png","webp",{
      metadataPolicy:"preserve",background:"#ffffff",lossless:false,preserveAnimation:true
    })).toBe(true);
  });

  it("keeps unsupported target-size, lossless WebP, and animation semantics on the full engine",()=>{
    expect(requiresFeatureCompleteImageEngine("jpeg","webp",{metadataPolicy:"strip",targetBytes:50_000})).toBe(true);
    expect(requiresFeatureCompleteImageEngine("jpeg","webp",{metadataPolicy:"strip",lossless:true})).toBe(true);
    expect(requiresFeatureCompleteImageEngine("webp","png",{metadataPolicy:"strip",preserveAnimation:true})).toBe(true);
  });

  it("allows native resize and JPEG background compositing",()=>{
    const knownStatic={metadata:false,animation:false,known:true};
    expect(requiresFeatureCompleteImageEngine("png","png",{metadataPolicy:"strip",maxDimension:320},knownStatic)).toBe(false);
    expect(requiresFeatureCompleteImageEngine("png","jpeg",{metadataPolicy:"strip",background:"#ffffff"},knownStatic)).toBe(false);
  });

  it("allows the fast browser route only for semantics it can honor",()=>{
    expect(requiresFeatureCompleteImageEngine("jpeg","webp",{
      metadataPolicy:"strip",background:"#ffffff",lossless:false,preserveAnimation:true
    },{metadata:false,animation:false,known:true})).toBe(false);
    expect(requiresFeatureCompleteImageEngine("png","webp",{
      metadataPolicy:"strip",background:"#ffffff",lossless:false,preserveAnimation:true
    },{metadata:false,animation:false,known:true})).toBe(false);
  });
});
