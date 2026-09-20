import type { ImageConversionSettings, ImageMetadataSummary } from "../core/image/types";
import type { VipsWorkerRequest, VipsWorkerResponse } from "../engines/vips-image/messages";

type VipsModule = any;
type VipsImage = any;

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<VipsWorkerRequest>) => void) | null;
  postMessage(message: VipsWorkerResponse): void;
};

function send(message: VipsWorkerResponse): void {
  scope.postMessage(message);
}

function quality100(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value * 100)));
}

function parseHexColor(value: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : "ffffff";
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function metadataKeep(vips: VipsModule, policy: ImageConversionSettings["metadataPolicy"]): unknown {
  if (policy === "preserve") return vips.ForeignKeep.all;
  if (policy === "privacy") return vips.ForeignKeep.icc;
  return vips.ForeignKeep.none;
}

function metadataSummary(image: VipsImage): ImageMetadataSummary {
  const fields = new Set<string>(
    typeof image.getFields === "function"
      ? (image.getFields() as string[]).map(field => field.toLowerCase())
      : []
  );
  const has = (needles: string[]) => [...fields].some(field => needles.some(needle => field.includes(needle)));
  return {
    exif: has(["exif-data", "exif-ifd"]),
    xmp: has(["xmp-data", "xmp"]),
    iptc: has(["iptc-data", "iptc"]),
    icc: has(["icc-profile-data", "icc-profile"]),
    gps: has(["gpslatitude", "gpslongitude", "exif-ifd3", "gps-"])
  };
}

function bitDepthOf(image: VipsImage): number | undefined {
  const format = String(image.format ?? "").toLowerCase();
  if (format === "uchar" || format === "char") return 8;
  if (format === "ushort" || format === "short") return 16;
  if (format === "uint" || format === "int" || format === "float") return 32;
  if (format === "double") return 64;
  return undefined;
}

function frameGeometry(image: VipsImage): { width: number; height: number; frameCount: number } {
  const pageHeight = Number(image.pageHeight) > 0 ? Number(image.pageHeight) : Number(image.height);
  const totalHeight = Number(image.height);
  const frameCount = pageHeight > 0 ? Math.max(1, Math.round(totalHeight / pageHeight)) : 1;
  return { width: Number(image.width), height: pageHeight, frameCount };
}

function shouldLoadAllPages(source: string, target: string, settings: ImageConversionSettings): boolean {
  if (!settings.preserveAnimation) return false;
  if ((source === "gif" || source === "webp") && (target === "gif" || target === "webp")) return true;
  if (source === "tiff" && target === "tiff") return true;
  return false;
}

function computeScale(width: number, height: number, settings: ImageConversionSettings): number {
  const { mode, value, allowUpscale } = settings.resize;
  if (mode === "original" || !value || value <= 0) return 1;

  let scale = 1;
  if (mode === "longest-edge") scale = value / Math.max(width, height);
  if (mode === "width") scale = value / width;
  if (mode === "height") scale = value / height;
  if (mode === "percentage") scale = value / 100;

  if (!allowUpscale) scale = Math.min(1, scale);
  return Math.max(0.01, Math.min(16, scale));
}

function resizeImage(image: VipsImage, scale: number, owned: VipsImage[]): VipsImage {
  if (Math.abs(scale - 1) < 0.0001) return image;
  const oldPageHeight = Number(image.pageHeight) > 0 ? Number(image.pageHeight) : Number(image.height);
  const oldFrames = Math.max(1, Math.round(Number(image.height) / oldPageHeight));
  const resized = image.resize(scale, { kernel: "lanczos3" });
  owned.push(resized);
  if (oldFrames > 1 && typeof resized.setInt === "function") {
    resized.setInt("page-height", Math.max(1, Math.round(oldPageHeight * scale)));
  }
  return resized;
}

async function decodeHeifToVips(vips: VipsModule, bytes: Uint8Array): Promise<VipsImage> {
  const module = await import("libheif-js/wasm-bundle");
  const libheif = module.default;
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(bytes);
  if (!images.length) throw new Error("No decodable image was found inside the HEIC/HEIF file.");

  const source = images[0];
  const width = source.get_width();
  const height = source.get_height();
  if (!width || !height) throw new Error("HEIC/HEIF decoder returned invalid dimensions.");

  const target: { data: Uint8ClampedArray; width: number; height: number } = {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height
  };
  const displayed = await new Promise<{ data: Uint8ClampedArray; width: number; height: number }>((resolve, reject) => {
    source.display(target, result => {
      if (!result) reject(new Error("HEIC/HEIF pixel decode failed."));
      else resolve({ data: new Uint8ClampedArray(result.data), width: result.width, height: result.height });
    });
  });

  const image = vips.Image.newFromMemory(displayed.data, width, height, 4, "uchar");
  const interpreted = image.copy({ interpretation: "srgb" });
  image.delete();
  return interpreted;
}

function loadImage(
  vips: VipsModule,
  bytes: Uint8Array,
  sourceFormatId: string,
  targetFormatId: string,
  settings: ImageConversionSettings
): Promise<VipsImage> | VipsImage {
  if (sourceFormatId === "heif") return decodeHeifToVips(vips, bytes);

  const options: Record<string, unknown> = { access: "sequential" };
  if (shouldLoadAllPages(sourceFormatId, targetFormatId, settings)) options.n = -1;
  return vips.Image.newFromBuffer(bytes, "", options);
}

function encodeImage(
  vips: VipsModule,
  image: VipsImage,
  target: string,
  settings: ImageConversionSettings,
  quality: number
): Uint8Array {
  const Q = Math.max(1, Math.min(100, Math.round(quality)));
  const keep = metadataKeep(vips, settings.metadataPolicy);

  if (target === "jpeg") {
    return image.jpegsaveBuffer({
      Q,
      interlace: true,
      optimize_coding: true,
      subsample_mode: "auto",
      keep
    });
  }
  if (target === "png") {
    return image.pngsaveBuffer({ compression: 6, filter: "all", keep });
  }
  if (target === "webp") {
    return image.webpsaveBuffer({
      Q,
      lossless: settings.lossless,
      effort: 4,
      keep
    });
  }
  if (target === "gif") {
    return image.gifsaveBuffer({ effort: 7, dither: 0.8, keep });
  }
  if (target === "tiff") {
    return image.tiffsaveBuffer({ compression: "deflate", predictor: "horizontal", keep });
  }
  if (target === "avif") {
    return image.heifsaveBuffer({
      Q,
      compression: "av1",
      encoder: "aom",
      effort: 4,
      lossless: settings.lossless,
      keep
    });
  }
  if (target === "jxl") {
    return image.jxlsaveBuffer({
      Q,
      effort: 7,
      lossless: settings.lossless,
      keep
    });
  }
  throw new Error("Unsupported image output: " + target);
}

function supportsTargetSize(target: string, settings: ImageConversionSettings): boolean {
  return !settings.lossless && ["jpeg", "webp", "avif", "jxl"].includes(target);
}

function toOwnedBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function encodeTowardTarget(
  vips: VipsModule,
  image: VipsImage,
  target: string,
  settings: ImageConversionSettings,
  targetBytes: number
): { bytes: Uint8Array; quality: number } {
  const maxQ = quality100(settings.quality);
  let low = Math.min(20, maxQ);
  let high = maxQ;
  let best: { bytes: Uint8Array; quality: number } | null = null;
  let smallest: { bytes: Uint8Array; quality: number } | null = null;

  for (let attempt = 0; attempt < 7 && low <= high; attempt += 1) {
    const q = Math.round((low + high) / 2);
    const bytes = toOwnedBytes(encodeImage(vips, image, target, settings, q));
    if (!smallest || bytes.byteLength < smallest.bytes.byteLength) smallest = { bytes, quality: q };

    if (bytes.byteLength <= targetBytes) {
      best = { bytes, quality: q };
      low = q + 1;
    } else {
      high = q - 1;
    }
  }

  return best ?? smallest ?? {
    bytes: toOwnedBytes(encodeImage(vips, image, target, settings, maxQ)),
    quality: maxQ
  };
}

function safeImageMemory(image: VipsImage): void {
  const geometry = frameGeometry(image);
  const bands = Math.max(1, Number(image.bands) || 4);
  const depth = bitDepthOf(image) ?? 8;
  const bytesPerSample = depth <= 8 ? 1 : depth <= 16 ? 2 : 4;
  const estimated = geometry.width * geometry.height * geometry.frameCount * bands * bytesPerSample;
  const mobileBudget = 768 * 1024 * 1024;
  const desktopBudget = 2 * 1024 * 1024 * 1024;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (!Number.isSafeInteger(estimated) || estimated > (coarse ? mobileBudget : desktopBudget)) {
    throw new Error("Decoded image exceeds this device's Phase 1 memory safety budget.");
  }
}

scope.onmessage = async event => {
  const message = event.data;
  const {
    jobId,
    source,
    sourceFormatId,
    targetFormatId,
    targetMime,
    settings,
    assetBaseUrl,
    dynamicLibraries,
    concurrency
  } = message;

  const owned: VipsImage[] = [];
  let vips: VipsModule | null = null;

  try {
    send({ type: "progress", jobId, progress: 0.04, stage: "Loading local image engine" });
    const module = await import(/* @vite-ignore */ (assetBaseUrl + "vips-es6.js"));
    const Vips = module.default ?? module;
    vips = await Vips({
      dynamicLibraries,
      locateFile: (file: string) => assetBaseUrl + file,
      mainScriptUrlOrBlob: assetBaseUrl + "vips-es6.js"
    });

    vips.concurrency(concurrency);
    vips.Cache.maxMem(96 * 1024 * 1024);
    vips.Cache.maxFiles(16);

    send({ type: "progress", jobId, progress: 0.12, stage: "Decoding image locally" });
    const bytes = new Uint8Array(await source.arrayBuffer());
    let image = await loadImage(vips, bytes, sourceFormatId, targetFormatId, settings);
    owned.push(image);
    safeImageMemory(image);

    if (settings.autoOrient && sourceFormatId !== "heif" && typeof image.autorot === "function") {
      const rotated = image.autorot();
      owned.push(rotated);
      image = rotated;
    }

    const sourceMetadata = metadataSummary(image);
    const geometryBefore = frameGeometry(image);
    const scale = computeScale(geometryBefore.width, geometryBefore.height, settings);
    image = resizeImage(image, scale, owned);

    if (targetFormatId === "jpeg" && typeof image.hasAlpha === "function" && image.hasAlpha()) {
      const flattened = image.flatten({ background: parseHexColor(settings.background) });
      owned.push(flattened);
      image = flattened;
    }

    if (["jpeg", "png", "webp", "gif", "avif", "jxl"].includes(targetFormatId)) {
      const interpretation = String(image.interpretation ?? "").toLowerCase();
      if (["cmyk", "lab", "labs", "xyz", "scrgb"].includes(interpretation)) {
        const srgb = image.colourspace("srgb");
        owned.push(srgb);
        image = srgb;
      }
    }

    send({ type: "progress", jobId, progress: 0.52, stage: "Encoding image" });
    let outputBytes: Uint8Array;
    let actualQuality = quality100(settings.quality);

    if (settings.targetBytes && settings.targetBytes > 0 && supportsTargetSize(targetFormatId, settings)) {
      let result = encodeTowardTarget(vips, image, targetFormatId, settings, settings.targetBytes);
      outputBytes = result.bytes;
      actualQuality = result.quality;

      if (
        outputBytes.byteLength > settings.targetBytes
        && settings.resize.mode === "original"
        && outputBytes.byteLength > 0
      ) {
        const reduction = Math.sqrt(settings.targetBytes / outputBytes.byteLength) * 0.92;
        if (reduction > 0.05 && reduction < 0.96) {
          image = resizeImage(image, reduction, owned);
          result = encodeTowardTarget(vips, image, targetFormatId, settings, settings.targetBytes);
          outputBytes = result.bytes;
          actualQuality = result.quality;
        }
      }
    } else {
      outputBytes = toOwnedBytes(encodeImage(vips, image, targetFormatId, settings, actualQuality));
    }

    send({ type: "progress", jobId, progress: 0.88, stage: "Finalizing image output" });
    const geometry = frameGeometry(image);
    const hasAlpha = typeof image.hasAlpha === "function" ? Boolean(image.hasAlpha()) : false;

    const metadata: ImageMetadataSummary = settings.metadataPolicy === "preserve"
      ? sourceMetadata
      : settings.metadataPolicy === "privacy"
        ? { exif: false, xmp: false, iptc: false, icc: sourceMetadata.icc, gps: false }
        : { exif: false, xmp: false, iptc: false, icc: false, gps: false };

    const outputBuffer = outputBytes.slice().buffer;
    const blob = new Blob([outputBuffer], { type: targetMime });

    send({
      type: "result",
      jobId,
      blob,
      width: geometry.width,
      height: geometry.height,
      frameCount: geometry.frameCount,
      hasAlpha,
      bitDepth: bitDepthOf(image),
      metadata,
      actualQuality
    });
  } catch (error) {
    send({
      type: "error",
      jobId,
      code: "ENGINE_VIPS_IMAGE_FAILED",
      message: error instanceof Error ? error.message : "Production image conversion failed."
    });
  } finally {
    for (let index = owned.length - 1; index >= 0; index -= 1) {
      try {
        if (!owned[index].isDeleted?.()) owned[index].delete();
      } catch {}
    }
    try { vips?.shutdown?.(); } catch {}
  }
};
