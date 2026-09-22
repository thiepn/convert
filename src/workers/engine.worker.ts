import type { WorkerRequest, WorkerResponse } from "../core/workers/WorkerProtocol";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

const cancelled = new Set<string>();

function send(message: WorkerResponse) {
  scope.postMessage(message);
}

scope.onmessage = async event => {
  const message = event.data;

  if (message.type === "cancel") {
    cancelled.add(message.jobId);
    return;
  }

  const { jobId, source, targetMime, quality, maxDimension, background } = message;

  try {
    send({ type: "progress", jobId, progress: 0.15, stage: "Decoding image" });
    const bitmap = await createImageBitmap(source);
    if (cancelled.has(jobId)) {
      bitmap.close();
      return;
    }

    send({ type: "progress", jobId, progress: 0.48, stage: "Rendering locally" });
    const longest=Math.max(bitmap.width,bitmap.height);
    const scale=maxDimension&&maxDimension>0&&longest>maxDimension
      ?maxDimension/longest
      :1;
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas context unavailable.");
    context.imageSmoothingEnabled=true;
    context.imageSmoothingQuality="high";
    if(targetMime==="image/jpeg"){
      context.fillStyle=background||"#ffffff";
      context.fillRect(0,0,width,height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    if (cancelled.has(jobId)) return;

    send({ type: "progress", jobId, progress: 0.78, stage: "Encoding output" });
    const blob = await canvas.convertToBlob({ type: targetMime, quality });

    if (cancelled.has(jobId)) return;
    send({ type: "result", jobId, blob, width, height });
  } catch (error) {
    send({
      type: "error",
      jobId,
      code: "ENGINE_IMAGE_CONVERSION_FAILED",
      message: error instanceof Error ? error.message : "Image conversion failed."
    });
  } finally {
    cancelled.delete(jobId);
  }
};
