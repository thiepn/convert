export interface StoragePreflight {
  required: number;
  available: number | null;
  safe: boolean;
}

export async function storagePreflight(required: number): Promise<StoragePreflight> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota) return { required, available: null, safe: true };
    const usage = estimate.usage ?? 0;
    const available = Math.max(0, estimate.quota - usage);
    return { required, available, safe: available >= required };
  } catch {
    return { required, available: null, safe: true };
  }
}
