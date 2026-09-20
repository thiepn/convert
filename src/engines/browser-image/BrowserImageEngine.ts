import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import type { WorkerResponse } from "../../core/workers/WorkerProtocol";
import { assertMemoryBackedSource } from "../../core/performance/Budget";

const SUPPORTED = new Set([
  "jpeg>png", "jpeg>webp",
  "png>jpeg", "png>webp",
  "webp>jpeg", "webp>png"
]);

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

export class BrowserImageEngine implements ConversionEngine {
  readonly id = "browser-image-proof";
  readonly version = "phase0";
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
    const memoryBytes=source.size*2+64*1024*1024;
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:Math.max(32*1024*1024,source.size*1.5),
      outputBytes:null,
      sourceAccess:"buffered",
      outputAccess:"buffered",
      notes:["Browser canvas fallback is memory-backed and used only when the production image engine is unavailable."]
    };
  }

  convert(request: EngineConvertRequest): Promise<EngineConvertResult> {
    if (!this.isAvailable() || !this.canConvert(request.sourceFormatId, request.targetFormatId)) {
      return Promise.reject(new Error("Browser image proof engine cannot perform this route on the current runtime."));
    }
    assertMemoryBackedSource(request.source.size,"browser canvas image conversion",2,256*1024*1024);

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
