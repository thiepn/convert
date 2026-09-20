import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { WorkerResponse } from "../../core/workers/WorkerProtocol";

const SUPPORTED = new Set([
  "jpeg>png", "jpeg>webp",
  "png>jpeg", "png>webp",
  "webp>jpeg", "webp>png"
]);

export class BrowserImageEngine implements ConversionEngine {
  readonly id = "browser-image-proof";
  readonly version = "phase0";
  private workers = new Set<Worker>();

  isAvailable(): boolean {
    return typeof Worker !== "undefined"
      && typeof OffscreenCanvas !== "undefined"
      && typeof createImageBitmap === "function";
  }

  canConvert(from: string, to: string): boolean {
    return SUPPORTED.has(from + ">" + to);
  }

  async estimate(source: Blob): Promise<ConversionEstimate> {
    return {
      temporaryBytes: source.size * 2 + 64 * 1024 * 1024,
      outputBytes: null,
      notes: ["Phase 0 browser proof engine is memory-backed; production image streaming arrives in Phase 1."]
    };
  }

  convert(request: EngineConvertRequest): Promise<EngineConvertResult> {
    if (!this.isAvailable()) {
      return Promise.reject(new Error("Browser image proof engine is unavailable on this runtime."));
    }

    const worker = new Worker(new URL("../../workers/engine.worker.ts", import.meta.url), { type: "module" });
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
        worker.postMessage({ type: "cancel", jobId: request.jobId });
        finish();
        reject(new DOMException("Conversion cancelled.", "AbortError"));
      };

      request.signal.addEventListener("abort", abort, { once: true });

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
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
        resolve({ blob: message.blob, width: message.width, height: message.height });
      };

      worker.onerror = event => {
        finish();
        reject(new Error(event.message || "Conversion worker crashed."));
      };

      worker.postMessage({
        type: "convert-image",
        jobId: request.jobId,
        source: request.source,
        targetMime: request.targetMime,
        quality: request.quality ?? 0.82
      });
    });
  }

  dispose(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers.clear();
  }
}
