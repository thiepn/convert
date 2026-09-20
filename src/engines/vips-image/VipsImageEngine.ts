import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import { defaultImageSettings } from "../../core/image/types";
import type { VipsWorkerResponse } from "./messages";

const INPUTS = new Set(["jpeg", "png", "webp", "gif", "tiff", "bmp", "avif", "heif", "jxl", "svg"]);
const OUTPUTS = new Set(["jpeg", "png", "webp", "gif", "tiff", "avif", "heif", "jxl"]);

function requiredLibraries(from: string, to: string): string[] {
  const libraries = new Set<string>();
  if (["avif", "heif"].includes(from) || ["avif", "heif"].includes(to)) libraries.add("vips-heif.wasm");
  if (from === "jxl" || to === "jxl") libraries.add("vips-jxl.wasm");
  if (from === "svg") libraries.add("vips-resvg.wasm");
  return [...libraries];
}

export class VipsImageEngine implements ConversionEngine {
  readonly id = "vips-image";
  readonly version = "wasm-vips-0.0.18";
  private workers = new Set<Worker>();
  private prepared = false;

  async prepare(): Promise<void> {
    this.prepared = true;
  }

  isAvailable(): boolean {
    return this.prepared
      && typeof Worker !== "undefined"
      && typeof WebAssembly !== "undefined"
      && typeof SharedArrayBuffer !== "undefined"
      && globalThis.crossOriginIsolated === true;
  }

  canConvert(from: string, to: string): boolean {
    return INPUTS.has(from) && OUTPUTS.has(to);
  }

  async estimate(source: Blob): Promise<ConversionEstimate> {
    return {
      temporaryBytes: Math.max(source.size * 1.5, 128 * 1024 * 1024),
      outputBytes: null,
      notes: ["wasm-vips processing is isolated in a disposable worker and uses demand-driven image evaluation where supported."]
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
