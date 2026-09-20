export interface CodecSupport {
  decode: boolean;
  encode: boolean;
}

export interface CapabilityProfile {
  webAssembly: boolean;
  wasmSIMD: boolean;
  wasmThreads: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  opfs: boolean;
  fileSystemAccess: boolean;
  serviceWorker: boolean;
  workers: boolean;
  offscreenCanvas: boolean;
  imageBitmap: boolean;
  webCodecs: boolean;
  hardwareConcurrency: number;
  storageQuota: number | null;
  storageUsage: number | null;
  codecs: {
    h264: CodecSupport;
    vp9: CodecSupport;
    av1: CodecSupport;
    aac: CodecSupport;
    opus: CodecSupport;
  };
}
