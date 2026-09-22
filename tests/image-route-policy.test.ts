import { describe,expect,it } from "vitest";
import { requiresFeatureCompleteImageEngine } from "../src/core/image/routePolicy";

describe("image route option policy",()=>{
  it("requires the feature-complete engine for metadata preservation",()=>{
    expect(requiresFeatureCompleteImageEngine("png","webp",{
      metadataPolicy:"preserve",background:"#ffffff",lossless:false,preserveAnimation:true
    })).toBe(true);
  });

  it("requires it for resizing, target-size, lossless, animation, and JPEG alpha semantics",()=>{
    expect(requiresFeatureCompleteImageEngine("png","png",{metadataPolicy:"strip",maxDimension:128})).toBe(true);
    expect(requiresFeatureCompleteImageEngine("jpeg","webp",{metadataPolicy:"strip",targetBytes:50_000})).toBe(true);
    expect(requiresFeatureCompleteImageEngine("jpeg","webp",{metadataPolicy:"strip",lossless:true})).toBe(true);
    expect(requiresFeatureCompleteImageEngine("webp","png",{metadataPolicy:"strip",preserveAnimation:true})).toBe(true);
    expect(requiresFeatureCompleteImageEngine("png","jpeg",{metadataPolicy:"strip",background:"#ffffff"})).toBe(true);
  });

  it("allows the fast browser route only for semantics it can honor",()=>{
    expect(requiresFeatureCompleteImageEngine("jpeg","webp",{
      metadataPolicy:"strip",background:"#ffffff",lossless:false,preserveAnimation:true
    })).toBe(false);
    expect(requiresFeatureCompleteImageEngine("png","webp",{
      metadataPolicy:"strip",background:"#ffffff",lossless:false,preserveAnimation:true
    })).toBe(false);
  });
});
