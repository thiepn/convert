import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import { defaultImageSettings } from "../../core/image/types";
import type { VipsWorkerResponse } from "./messages";

const INPUTS = new Set(["jpeg", "png", "webp", "gif", "tiff", "bmp", "avif", "heif", "jxl", "svg"]);
const OUTPUTS = new Set(["jpeg", "png", "webp", "gif", "tiff", "avif", "jxl"]);

function supportsSimd(): boolean {
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

function supportsExceptionHandling(): boolean {
  return "Exception" in (WebAssembly as unknown as Record<string, unknown>);
}

function requiredLibraries(from: string, to: string): string[] {
  const libraries = new Set<string>();
  if (from === "avif" || to === "avif") libraries.add("vips-heif.wasm");
  if (from === "jxl" || to === "jxl") libraries.add("vips-jxl.wasm");
  if (from === "svg") libraries.add("vips-resvg.wasm");
  return [...libraries];
}

export class VipsImageEngine implements ConversionEngine {
  readonly id = "vips-image";
  readonly version = "wasm-vips-0.0.18";
  private workers = new Set<Worker>();
  private prepared = false;
  private runtimeReady = false;

  async prepare(): Promise<void> {
    this.prepared = true;
    this.runtimeReady = typeof WebAssembly !== "undefined"
      && supportsSimd()
      && supportsExceptionHandling();
  }

  isAvailable(): boolean {
    return this.prepared
      && this.runtimeReady
      && typeof Worker !== "undefined"
      && typeof SharedArrayBuffer !== "undefined"
      && globalThis.crossOriginIsolated === true;
  }

  canConvert(from: string, to: string): boolean {
    return INPUTS.has(from) && OUTPUTS.has(to);
  }

  async estimate(source: Blob, from: string): Promise<ConversionEstimate> {
    const multiplier = from === "heif" ? 3 : 1.5;
    return {
      temporaryBytes: Math.max(source.size * multiplier, 160 * 1024 * 1024),
      outputBytes: null,
      notes: [from === "heif"
        ? "HEIC/HEIF is decoded locally through a dedicated libheif worker path before image processing."
        : "wasm-vips runs in a disposable worker and uses demand-driven image evaluation where supported."]
    };
  }

  convert(request: EngineConvertRequest): Promise<EngineConvertResult> {
    if (!this.isAvailable() || !this.canConvert(request.sourceFormatId, request.targetFormatId)) {
      return Promise.reject(new Error("Production image engine is unavailable for this route on the current runtime."));
    }

    const imageSettings = { ...defaultImageSettings(), ...request.settings?.image };
    const worker = new Worker(new URL("../../workers/vips-image.worker.ts", import.meta.url), { type: "module" });
    this.workers.add(worker);

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        request.signal.removeEventListener("abort", abort);
        worker.terminate();
        this.workers.delete(worker);
      };

      const abort = () => {
        finish();
        reject(new DOMException("Conversion cancelled.", "AbortError"));
      };

      request.signal.addEventListener("abort", abort, { once: true });

      worker.onmessage = (event: MessageEvent<VipsWorkerResponse>) => {
        const message = event.data;
        if (message.jobId !== request.jobId) return;

        if (message.type === "progress") {
          request.onProgress?.(message.progress, message.stage);
          return;
        }

        if (message.type === "error") {
          finish();
          reject(new Error(message.code + ": " + message.message));
          return;
        }

        finish();
        resolve({
          blob: message.blob,
          width: message.width,
          height: message.height,
          frameCount: message.frameCount,
          hasAlpha: message.hasAlpha,
          bitDepth: message.bitDepth,
          metadata: message.metadata,
          actualQuality: message.actualQuality
        });
      };

      worker.onerror = event => {
        finish();
        reject(new Error(event.message || "Production image worker crashed."));
      };

      const assetBaseUrl = new URL("engines/vips/", document.baseURI).href;
      const concurrency = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)));

      worker.postMessage({
        type: "convert",
        jobId: request.jobId,
        source: request.source,
        sourceFormatId: request.sourceFormatId,
        targetFormatId: request.targetFormatId,
        targetMime: request.targetMime,
        settings: imageSettings,
        assetBaseUrl,
        dynamicLibraries: requiredLibraries(request.sourceFormatId, request.targetFormatId),
        concurrency
      });
    });
  }

  dispose(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers.clear();
  }
}
