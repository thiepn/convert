import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { WorkerResponse } from "../../core/workers/WorkerProtocol";

const SUPPORTED_FORMATS = ["jpeg", "png", "webp"];
const SUPPORTED = new Set(
  SUPPORTED_FORMATS.flatMap(from => SUPPORTED_FORMATS.map(to => from + ">" + to))
);

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

export class BrowserImageEngine implements ConversionEngine {
  readonly id = "browser-image-fallback";
  readonly version = "phase1-fallback";
  private workers = new Set<Worker>();
  private encodableTargets = new Set<string>();
  private prepared = false;

  private baseAvailable(): boolean {
    return typeof Worker !== "undefined"
      && typeof OffscreenCanvas !== "undefined"
      && typeof createImageBitmap === "function";
  }

  async prepare(): Promise<void> {
    this.prepared = true;
    this.encodableTargets.clear();
    if (!this.baseAvailable()) return;

    const canvas = new OffscreenCanvas(1, 1);
    for (const [formatId, mime] of Object.entries(MIME_BY_FORMAT)) {
      try {
        const blob = await canvas.convertToBlob({ type: mime, quality: 0.8 });
        if (blob.type === mime && blob.size > 0) this.encodableTargets.add(formatId);
      } catch {}
    }
  }

  isAvailable(): boolean {
    return this.prepared && this.baseAvailable() && this.encodableTargets.size > 0;
  }

  canConvert(from: string, to: string): boolean {
    return SUPPORTED.has(from + ">" + to) && this.encodableTargets.has(to);
  }

  async estimate(source: Blob): Promise<ConversionEstimate> {
    return {
      temporaryBytes: source.size * 2 + 64 * 1024 * 1024,
      outputBytes: null,
      notes: ["Canvas fallback is memory-backed and strips most metadata."]
    };
  }

  convert(request: EngineConvertRequest): Promise<EngineConvertResult> {
    if (!this.isAvailable() || !this.canConvert(request.sourceFormatId, request.targetFormatId)) {
      return Promise.reject(new Error("Browser image fallback cannot perform this route on the current runtime."));
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
        resolve({ blob: message.blob, width: message.width, height: message.height, frameCount: 1 });
      };

      worker.onerror = event => {
        finish();
        reject(new Error(event.message || "Fallback conversion worker crashed."));
      };

      worker.postMessage({
        type: "convert-image",
        jobId: request.jobId,
        source: request.source,
        targetMime: request.targetMime,
        quality: request.settings?.image?.quality ?? 0.82
      });
    });
  }

  dispose(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers.clear();
  }
}
