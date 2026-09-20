import type { DeviceProfile } from "./DeviceProfile";
import { getDeviceProfile,memoryBackedSourceLimit } from "./DeviceProfile";

export interface MemoryPreflight {
  required:number;
  budget:number;
  safe:boolean;
  headroom:number;
  tier:DeviceProfile["tier"];
}

export function memoryPreflight(
  required:number,
  profile=getDeviceProfile()
):MemoryPreflight {
  const normalized=Math.max(0,Math.ceil(required));
  const budget=profile.workingSetBudgetBytes;
  return {
    required:normalized,
    budget,
    safe:normalized<=budget,
    headroom:budget-normalized,
    tier:profile.tier
  };
}

export function assertMemoryBackedSource(
  sourceBytes:number,
  operation:string,
  multiplier:number,
  hardCapBytes=Number.POSITIVE_INFINITY,
  profile=getDeviceProfile()
):number {
  const limit=memoryBackedSourceLimit(multiplier,hardCapBytes,profile);
  if(sourceBytes>limit){
    throw new Error(
      "DEVICE_MEMORY_LIMIT: "+operation+" needs to materialize this file in memory. "
      +"This device's guarded source limit is "+Math.floor(limit/(1024*1024))+" MiB."
    );
  }
  return limit;
}

export function assertDecodedImageBudget(
  width:number,
  height:number,
  frames=1,
  bytesPerPixel=4,
  profile=getDeviceProfile()
):void {
  const pixels=width*height*frames;
  if(!Number.isSafeInteger(pixels)||pixels>profile.maxImagePixels){
    throw new Error("IMAGE_DIMENSIONS_UNSAFE: Decoded pixel count exceeds the "+profile.tier+" device budget.");
  }
  const bytes=pixels*Math.max(1,bytesPerPixel);
  if(!Number.isSafeInteger(bytes)||bytes>profile.decodedImageBudgetBytes){
    throw new Error("IMAGE_MEMORY_UNSAFE: Estimated decoded image memory exceeds the "+profile.tier+" device budget.");
  }
}

export function recommendedBatchParallelism(profile=getDeviceProfile()):number {
  return Math.max(1,Math.min(profile.maxBatchParallelism,Math.floor(profile.hardwareConcurrency/2)||1));
}
