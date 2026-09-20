const MIB=1024*1024;
const GIB=1024*MIB;

export type DeviceTier="constrained"|"mobile"|"balanced"|"powerful";

export interface DeviceSignals {
  hardwareConcurrency:number;
  deviceMemoryGB:number|null;
  coarsePointer:boolean;
  viewportWidth:number|null;
  opfs:boolean;
  crossOriginIsolated:boolean;
}

export interface DeviceProfile extends DeviceSignals {
  tier:DeviceTier;
  mobileLike:boolean;
  effectiveMemoryGB:number;
  workingSetBudgetBytes:number;
  decodedImageBudgetBytes:number;
  maxImagePixels:number;
  maxBatchParallelism:number;
  preferredChunkBytes:number;
  storageReserveBytes:number;
  maxArchiveExpandedBytes:number;
  maxArchiveFiles:number;
  maxWasmThreads:number;
}

export function detectDeviceSignals():DeviceSignals {
  const nav=globalThis.navigator as (Navigator & {deviceMemory?:number})|undefined;
  const width=typeof globalThis.innerWidth==="number"?globalThis.innerWidth:null;
  const coarse=typeof globalThis.matchMedia==="function"
    ?globalThis.matchMedia("(pointer: coarse)").matches
    :Boolean(nav?.maxTouchPoints&&nav.maxTouchPoints>0);
  const memory=typeof nav?.deviceMemory==="number"&&Number.isFinite(nav.deviceMemory)
    ?nav.deviceMemory
    :null;
  return {
    hardwareConcurrency:Math.max(1,nav?.hardwareConcurrency??1),
    deviceMemoryGB:memory,
    coarsePointer:coarse,
    viewportWidth:width,
    opfs:Boolean(nav?.storage?.getDirectory),
    crossOriginIsolated:globalThis.crossOriginIsolated===true
  };
}

export function deriveDeviceProfile(signals:Partial<DeviceSignals>={}):DeviceProfile {
  const hardwareConcurrency=Math.max(1,signals.hardwareConcurrency??4);
  const coarsePointer=signals.coarsePointer??false;
  const viewportWidth=signals.viewportWidth??null;
  const mobileLike=coarsePointer||(viewportWidth!=null&&viewportWidth<=760);
  const deviceMemoryGB=signals.deviceMemoryGB??null;
  const effectiveMemoryGB=deviceMemoryGB??(mobileLike?4:hardwareConcurrency<=4?4:8);

  let tier:DeviceTier;
  if(effectiveMemoryGB<=2||hardwareConcurrency<=2) tier="constrained";
  else if(mobileLike||effectiveMemoryGB<=4) tier="mobile";
  else if(effectiveMemoryGB<=8||hardwareConcurrency<=8) tier="balanced";
  else tier="powerful";

  const policy={
    constrained:{
      working:320*MIB,decoded:256*MIB,pixels:32_000_000,parallel:1,chunk:4*MIB,
      reserve:96*MIB,archive:128*MIB,archiveFiles:2_000,threads:1
    },
    mobile:{
      working:640*MIB,decoded:512*MIB,pixels:64_000_000,parallel:1,chunk:4*MIB,
      reserve:160*MIB,archive:256*MIB,archiveFiles:4_000,threads:2
    },
    balanced:{
      working:1280*MIB,decoded:1024*MIB,pixels:140_000_000,parallel:2,chunk:8*MIB,
      reserve:256*MIB,archive:768*MIB,archiveFiles:15_000,threads:4
    },
    powerful:{
      working:2560*MIB,decoded:2048*MIB,pixels:240_000_000,parallel:3,chunk:16*MIB,
      reserve:384*MIB,archive:1536*MIB,archiveFiles:30_000,threads:4
    }
  }[tier];

  return {
    hardwareConcurrency,
    deviceMemoryGB,
    coarsePointer,
    viewportWidth,
    opfs:signals.opfs??false,
    crossOriginIsolated:signals.crossOriginIsolated??false,
    tier,
    mobileLike,
    effectiveMemoryGB,
    workingSetBudgetBytes:policy.working,
    decodedImageBudgetBytes:policy.decoded,
    maxImagePixels:policy.pixels,
    maxBatchParallelism:policy.parallel,
    preferredChunkBytes:policy.chunk,
    storageReserveBytes:policy.reserve,
    maxArchiveExpandedBytes:policy.archive,
    maxArchiveFiles:policy.archiveFiles,
    maxWasmThreads:policy.threads
  };
}

export function getDeviceProfile():DeviceProfile {
  return deriveDeviceProfile(detectDeviceSignals());
}

export function memoryBackedSourceLimit(
  multiplier:number,
  hardCapBytes=Number.POSITIVE_INFINITY,
  profile=getDeviceProfile()
):number {
  const safeMultiplier=Math.max(1,multiplier);
  const budget=Math.floor(profile.workingSetBudgetBytes*.65/safeMultiplier);
  return Math.max(16*MIB,Math.min(hardCapBytes,budget));
}

export const bytes={MIB,GIB};
