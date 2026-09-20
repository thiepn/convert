import { getDeviceProfile } from "../performance/DeviceProfile";

export interface StoragePreflight {
  required: number;
  reserve: number;
  available: number | null;
  usable: number | null;
  safe: boolean;
}

export async function storagePreflight(
  required: number,
  reserve=getDeviceProfile().storageReserveBytes
): Promise<StoragePreflight> {
  const normalized=Math.max(0,Math.ceil(required));
  const reserved=Math.max(0,Math.ceil(reserve));
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota) {
      return { required:normalized,reserve:reserved,available:null,usable:null,safe:true };
    }
    const usage = estimate.usage ?? 0;
    const available = Math.max(0, estimate.quota - usage);
    const usable=Math.max(0,available-reserved);
    return {
      required:normalized,
      reserve:reserved,
      available,
      usable,
      safe:usable >= normalized
    };
  } catch {
    return { required:normalized,reserve:reserved,available:null,usable:null,safe:true };
  }
}
