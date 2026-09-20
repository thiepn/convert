import type { CapabilityProfile } from "../core/capabilities/CapabilityProfile";
import { detectCapabilities } from "../core/capabilities/detectCapabilities";
import type { ConversionSettings } from "../core/engines/Engine";
import { EngineRegistry } from "../core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../core/formats/defaultFormats";
import type { ImageInspectionDetails, MetadataPolicy, ResizeMode } from "../core/image/types";
import { defaultImageSettings, traitsFromImageInspection } from "../core/image/types";
import type { FileInspection } from "../core/inspection/inspectFile";
import { inspectFile } from "../core/inspection/inspectFile";
import { JobManager } from "../core/jobs/JobManager";
import type { ConversionOutput } from "../core/jobs/types";
import { createPhase1Graph } from "../core/planner/ConversionGraph";
import { ConversionPlanner } from "../core/planner/ConversionPlanner";
import { ImageOutputValidator } from "../core/validation/Validator";
import { BrowserImageEngine } from "../engines/browser-image/BrowserImageEngine";
import { VipsImageEngine } from "../engines/vips-image/VipsImageEngine";

interface SelectedFile {
  file: File;
  inspection: FileInspection;
}

interface ResultEntry {
  source: File;
  output?: ConversionOutput;
  error?: string;
  url?: string;
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error("Missing UI element: " + id);
  return value as T;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unknown";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + " " + units[unit];
}

function bool(value: boolean): string {
  return value ? "Available" : "Unavailable";
}

function metadataText(image?: ImageInspectionDetails): string {
  if (!image) return "Unknown";
  const values: string[] = [];
  if (image.metadata.exif) values.push("EXIF");
  if (image.metadata.xmp) values.push("XMP");
  if (image.metadata.iptc) values.push("IPTC");
  if (image.metadata.icc) values.push("ICC");
  if (image.metadata.gps) values.push("GPS");
  return values.length ? values.join(", ") : "None detected";
}

export class App {
  private readonly formats = createDefaultFormatRegistry();
  private readonly engines = new EngineRegistry();
  private readonly graph = createPhase1Graph();
  private readonly planner: ConversionPlanner;
  private readonly jobs: JobManager;

  private selection: SelectedFile[] = [];
  private resultEntries: ResultEntry[] = [];
  private objectUrls: string[] = [];
  private activeJobId: string | null = null;
  private batchCancelled = false;

  constructor() {
    this.engines.register(new VipsImageEngine());
    this.engines.register(new BrowserImageEngine());
    this.planner = new ConversionPlanner(this.graph, this.formats, this.engines);
    this.jobs = new JobManager(this.formats, this.engines, this.planner, new ImageOutputValidator(this.formats));
  }

  async start(): Promise<void> {
    this.bindInputs();
    await this.engines.prepareAll();
    await this.renderCapabilities(await detectCapabilities());
  }

  private bindInputs(): void {
    const input = element<HTMLInputElement>("file-input");
    const zone = element<HTMLLabelElement>("drop-zone");

    input.addEventListener("change", () => {
      if (input.files?.length) void this.loadFiles([...input.files]);
    });

    ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => {
      event.preventDefault();
      zone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => {
      event.preventDefault();
      zone.classList.remove("dragging");
    }));
    zone.addEventListener("drop", event => {
      const files = event.dataTransfer?.files ? [...event.dataTransfer.files] : [];
      if (files.length) void this.loadFiles(files);
    });

    element<HTMLSelectElement>("target-format").addEventListener("change", () => {
      this.updateSettingAvailability();
      this.renderRoute();
    });
    element<HTMLSelectElement>("metadata-policy").addEventListener("change", () => this.renderRoute());
    element<HTMLSelectElement>("resize-mode").addEventListener("change", () => this.updateResizeControl());
    element<HTMLButtonElement>("convert-button").addEventListener("click", () => void this.convertBatch());
    element<HTMLButtonElement>("cancel-button").addEventListener("click", () => {
      this.batchCancelled = true;
      if (this.activeJobId) this.jobs.cancel(this.activeJobId);
    });
  }

  private releaseUrls(): void {
    this.objectUrls.forEach(url => URL.revokeObjectURL(url));
    this.objectUrls = [];
  }

  private async loadFiles(files: File[]): Promise<void> {
    this.releaseUrls();
    this.resultEntries = [];
    this.selection = [];

    const inspections = await Promise.all(files.map(async file => ({
      file,
      inspection: await inspectFile(file, this.formats)
    })));

    this.selection = inspections.filter(item => item.inspection.detection.format?.category === "image");
    const rejected = inspections.filter(item => item.inspection.detection.format?.category !== "image");

    element("file-panel").classList.toggle("hidden", this.selection.length === 0);
    element("results-panel").classList.add("hidden");

    if (!this.selection.length) {
      this.renderWarnings("inspection-warnings", ["No supported image files were detected."]);
      return;
    }

    const totalBytes = this.selection.reduce((sum, item) => sum + item.file.size, 0);
    element("selection-title").textContent = this.selection.length === 1
      ? this.selection[0].file.name
      : this.selection.length + " images";
    element("selection-summary").textContent = formatBytes(totalBytes);

    this.renderFileList();

    const warnings = [
      ...this.selection.flatMap(item => item.inspection.detection.warnings.map(w => item.file.name + ": " + w)),
      ...rejected.map(item => item.file.name + ": unsupported or unrecognized image.")
    ];
    this.renderWarnings("inspection-warnings", warnings);
    this.populateTargets();
    this.updateResizeControl();
    this.updateSettingAvailability();
    this.renderRoute();
  }

  private renderFileList(): void {
    const container = element("file-list");
    container.replaceChildren();

    for (const item of this.selection) {
      const row = document.createElement("div");
      row.className = "file-row";

      const main = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.file.name;
      const details = document.createElement("span");
      const format = item.inspection.detection.format?.name ?? "Unknown";
      const dimensions = item.inspection.width && item.inspection.height
        ? item.inspection.width + " × " + item.inspection.height
        : "dimensions pending";
      const frames = (item.inspection.image?.frameCount ?? 1) > 1
        ? " · " + item.inspection.image?.frameCount + " frames/pages"
        : "";
      details.textContent = format + " · " + dimensions + frames + " · " + formatBytes(item.file.size);
      main.append(name, details);

      const metadata = document.createElement("span");
      metadata.className = "file-metadata";
      metadata.textContent = metadataText(item.inspection.image);
      row.append(main, metadata);
      container.append(row);
    }
  }

  private commonTargets(): string[] {
    if (!this.selection.length) return [];
    const targetSets = this.selection.map(item => {
      const source = item.inspection.detection.format;
      return new Set(source ? this.planner.availableTargets(source.id) : []);
    });
    return [...targetSets[0]].filter(target => targetSets.every(set => set.has(target)));
  }

  private recommendedTarget(targets: string[]): string | undefined {
    if (!targets.length) return undefined;
    const images = this.selection.map(item => item.inspection.image);
    const formats = this.selection.map(item => item.inspection.detection.format?.id);

    if (images.some(image => image?.animated) && targets.includes("webp")) return "webp";
    if (formats.some(format => format === "heif" || format === "avif" || format === "jxl") && targets.includes("jpeg")) return "jpeg";
    if (formats.some(format => format === "svg") && targets.includes("png")) return "png";
    if (images.some(image => image?.alpha) && targets.includes("webp")) return "webp";
    if (targets.includes("webp")) return "webp";
    if (targets.includes("jpeg")) return "jpeg";
    return targets[0];
  }

  private populateTargets(): void {
    const select = element<HTMLSelectElement>("target-format");
    const previous = select.value;
    select.replaceChildren();
    const targets = this.commonTargets();

    for (const id of targets) {
      const format = this.formats.get(id);
      if (!format) continue;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = format.name;
      select.append(option);
    }

    if (targets.includes(previous)) select.value = previous;
    else {
      const recommendation = this.recommendedTarget(targets);
      if (recommendation) select.value = recommendation;
    }

    element<HTMLButtonElement>("convert-button").disabled = targets.length === 0;
  }

  private updateResizeControl(): void {
    const mode = element<HTMLSelectElement>("resize-mode").value as ResizeMode;
    const wrap = element("resize-value-wrap");
    wrap.classList.toggle("hidden", mode === "original");
    element("resize-value-label").textContent = mode === "percentage" ? "Percentage" : "Pixels";
  }

  private updateSettingAvailability(): void {
    const target = element<HTMLSelectElement>("target-format").value;
    const lossless = element<HTMLInputElement>("lossless");
    const targetSize = element<HTMLInputElement>("target-size");
    const background = element<HTMLInputElement>("background");

    lossless.disabled = !["webp", "avif", "jxl"].includes(target);
    if (lossless.disabled) lossless.checked = false;

    targetSize.disabled = !["jpeg", "webp", "avif", "jxl"].includes(target);
    if (targetSize.disabled) targetSize.value = "";

    background.disabled = target !== "jpeg";
  }

  private settings(): ConversionSettings {
    const defaults = defaultImageSettings();
    const targetSizeMb = Number(element<HTMLInputElement>("target-size").value);
    const resizeMode = element<HTMLSelectElement>("resize-mode").value as ResizeMode;
    const resizeValue = Number(element<HTMLInputElement>("resize-value").value);

    return {
      image: {
        ...defaults,
        quality: Number(element<HTMLSelectElement>("quality").value),
        metadataPolicy: element<HTMLSelectElement>("metadata-policy").value as MetadataPolicy,
        resize: {
          mode: resizeMode,
          value: resizeMode === "original" ? undefined : resizeValue,
          allowUpscale: false
        },
        background: element<HTMLInputElement>("background").value,
        lossless: element<HTMLInputElement>("lossless").checked,
        targetBytes: targetSizeMb > 0 ? Math.round(targetSizeMb * 1024 * 1024) : null,
        preserveAnimation: element<HTMLInputElement>("preserve-animation").checked
      }
    };
  }

  private renderRoute(): void {
    const target = element<HTMLSelectElement>("target-format").value;
    if (!target || !this.selection.length) {
      element("route-box").textContent = "No local route is available for the selected files on this runtime.";
      this.renderWarnings("loss-warnings", []);
      return;
    }

    const routes = this.selection.map(item => {
      const source = item.inspection.detection.format;
      if (!source) return null;
      try {
        return this.planner.plan(source.id, target, traitsFromImageInspection(item.inspection.image), source.id === target);
      } catch {
        return null;
      }
    });

    const engineIds = [...new Set(routes.flatMap(route => route?.edges.map(edge => edge.engineId) ?? []))];
    const production = engineIds.includes("vips-image");
    element("route-box").textContent =
      this.selection.length + " file" + (this.selection.length === 1 ? "" : "s")
      + " · " + (production ? "production wasm-vips path" : "browser fallback path")
      + " · local worker processing · no upload";

    const warningMap = new Map<string, string>();
    routes.forEach(route => route?.warnings.forEach(warning => warningMap.set(warning.code + warning.message, warning.message)));

    const policy = element<HTMLSelectElement>("metadata-policy").value;
    if (policy === "privacy") warningMap.set("privacy", "Privacy mode removes GPS/personal metadata while retaining the color profile where supported.");
    if (policy === "strip") warningMap.set("strip", "Strip mode removes optional metadata, including color profiles; appearance can change for non-sRGB sources.");

    this.renderWarnings("loss-warnings", [...warningMap.values()]);
  }

  private renderWarnings(id: string, warnings: string[]): void {
    const container = element(id);
    container.replaceChildren();
    for (const warning of warnings) {
      const row = document.createElement("div");
      row.className = "warning";
      row.textContent = warning;
      container.append(row);
    }
  }

  private async convertBatch(): Promise<void> {
    const target = element<HTMLSelectElement>("target-format").value;
    if (!target || !this.selection.length) return;

    this.releaseUrls();
    this.resultEntries = [];
    this.batchCancelled = false;
    this.activeJobId = null;

    const convertButton = element<HTMLButtonElement>("convert-button");
    const cancelButton = element<HTMLButtonElement>("cancel-button");
    convertButton.disabled = true;
    cancelButton.classList.remove("hidden");
    element("job-panel").classList.remove("hidden");
    element("results-panel").classList.remove("hidden");
    element("results-list").replaceChildren();
    element("comparison").classList.add("hidden");

    const settings = this.settings();

    try {
      for (let index = 0; index < this.selection.length; index += 1) {
        if (this.batchCancelled) break;
        const item = this.selection[index];

        try {
          const output = await this.jobs.convert(item.file, target, settings, snapshot => {
            this.activeJobId = snapshot.id;
            const overall = (index + snapshot.progress) / this.selection.length;
            element("job-stage").textContent = (index + 1) + "/" + this.selection.length + " · " + item.file.name + " · " + snapshot.stage;
            element("job-progress").textContent = Math.round(overall * 100) + "%";
            element<HTMLElement>("progress-bar").style.width = Math.round(overall * 100) + "%";
          });

          const url = URL.createObjectURL(output.blob);
          this.objectUrls.push(url);
          this.resultEntries.push({ source: item.file, output, url });
        } catch (error) {
          if (this.batchCancelled) break;
          this.resultEntries.push({
            source: item.file,
            error: error instanceof Error ? error.message : "Conversion failed."
          });
        }

        this.renderResults();
      }
    } finally {
      this.activeJobId = null;
      convertButton.disabled = false;
      cancelButton.classList.add("hidden");
      if (this.batchCancelled) element("job-stage").textContent = "Batch cancelled";
      this.renderResults();
    }
  }

  private renderResults(): void {
    const list = element("results-list");
    list.replaceChildren();

    let successful = 0;
    for (const result of this.resultEntries) {
      const row = document.createElement("div");
      row.className = "result-row";

      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = result.output?.fileName ?? result.source.name;
      const details = document.createElement("span");

      if (result.output) {
        successful += 1;
        const reduction = result.output.sourceSize > 0
          ? Math.round((1 - result.output.outputSize / result.output.sourceSize) * 100)
          : 0;
        details.textContent = formatBytes(result.output.sourceSize) + " → " + formatBytes(result.output.outputSize)
          + (reduction > 0 ? " · " + reduction + "% smaller" : "");
        info.append(name, details);

        const link = document.createElement("a");
        link.className = "download-link";
        link.href = result.url ?? "#";
        link.download = result.output.fileName;
        link.textContent = "Save";
        row.append(info, link);
      } else {
        details.textContent = result.error ?? "Failed";
        info.append(name, details);
        row.classList.add("failed");
        row.append(info);
      }

      list.append(row);
    }

    element("results-summary").textContent = successful + "/" + this.resultEntries.length + " converted";

    if (this.selection.length === 1 && this.resultEntries[0]?.output && this.resultEntries[0].url) {
      const comparison = element("comparison");
      const originalUrl = URL.createObjectURL(this.selection[0].file);
      this.objectUrls.push(originalUrl);
      element<HTMLImageElement>("original-preview").src = originalUrl;
      element<HTMLImageElement>("converted-preview").src = this.resultEntries[0].url;
      comparison.classList.remove("hidden");
    }
  }

  private async renderCapabilities(profile: CapabilityProfile): Promise<void> {
    const vips = this.engines.get("vips-image")?.isAvailable() ?? false;
    const fallback = this.engines.get("browser-image-fallback")?.isAvailable() ?? false;

    const entries: Array<[string, boolean | string]> = [
      ["Production image engine", vips],
      ["Browser fallback", fallback],
      ["WebAssembly", profile.webAssembly],
      ["WASM SIMD", profile.wasmSIMD],
      ["WASM threads", profile.wasmThreads],
      ["Cross-origin isolated", profile.crossOriginIsolated],
      ["OPFS", profile.opfs],
      ["Workers", profile.workers],
      ["WebCodecs", profile.webCodecs],
      ["Storage quota", formatBytes(profile.storageQuota)],
      ["CPU threads", String(profile.hardwareConcurrency)]
    ];

    const container = element("capabilities");
    container.replaceChildren();
    for (const [label, value] of entries) {
      const card = document.createElement("div");
      card.className = "capability" + (typeof value === "boolean" ? (value ? " ok" : " no") : "");
      const caption = document.createElement("span");
      caption.textContent = label;
      const strong = document.createElement("strong");
      strong.textContent = typeof value === "boolean" ? bool(value) : value;
      card.append(caption, strong);
      container.append(card);
    }

    element("runtime-status").textContent = vips ? "Phase 1 production" : fallback ? "Degraded image mode" : "Image conversion unavailable";
    element("capability-json").textContent = JSON.stringify({ ...profile, imageEngines: { vips, fallback } }, null, 2);
  }
}
