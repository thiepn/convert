import type { CapabilityProfile, CodecSupport } from "./CapabilityProfile";

function supportsSimd(): boolean {
  if (typeof WebAssembly === "undefined") return false;
  try {
    const bytes = new Uint8Array([
      0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,
      10,10,1,8,0,65,0,253,15,253,98,11
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

async function probeVideo(codec: string): Promise<CodecSupport> {
  const g = globalThis as unknown as Record<string, any>;
  const decodeConfig = { codec, codedWidth: 640, codedHeight: 360 };
  const encodeConfig = { codec, width: 640, height: 360, bitrate: 1_000_000, framerate: 30 };

  let decode = false;
  let encode = false;
  try {
    if (g.VideoDecoder?.isConfigSupported) {
      decode = Boolean((await g.VideoDecoder.isConfigSupported(decodeConfig)).supported);
    }
  } catch {}
  try {
    if (g.VideoEncoder?.isConfigSupported) {
      encode = Boolean((await g.VideoEncoder.isConfigSupported(encodeConfig)).supported);
    }
  } catch {}
  return { decode, encode };
}

async function probeAudio(codec: string): Promise<CodecSupport> {
  const g = globalThis as unknown as Record<string, any>;
  const config = { codec, sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 };

  let decode = false;
  let encode = false;
  try {
    if (g.AudioDecoder?.isConfigSupported) {
      decode = Boolean((await g.AudioDecoder.isConfigSupported(config)).supported);
    }
  } catch {}
  try {
    if (g.AudioEncoder?.isConfigSupported) {
      encode = Boolean((await g.AudioEncoder.isConfigSupported(config)).supported);
    }
  } catch {}
  return { decode, encode };
}

export async function detectCapabilities(): Promise<CapabilityProfile> {
  const nav = globalThis.navigator;
  const storage = nav?.storage;
  let estimate: StorageEstimate = {};
  try {
    estimate = storage?.estimate ? await storage.estimate() : {};
  } catch {}

  const isolated = globalThis.crossOriginIsolated === true;
  const shared = typeof SharedArrayBuffer !== "undefined";

  const [h264, vp9, av1, aac, opus] = await Promise.all([
    probeVideo("avc1.42E01E"),
    probeVideo("vp09.00.10.08"),
    probeVideo("av01.0.04M.08"),
    probeAudio("mp4a.40.2"),
    probeAudio("opus")
  ]);

  const g = globalThis as unknown as Record<string, any>;

  return {
    webAssembly: typeof WebAssembly !== "undefined",
    wasmSIMD: supportsSimd(),
    wasmThreads: isolated && shared,
    sharedArrayBuffer: shared,
    crossOriginIsolated: isolated,
    opfs: Boolean(storage?.getDirectory),
    fileSystemAccess: typeof g.showSaveFilePicker === "function",
    serviceWorker: Boolean(nav?.serviceWorker),
    workers: typeof Worker !== "undefined",
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    imageBitmap: typeof createImageBitmap === "function",
    webCodecs: Boolean(g.VideoDecoder || g.AudioDecoder),
    hardwareConcurrency: nav?.hardwareConcurrency ?? 1,
    storageQuota: estimate.quota ?? null,
    storageUsage: estimate.usage ?? null,
    codecs: { h264, vp9, av1, aac, opus }
  };
}
