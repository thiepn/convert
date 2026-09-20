import type { CapabilityProfile } from "../core/capabilities/CapabilityProfile";
import { detectCapabilities } from "../core/capabilities/detectCapabilities";
import { EngineRegistry } from "../core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../core/formats/defaultFormats";
import type { FileInspection } from "../core/inspection/inspectFile";
import { inspectFile } from "../core/inspection/inspectFile";
import { JobManager } from "../core/jobs/JobManager";
import { createPhase0Graph } from "../core/planner/ConversionGraph";
import { ConversionPlanner } from "../core/planner/ConversionPlanner";
import { ImageOutputValidator } from "../core/validation/Validator";
import { BrowserImageEngine } from "../engines/browser-image/BrowserImageEngine";

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

export class App {
  private readonly formats = createDefaultFormatRegistry();
  private readonly engines = new EngineRegistry();
  private readonly graph = createPhase0Graph();
  private readonly planner: ConversionPlanner;
  private readonly jobs: JobManager;

  private currentFile: File | null = null;
  private inspection: FileInspection | null = null;
  private downloadUrl: string | null = null;

  constructor() {
    this.engines.register(new BrowserImageEngine());
    this.planner = new ConversionPlanner(this.graph, this.formats, this.engines);
    this.jobs = new JobManager(
      this.formats,
      this.engines,
      this.planner,
      new ImageOutputValidator(this.formats)
    );
  }

  async start(): Promise<void> {
    this.bindFileInput();
    await this.renderCapabilities(await detectCapabilities());
  }

  private bindFileInput() {
    const input = element<HTMLInputElement>("file-input");
    const zone = element<HTMLLabelElement>("drop-zone");

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void this.loadFile(file);
    });

    ["dragenter", "dragover"].forEach(type => {
      zone.addEventListener(type, event => {
        event.preventDefault();
        zone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach(type => {
      zone.addEventListener(type, event => {
        event.preventDefault();
        zone.classList.remove("dragging");
      });
    });
    zone.addEventListener("drop", event => {
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.loadFile(file);
    });

    element<HTMLSelectElement>("target-format").addEventListener("change", () => this.renderRoute());
    element<HTMLButtonElement>("convert-button").addEventListener("click", () => void this.convert());
  }

  private async loadFile(file: File) {
    this.currentFile = file;
    this.inspection = await inspectFile(file, this.formats);

    const panel = element("file-panel");
    panel.classList.remove("hidden");
    element("file-name").textContent = file.name;

    const detected = this.inspection.detection.format;
    element("detection-confidence").textContent = detected
      ? detected.name + " · " + Math.round(this.inspection.detection.confidence * 100) + "%"
      : "Unknown";

    const facts = [
      ["Format", detected?.name ?? "Unknown"],
      ["Size", formatBytes(file.size)],
      ["Dimensions", this.inspection.width && this.inspection.height ? this.inspection.width + " × " + this.inspection.height : "Not probed"],
      ["MIME hint", file.type || "None"]
    ];
    element("file-facts").innerHTML = facts.map(([label, value]) =>
      "<div class=\"fact\"><span>" + label + "</span><strong>" + value + "</strong></div>"
    ).join("");

    this.renderWarnings("inspection-warnings", this.inspection.detection.warnings);

    const target = element<HTMLSelectElement>("target-format");
    target.innerHTML = "";

    if (detected) {
      const targets = this.planner.availableTargets(detected.id);
      targets.forEach(id => {
        const format = this.formats.get(id);
        if (!format) return;
        const option = document.createElement("option");
        option.value = id;
        option.textContent = format.name;
        target.append(option);
      });
    }

    const button = element<HTMLButtonElement>("convert-button");
    button.disabled = !detected || target.options.length === 0;
    this.renderRoute();

    element("download-link").classList.add("hidden");
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = null;
  }

  private renderRoute() {
    const source = this.inspection?.detection.format;
    const targetId = element<HTMLSelectElement>("target-format").value;
    const routeBox = element("route-box");
    if (!source || !targetId) {
      routeBox.textContent = "No local Phase 0 route is available on this runtime.";
      this.renderWarnings("loss-warnings", []);
      return;
    }

    try {
      const route = this.planner.plan(source.id, targetId);
      const target = this.formats.get(targetId);
      routeBox.textContent =
        source.name + " → " + (target?.name ?? targetId)
        + " · " + route.edges.length + " local engine step"
        + (route.edges.length === 1 ? "" : "s")
        + " · no upload";
      this.renderWarnings("loss-warnings", route.warnings.map(warning => warning.message));
    } catch (error) {
      routeBox.textContent = error instanceof Error ? error.message : "No route available.";
      this.renderWarnings("loss-warnings", []);
    }
  }

  private renderWarnings(id: string, warnings: string[]) {
    element(id).innerHTML = warnings.map(warning =>
      "<div class=\"warning\">" + warning.replaceAll("&", "&amp;").replaceAll("<", "&lt;") + "</div>"
    ).join("");
  }

  private async convert() {
    if (!this.currentFile) return;

    const button = element<HTMLButtonElement>("convert-button");
    const targetId = element<HTMLSelectElement>("target-format").value;
    const quality = Number(element<HTMLSelectElement>("quality").value);
    const jobPanel = element("job-panel");
    const download = element<HTMLAnchorElement>("download-link");

    button.disabled = true;
    download.classList.add("hidden");
    jobPanel.classList.remove("hidden");

    try {
      const output = await this.jobs.convert(this.currentFile, targetId, quality, snapshot => {
        element("job-stage").textContent = snapshot.stage;
        element("job-progress").textContent = Math.round(snapshot.progress * 100) + "%";
        element<HTMLElement>("progress-bar").style.width = Math.round(snapshot.progress * 100) + "%";
      });

      if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
      this.downloadUrl = URL.createObjectURL(output.blob);
      download.href = this.downloadUrl;
      download.download = output.fileName;
      download.textContent = "Save " + output.fileName;
      download.classList.remove("hidden");
    } catch (error) {
      this.renderWarnings("loss-warnings", [
        error instanceof Error ? error.message : "Conversion failed."
      ]);
    } finally {
      button.disabled = false;
    }
  }

  private async renderCapabilities(profile: CapabilityProfile) {
    const entries: Array<[string, boolean | string]> = [
      ["WebAssembly", profile.webAssembly],
      ["WASM SIMD", profile.wasmSIMD],
      ["WASM threads", profile.wasmThreads],
      ["Cross-origin isolated", profile.crossOriginIsolated],
      ["OPFS", profile.opfs],
      ["Workers", profile.workers],
      ["OffscreenCanvas", profile.offscreenCanvas],
      ["ImageBitmap", profile.imageBitmap],
      ["WebCodecs", profile.webCodecs],
      ["Direct file save", profile.fileSystemAccess],
      ["Storage quota", formatBytes(profile.storageQuota)],
      ["CPU threads", String(profile.hardwareConcurrency)]
    ];

    element("capabilities").innerHTML = entries.map(([label, value]) => {
      const className = typeof value === "boolean" ? (value ? " ok" : " no") : "";
      const display = typeof value === "boolean" ? bool(value) : value;
      return "<div class=\"capability" + className + "\"><span>" + label + "</span><strong>" + display + "</strong></div>";
    }).join("");

    element("runtime-status").textContent =
      profile.workers && profile.offscreenCanvas && profile.imageBitmap ? "Phase 0 ready" : "Degraded mode";
    element("capability-json").textContent = JSON.stringify(profile, null, 2);
  }
}
