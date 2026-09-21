import { zipSync } from "fflate";
import type { BatchExecutionMode,BatchRunResult,BatchSnapshot } from "../core/batch/types";
import { BatchRunner } from "../core/batch/BatchRunner";
import { buildBatchPipeline,describePipeline } from "../core/batch/pipeline";
import type { CapabilityProfile } from "../core/capabilities/CapabilityProfile";
import { detectCapabilities } from "../core/capabilities/detectCapabilities";
import { EngineRegistry } from "../core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../core/formats/defaultFormats";
import type { DetailedImageInspection, ImageConversionOptions } from "../core/image/types";
import type { DetailedDocumentInspection, DocumentConversionOptions } from "../core/document/types";
import type { ArchiveConversionOptions, DetailedArchiveInspection } from "../core/archive/types";
import type {
  DataConversionOptions,
  DetailedDataInspection,
  DetailedDatabaseInspection,
  DetailedSpreadsheetInspection,
  SpreadsheetConversionOptions
} from "../core/data/types";
import type { FileInspection } from "../core/inspection/inspectFile";
import { inspectFile } from "../core/inspection/inspectFile";
import { JobManager } from "../core/jobs/JobManager";
import { getDeviceProfile } from "../core/performance/DeviceProfile";
import { TempWorkspace } from "../core/storage/TempWorkspace";
import { friendlyIssueText,presentIssue } from "../core/ux/errors";
import type { ConversionOutput } from "../core/jobs/types";
import type { DetailedMediaInspection, MediaConversionOptions } from "../core/media/types";
import type { DetailedPdfInspection, PdfCreateImage, PdfOcrOptions, PdfSplitRange } from "../core/pdf/types";
import { createConversionGraph } from "../core/planner/ConversionGraph";
import { ConversionPlanner } from "../core/planner/ConversionPlanner";
import {
  ImageOutputValidator,
  MediaOutputValidator,
  PdfOutputValidator,
  DocumentOutputValidator,
  ArchiveOutputValidator,
  SpreadsheetOutputValidator,
  DataOutputValidator,
  DatabaseOutputValidator,
  SpecialistOutputValidator,
  UniversalOutputValidator
} from "../core/validation/Validator";
import { BrowserImageEngine } from "../engines/browser-image/BrowserImageEngine";
import { VipsImageEngine } from "../engines/image/VipsImageEngine";
import { MediaEngine } from "../engines/media/MediaEngine";
import { PdfEngine } from "../engines/pdf/PdfEngine";
import { DocumentInspector } from "../engines/document/DocumentInspector";
import { PandocDocumentEngine } from "../engines/document/PandocDocumentEngine";
import { OfficeDocumentEngine } from "../engines/document/OfficeDocumentEngine";
import { PdfReconstructionEngine } from "../engines/document/PdfReconstructionEngine";
import { ArchiveEngine } from "../engines/archive/ArchiveEngine";
import { SpreadsheetEngine } from "../engines/data/SpreadsheetEngine";
import { DuckDbDataEngine } from "../engines/data/DuckDbDataEngine";
import { SqliteEngine } from "../engines/data/SqliteEngine";
import { SubtitleEngine } from "../engines/specialist/SubtitleEngine";
import { MeshEngine } from "../engines/specialist/MeshEngine";
import { RawPreviewEngine } from "../engines/specialist/RawPreviewEngine";
import { ScientificMetadataEngine } from "../engines/specialist/ScientificMetadataEngine";
import { Fb2Engine } from "../engines/specialist/Fb2Engine";
import { LayeredImageEngine } from "../engines/specialist/LayeredImageEngine";
import { FontEngine } from "../engines/specialist/FontEngine";
import { LegacyMediaEngine } from "../engines/specialist/LegacyMediaEngine";

type SelectionKind="image"|"media"|"pdf"|"document"|"archive"|"archive-build"|"spreadsheet"|"data"|"database"|"specialist"|"batch"|null;
type ResultLease={url:string;release?:()=>Promise<void>};

function element<T extends HTMLElement>(id:string):T {
  const value=document.getElementById(id);
  if(!value) throw new Error("Missing UI element: "+id);
  return value as T;
}

function formatBytes(bytes:number|null):string {
  if(bytes===null) return "Unknown";
  if(bytes<1024) return bytes+" B";
  const units=["KB","MB","GB","TB"];
  let value=bytes/1024,unit=0;
  while(value>=1024&&unit<units.length-1){value/=1024;unit++}
  return value.toFixed(value>=100?0:value>=10?1:2)+" "+units[unit];
}

function formatDuration(seconds:number|null):string {
  if(seconds==null||!Number.isFinite(seconds)) return "Unknown";
  const total=Math.max(0,Math.round(seconds));
  const h=Math.floor(total/3600);
  const m=Math.floor((total%3600)/60);
  const s=total%60;
  return h>0
    ? [h,m,s].map((v,i)=>i===0?String(v):String(v).padStart(2,"0")).join(":")
    : [m,s].map(v=>String(v).padStart(2,"0")).join(":");
}

function bool(value:boolean):string { return value?"Available":"Unavailable"; }

function numeric(id:string,scale=1):number|undefined {
  const value=Number(element<HTMLInputElement>(id).value);
  return Number.isFinite(value)&&value>0?value*scale:undefined;
}

function stem(name:string):string {
  const index=name.lastIndexOf(".");
  return index>0?name.slice(0,index):name;
}

function sanitizeFilename(name:string):string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_").replace(/\.+$/,"").slice(0,180)||"output";
}

export class App {
  private readonly deviceProfile=getDeviceProfile();
  private readonly formats=createDefaultFormatRegistry();
  private readonly engines=new EngineRegistry();
  private readonly graph=createConversionGraph();
  private readonly imageEngine=new VipsImageEngine();
  private readonly mediaEngine=new MediaEngine();
  private readonly pdfEngine=new PdfEngine();
  private readonly documentInspector=new DocumentInspector();
  private readonly pandocDocumentEngine=new PandocDocumentEngine();
  private readonly officeDocumentEngine=new OfficeDocumentEngine();
  private readonly pdfReconstructionEngine=new PdfReconstructionEngine(this.pdfEngine,this.pandocDocumentEngine);
  private readonly archiveEngine=new ArchiveEngine();
  private readonly spreadsheetEngine=new SpreadsheetEngine();
  private readonly duckDbDataEngine=new DuckDbDataEngine();
  private readonly sqliteEngine=new SqliteEngine();
  private readonly subtitleEngine=new SubtitleEngine();
  private readonly meshEngine=new MeshEngine();
  private readonly rawPreviewEngine=new RawPreviewEngine();
  private readonly scientificMetadataEngine=new ScientificMetadataEngine();
  private readonly fb2Engine=new Fb2Engine();
  private readonly layeredImageEngine=new LayeredImageEngine();
  private readonly fontEngine=new FontEngine();
  private readonly legacyMediaEngine=new LegacyMediaEngine();
  private readonly planner:ConversionPlanner;
  private readonly jobs:JobManager;
  private readonly batchRunner:BatchRunner;

  private files:File[]=[];
  private inspections:FileInspection[]=[];
  private imageDetail:DetailedImageInspection|null=null;
  private mediaDetail:DetailedMediaInspection|null=null;
  private pdfDetail:DetailedPdfInspection|null=null;
  private documentDetail:DetailedDocumentInspection|null=null;
  private archiveDetail:DetailedArchiveInspection|null=null;
  private spreadsheetDetail:DetailedSpreadsheetInspection|null=null;
  private dataDetail:DetailedDataInspection|null=null;
  private databaseDetail:DetailedDatabaseInspection|null=null;
  private archiveAbort:AbortController|null=null;
  private kind:SelectionKind=null;
  private leases:ResultLease[]=[];
  private routeRevision=0;
  private selectionRevision=0;
  private batchPackageResults=true;

  constructor(){
    this.engines.register(this.imageEngine);
    this.engines.register(new BrowserImageEngine());
    this.engines.register(this.mediaEngine);
    this.engines.register(this.pdfEngine);
    this.engines.register(this.pandocDocumentEngine);
    this.engines.register(this.officeDocumentEngine);
    this.engines.register(this.pdfReconstructionEngine);
    this.engines.register(this.archiveEngine);
    this.engines.register(this.spreadsheetEngine);
    this.engines.register(this.duckDbDataEngine);
    this.engines.register(this.sqliteEngine);
    this.engines.register(this.subtitleEngine);
    this.engines.register(this.meshEngine);
    this.engines.register(this.rawPreviewEngine);
    this.engines.register(this.scientificMetadataEngine);
    this.engines.register(this.fb2Engine);
    this.engines.register(this.layeredImageEngine);
    this.engines.register(this.fontEngine);
    this.engines.register(this.legacyMediaEngine);
    this.planner=new ConversionPlanner(this.graph,this.formats,this.engines);

    const validator=new UniversalOutputValidator(
      this.formats,
      new ImageOutputValidator(this.formats,async(blob,formatId)=>{
        const detail=await this.imageEngine.inspect(blob,formatId);
        return {width:detail.width,height:detail.height};
      }),
      new MediaOutputValidator(this.formats,blob=>this.mediaEngine.inspect(blob)),
      new PdfOutputValidator(this.formats,(blob,password)=>this.pdfEngine.inspect(blob,password)),
      new DocumentOutputValidator(this.formats,(blob,formatId)=>this.documentInspector.inspect(blob,formatId)),
      new ArchiveOutputValidator(this.formats,(blob,formatId,password)=>this.archiveEngine.inspect(blob,formatId,password)),
      new SpreadsheetOutputValidator(this.formats,(blob,formatId)=>this.spreadsheetEngine.inspect(blob,formatId)),
      new DataOutputValidator(
        this.formats,
        (blob,formatId,options)=>this.duckDbDataEngine.inspect(blob,formatId,options as Partial<DataConversionOptions>)
      ),
      new DatabaseOutputValidator(this.formats,blob=>this.sqliteEngine.inspect(blob)),
      new SpecialistOutputValidator(this.formats)
    );
    this.jobs=new JobManager(this.formats,this.engines,this.planner,validator);
    this.batchRunner=new BatchRunner(this.formats,this.planner,this.jobs);
  }

  async start():Promise<void>{
    this.bindInputs();
    await TempWorkspace.cleanupOrphanedJobs();
    await this.engines.prepareAll();
    await this.renderCapabilities(await detectCapabilities());
    this.bindFileLaunch();
  }

  private bindInputs(){
    const input=element<HTMLInputElement>("file-input");
    const zone=element<HTMLLabelElement>("drop-zone");

    input.addEventListener("change",()=>{
      if(input.files?.length) void this.loadFiles([...input.files]);
    });
    zone.addEventListener("keydown",event=>{
      if(event.key==="Enter"||event.key===" "){
        event.preventDefault();
        input.click();
      }
    });

    ["dragenter","dragover"].forEach(type=>zone.addEventListener(type,event=>{
      event.preventDefault();zone.classList.add("dragging");
    }));
    ["dragleave","drop"].forEach(type=>zone.addEventListener(type,event=>{
      event.preventDefault();zone.classList.remove("dragging");
    }));
    zone.addEventListener("drop",event=>{
      const files=[...(event.dataTransfer?.files??[])];
      if(files.length) void this.loadFiles(files);
    });

    const routeControls=[
      "target-format","metadata-policy","image-quality","max-dimension","image-target-size",
      "background-color","lossless","track-policy","media-height","media-fps","video-codec",
      "audio-codec","video-bitrate","audio-bitrate","media-target-size","trim-start","trim-end",
      "hardware-acceleration","pdf-operation","pdf-pages","pdf-split-groups","pdf-order",
      "pdf-image-format","pdf-image-quality","pdf-dpi","pdf-ocr-language","pdf-ocr-pages",
      "pdf-rotation","document-route","document-track-changes","document-assets",
      "document-standalone","document-toc","archive-operation","archive-compression-level",
      "archive-preserve-paths","archive-input-password","archive-output-password",
      "data-route","data-sheet-policy","data-sheet-select","data-formula-mode",
      "data-table-select","data-delimiter","data-header","data-query",
      "batch-execution","batch-name-template","batch-package-results"
    ];
    for(const id of routeControls){
      element(id).addEventListener("change",()=>{
        if(id==="pdf-operation") this.updatePdfOptionVisibility();
        if(id==="archive-operation") this.updateArchiveOptionVisibility();
        if(id==="data-sheet-policy") this.updateDataOptionVisibility();
        if(id==="data-table-select") void this.refreshDatabasePreview();
        this.updateBatchControls();
        void this.renderRoute();
      });
    }

    element<HTMLButtonElement>("pdf-reinspect-button").addEventListener("click",()=>void this.refreshPdfInspection());
    element<HTMLButtonElement>("archive-pack-selection-button").addEventListener("click",()=>void this.switchToArchiveBuild());
    element<HTMLButtonElement>("archive-reinspect-button").addEventListener("click",()=>void this.refreshArchiveInspection());
    element<HTMLButtonElement>("archive-select-all").addEventListener("click",()=>this.setArchiveSelection(true));
    element<HTMLButtonElement>("archive-select-none").addEventListener("click",()=>this.setArchiveSelection(false));
    element<HTMLButtonElement>("convert-button").addEventListener("click",()=>void this.convertAll());
    element<HTMLButtonElement>("batch-resume-button").addEventListener("click",()=>void this.resumeBatch());
    element<HTMLButtonElement>("start-over-button").addEventListener("click",()=>void this.resetSelection());
    element<HTMLButtonElement>("cancel-button").addEventListener("click",()=>{
      this.batchRunner.cancel();
      this.jobs.cancelAll();
      this.pdfEngine.cancelActive();
      this.archiveAbort?.abort();
    });
  }

  private bindFileLaunch(){
    const launchQueue=(globalThis as any).launchQueue;
    if(!launchQueue?.setConsumer) return;
    launchQueue.setConsumer(async(params:any)=>{
      const handles=Array.isArray(params?.files)?params.files:[];
      const files:File[]=[];
      for(const handle of handles){
        try{
          const file=await handle.getFile?.();
          if(file instanceof File) files.push(file);
        }catch{}
      }
      if(files.length) await this.loadFiles(files);
    });
  }

  private async resetSelection(){
    this.batchRunner.cancel();
    this.jobs.cancelAll();
    this.pdfEngine.cancelActive();
    this.archiveAbort?.abort();

    // Invalidate and clear visible selection state synchronously. Cleanup may
    // await active workers/workspaces; it must never erase a new selection
    // the user makes immediately after pressing Start over.
    this.routeRevision++;
    this.selectionRevision++;
    this.files=[];
    this.inspections=[];
    this.imageDetail=null;
    this.mediaDetail=null;
    this.pdfDetail=null;
    this.documentDetail=null;
    this.archiveDetail=null;
    this.spreadsheetDetail=null;
    this.dataDetail=null;
    this.databaseDetail=null;
    this.kind=null;

    const input=element<HTMLInputElement>("file-input");
    input.value="";
    element("file-panel").classList.add("hidden");
    element("job-panel").classList.add("hidden");
    element("results").classList.add("hidden");
    element("results").replaceChildren();
    element("inspection-warnings").replaceChildren();
    element("loss-warnings").replaceChildren();
    element<HTMLElement>("progress-bar").style.width="0%";
    const progress=element("job-progress-track");
    progress.setAttribute("aria-valuenow","0");
    progress.setAttribute("aria-valuetext","Ready");
    element("job-progress").textContent="0%";
    element("job-stage").textContent="Ready";
    element<HTMLButtonElement>("convert-button").disabled=false;
    element<HTMLButtonElement>("cancel-button").classList.add("hidden");
    element<HTMLLabelElement>("drop-zone").focus();

    await Promise.all([
      this.batchRunner.releaseSession(),
      this.releaseResults()
    ]);
  }

  private getKind(inspection:FileInspection):SelectionKind {
    const category=inspection.detection.format?.category;
    if(category==="image") return "image";
    if(category==="audio"||category==="video") return "media";
    if(category==="pdf") return "pdf";
    if(category==="document") return "document";
    if(category==="archive") return "archive";
    if(category==="spreadsheet") return "spreadsheet";
    if(category==="data") return "data";
    if(category==="database") return "database";
    if(["layered","raw","font","subtitle","model","vector","scientific","ebook-legacy"].includes(category??"")) return "specialist";
    return null;
  }

  private async loadFiles(files:File[]){
    await this.batchRunner.releaseSession();
    await this.releaseResults();
    const selectionRevision=++this.selectionRevision;
    this.files=files;
    this.imageDetail=null;
    this.mediaDetail=null;
    this.pdfDetail=null;
    this.documentDetail=null;
    this.archiveDetail=null;
    this.spreadsheetDetail=null;
    this.dataDetail=null;
    this.databaseDetail=null;
    this.inspections=await Promise.all(files.map(file=>inspectFile(file,this.formats)));
    if(selectionRevision!==this.selectionRevision) return;

    const kinds=new Set(this.inspections.map(i=>this.getKind(i)).filter(Boolean) as Exclude<SelectionKind,null>[]);
    const allKnown=this.inspections.every(item=>Boolean(item.detection.format));
    this.kind=kinds.size===1&&allKnown
      ? [...kinds][0]
      : allKnown&&files.length>1
        ? "batch"
        : files.length
          ? "archive-build"
          : null;

    element("file-panel").classList.remove("hidden");
    element("results").classList.add("hidden");
    element("results").replaceChildren();
    element("track-list").classList.add("hidden");
    element("track-list").replaceChildren();

    const known=this.inspections.filter(item=>item.detection.format);
    element("file-name").textContent=files.length===1?files[0].name:files.length+" files";
    element("detection-confidence").textContent=known.length===files.length
      ? files.length===1
        ? known[0].detection.format!.name+" · "+Math.round(known[0].detection.confidence*100)+"%"
        : known.length+"/"+files.length+" recognized"
      : known.length+"/"+files.length+" recognized";

    const warnings=this.inspections.flatMap(item=>item.detection.warnings.map(w=>item.name+": "+w));
    const largestFile=files.reduce((max,file)=>Math.max(max,file.size),0);
    const largeThreshold=Math.min(256*1024*1024,Math.floor(this.deviceProfile.workingSetBudgetBytes*.35));
    if(largestFile>=largeThreshold){
      warnings.push(
        this.deviceProfile.opfs
          ?"Large-file mode: Phase 9 will use route-specific memory preflight and OPFS staging/streaming where supported."
          :"Large file selected, but OPFS is unavailable. Buffered-output routes may be rejected earlier to protect this tab."
      );
    }
    if(this.kind==="archive-build"){
      warnings.push("Unknown or otherwise unsupported selections can still be packed into a new local archive.");
    }else{
      if(known.length!==files.length) warnings.push("At least one file could not be identified.");
      if(this.kind==="batch") warnings.push("Mixed recognized formats are handled as one batch when they share a safe local target.");
      if(kinds.size===0) warnings.push("This format has no active local conversion workflow.");
      if(this.kind==="specialist"&&known.length===files.length){
        const recognitionOnly=known
          .map(item=>item.detection.format!)
          .filter(format=>this.planner.availableTargets(format.id).length===0);
        if(recognitionOnly.length){
          warnings.push(
            "Recognized format only: "+[...new Set(recognitionOnly.map(format=>format.name))].join(", ")
            +". Phase 7 intentionally exposes no conversion route rather than using a lossy or unverified decoder."
          );
        }
      }
    }

    this.renderSelectionControls();
    if(this.kind==="archive-build"){
      element<HTMLSelectElement>("archive-operation").value="create";
    }else if(this.kind==="archive"){
      element<HTMLSelectElement>("archive-operation").value="repack";
    }

    // Show planner-derived targets immediately. Detailed inspection can lazy-load
    // large WASM engines, so target discovery must not appear broken while that
    // richer inspection is still warming up.
    this.populateTargets();

    if(files.length===1&&known.length===1){
      try{
        if(this.kind==="image"&&this.imageEngine.isAvailable()){
          // Shallow inspectFile() already gives safe signature/dimension facts
          // for common images. Keep libvips lazy so the first conversion is
          // the only cold-WASM consumer instead of racing a background probe.
        }else if(this.kind==="media"&&this.mediaEngine.isAvailable()){
          this.mediaDetail=await this.mediaEngine.inspect(files[0]);
          warnings.push(...this.mediaDetail.warnings);
        }else if(this.kind==="pdf"&&this.pdfEngine.isAvailable()){
          const password=this.readPdfPassword();
          this.pdfDetail=await this.pdfEngine.inspect(files[0],password);
          warnings.push(...this.pdfDetail.warnings);
        }else if(this.kind==="document"){
          this.documentDetail=await this.documentInspector.inspect(files[0],known[0].detection.format!.id);
          warnings.push(...this.documentDetail.warnings);
        }else if(this.kind==="archive"){
          this.archiveDetail=await this.archiveEngine.inspect(
            files[0],
            known[0].detection.format!.id,
            this.readArchiveOptions().inputPassword
          );
          warnings.push(...this.archiveDetail.warnings);
        }else if(this.kind==="spreadsheet"){
          this.spreadsheetDetail=await this.spreadsheetEngine.inspect(files[0],known[0].detection.format!.id);
          warnings.push(...this.spreadsheetDetail.warnings);
        }else if(this.kind==="data"){
          this.dataDetail=await this.duckDbDataEngine.inspect(
            files[0],
            known[0].detection.format!.id,
            this.readDataOptions()
          );
          warnings.push(...this.dataDetail.warnings);
        }else if(this.kind==="database"){
          this.databaseDetail=await this.sqliteEngine.inspect(files[0]);
          warnings.push(...this.databaseDetail.warnings);
        }
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        if(this.kind==="pdf"&&/PDF_PASSWORD_REQUIRED|PDF_PASSWORD_INCORRECT/.test(message)){
          warnings.push("This PDF is password-protected. Enter the password and choose Re-inspect.");
        }else if(this.kind==="archive"&&/ARCHIVE_PASSWORD_REQUIRED/.test(message)){
          warnings.push("This archive requires a password before its entries can be listed.");
        }else{
          warnings.push("Detailed inspection unavailable: "+message);
        }
      }
    }

    if(selectionRevision!==this.selectionRevision) return;

    this.populateDataSelectors();
    if(this.kind==="database"&&this.databaseDetail?.tables.length){
      const selected=this.databaseDetail.tables[0].name;
      element<HTMLSelectElement>("data-table-select").value=selected;
      this.dataDetail=await this.sqliteEngine.preview(this.files[0],selected).catch(()=>null);
    }

    this.renderFacts();
    this.renderTracks();
    this.renderArchiveEntries();
    this.renderDataPreview();
    this.renderWarnings("inspection-warnings",warnings);
    this.updatePdfOptionVisibility();
    this.updateArchiveOptionVisibility();
    this.updateDataOptionVisibility();
    this.updateBatchControls();
    await this.renderRoute();
  }

  private async refreshPdfInspection(){
    if(this.kind!=="pdf"||this.files.length!==1) return;
    const warnings:string[]=[];
    try{
      this.pdfDetail=await this.pdfEngine.inspect(this.files[0],this.readPdfPassword());
      warnings.push(...this.pdfDetail.warnings);
    }catch(error){
      this.pdfDetail=null;
      warnings.push(error instanceof Error?error.message:String(error));
    }
    this.renderFacts();
    this.renderWarnings("inspection-warnings",warnings);
    await this.renderRoute();
  }

  private isLegacyMediaSelection():boolean {
    const legacy=new Set(["avi","flv","asf"]);
    return this.kind==="media"
      &&this.inspections.length>0
      &&this.inspections.every(item=>legacy.has(item.detection.format?.id??""));
  }

  private async switchToArchiveBuild(){
    if(!this.files.length) return;
    this.kind="archive-build";
    this.archiveDetail=null;
    element<HTMLSelectElement>("archive-operation").value="create";
    this.renderSelectionControls();
    this.renderFacts();
    this.renderArchiveEntries();
    this.populateTargets();
    this.updateArchiveOptionVisibility();
    this.updateBatchControls();
    await this.renderRoute();
  }

  private async refreshArchiveInspection(){
    if(this.kind!=="archive"||this.files.length!==1) return;
    const warnings:string[]=[];
    try{
      const formatId=this.inspections[0]?.detection.format?.id;
      if(!formatId) throw new Error("ARCHIVE_FORMAT_UNKNOWN: Archive format is unknown.");
      this.archiveDetail=await this.archiveEngine.inspect(
        this.files[0],
        formatId,
        this.readArchiveOptions().inputPassword
      );
      warnings.push(...this.archiveDetail.warnings);
    }catch(error){
      this.archiveDetail=null;
      warnings.push(error instanceof Error?error.message:String(error));
    }
    this.renderFacts();
    this.renderArchiveEntries();
    this.renderWarnings("inspection-warnings",warnings);
    await this.renderRoute();
  }

  private setArchiveSelection(selected:boolean){
    document.querySelectorAll<HTMLInputElement>("#archive-entry-list input[type=checkbox]")
      .forEach(input=>{input.checked=selected;});
    void this.renderRoute();
  }

  private renderSelectionControls(){
    const legacyMedia=this.isLegacyMediaSelection();
    element("common-controls").classList.toggle("hidden",this.kind==="pdf");
    element("image-controls").classList.toggle("hidden",this.kind!=="image");
    element("media-controls").classList.toggle("hidden",this.kind!=="media"||legacyMedia);
    element("document-controls").classList.toggle("hidden",this.kind!=="document");
    element("archive-controls").classList.toggle("hidden",this.kind!=="archive"&&this.kind!=="archive-build");
    element("data-controls").classList.toggle("hidden",this.kind!=="spreadsheet"&&this.kind!=="data"&&this.kind!=="database");
    element("batch-controls").classList.toggle("hidden",this.files.length<2);
    element("metadata-control").classList.toggle(
      "hidden",
      this.kind==="document"||this.kind==="archive"||this.kind==="archive-build"
        ||this.kind==="spreadsheet"||this.kind==="data"||this.kind==="database"||this.kind==="specialist"||this.kind==="batch"||legacyMedia
    );
    element("pdf-controls").classList.toggle("hidden",this.kind!=="pdf");
    element("archive-pack-selection-button").classList.toggle(
      "hidden",
      !this.files.length||this.kind==="archive"||this.kind==="archive-build"||this.kind==="pdf"
    );
  }

  private renderFacts(){
    const total=this.files.reduce((sum,file)=>sum+file.size,0);
    const first=this.inspections[0];
    let facts:Array<[string,string]>;

    if(this.files.length>1){
      const formats=[...new Set(this.inspections.map(i=>i.detection.format?.name??"Unknown"))];
      facts=[
        ["Files",String(this.files.length)],
        ["Total size",formatBytes(total)],
        ["Formats",formats.join(", ")],
        ["Family",this.kind??"Mixed / unsupported"]
      ];
    }else if(this.kind==="image"){
      facts=[
        ["Format",first?.detection.format?.name??"Unknown"],
        ["Size",formatBytes(total)],
        ["Dimensions",this.imageDetail
          ? this.imageDetail.width+" × "+this.imageDetail.height
          : first?.width&&first?.height?first.width+" × "+first.height:"—"],
        ["Frames / pages",this.imageDetail?String(this.imageDetail.frames):"—"],
        ["Alpha",this.imageDetail?(this.imageDetail.alpha?"Yes":"No"):"—"],
        ["Bit depth",this.imageDetail?.bitDepth?this.imageDetail.bitDepth+" bit":"—"],
        ["Color",this.imageDetail?.colorSpace??"—"],
        ["Decoded estimate",this.imageDetail?formatBytes(this.imageDetail.estimatedDecodedBytes):"—"]
      ];
    }else if(this.kind==="media"){
      const primaryVideo=this.mediaDetail?.tracks.find(t=>t.type==="video");
      const primaryAudio=this.mediaDetail?.tracks.find(t=>t.type==="audio");
      facts=[
        ["Container",this.mediaDetail?.container??first?.detection.format?.name??"Unknown"],
        ["Size",formatBytes(total)],
        ["Duration",formatDuration(this.mediaDetail?.duration??null)],
        ["Tracks",this.mediaDetail?String(this.mediaDetail.tracks.length):"—"],
        ["Video",primaryVideo
          ? (primaryVideo.codec??"unknown")+" · "+(primaryVideo.displayWidth??primaryVideo.width??"?")+"×"+(primaryVideo.displayHeight??primaryVideo.height??"?")
          : "None"],
        ["Audio",primaryAudio
          ? (primaryAudio.codec??"unknown")+" · "+(primaryAudio.channels??"?")+" ch · "+(primaryAudio.sampleRate??"?")+" Hz"
          : "None"],
        ["Subtitles",String(this.mediaDetail?.subtitleTracks??0)],
        ["MIME",this.mediaDetail?.mimeType??first?.mime??"—"]
      ];
    }else if(this.kind==="document"){
      facts=[
        ["Format",first?.detection.format?.name??"Unknown"],
        ["Size",formatBytes(total)],
        ["Family",this.documentDetail?.family??"—"],
        ["Paragraphs",this.documentDetail?.paragraphs!=null?String(this.documentDetail.paragraphs):"—"],
        ["Headings",this.documentDetail?.headings!=null?String(this.documentDetail.headings):"—"],
        ["Tables",this.documentDetail?.tables!=null?String(this.documentDetail.tables):"—"],
        ["Images",this.documentDetail?.images!=null?String(this.documentDetail.images):"—"],
        ["Tracked changes",this.documentDetail?.trackedChanges!=null?String(this.documentDetail.trackedChanges):"—"],
        ["Comments",this.documentDetail?.comments!=null?String(this.documentDetail.comments):"—"],
        ["Slides",this.documentDetail?.slides!=null?String(this.documentDetail.slides):"—"],
        ["Macros",this.documentDetail?(this.documentDetail.macros?"Detected / possible":"None detected"):"—"],
        ["Expanded size",this.documentDetail?.expandedSize!=null?formatBytes(this.documentDetail.expandedSize):"—"]
      ];
    }else if(this.kind==="spreadsheet"){
      const firstSheet=this.spreadsheetDetail?.sheets[0];
      const totalFormulas=(this.spreadsheetDetail?.sheets??[]).reduce((sum,sheet)=>sum+sheet.formulas,0);
      const totalCells=(this.spreadsheetDetail?.sheets??[]).reduce((sum,sheet)=>sum+sheet.cells,0);
      facts=[
        ["Format",first?.detection.format?.name??"Spreadsheet"],
        ["Size",formatBytes(total)],
        ["Sheets",this.spreadsheetDetail?String(this.spreadsheetDetail.sheets.length):"—"],
        ["Cells",this.spreadsheetDetail?totalCells.toLocaleString():"—"],
        ["Formulas",this.spreadsheetDetail?totalFormulas.toLocaleString():"—"],
        ["First sheet",firstSheet?.name??"—"],
        ["Used range",firstSheet?.range??"—"],
        ["Macros",this.spreadsheetDetail?(this.spreadsheetDetail.macros?"Detected":"None detected"):"—"]
      ];
    }else if(this.kind==="data"){
      facts=[
        ["Format",first?.detection.format?.name??"Data"],
        ["Size",formatBytes(total)],
        ["Rows",this.dataDetail?.rows==null?"—":this.dataDetail.rows.toLocaleString()],
        ["Columns",this.dataDetail?String(this.dataDetail.columns.length):"—"],
        ["Engine",this.dataDetail?.engine??"—"],
        ["Preview rows",this.dataDetail?String(this.dataDetail.preview.length):"—"]
      ];
    }else if(this.kind==="database"){
      facts=[
        ["Format","SQLite"],
        ["Size",formatBytes(total)],
        ["Tables / views",this.databaseDetail?String(this.databaseDetail.tables.length):"—"],
        ["User version",this.databaseDetail?.userVersion==null?"—":String(this.databaseDetail.userVersion)],
        ["Application ID",this.databaseDetail?.applicationId==null?"—":String(this.databaseDetail.applicationId)],
        ["Selected rows",this.dataDetail?.rows==null?"—":this.dataDetail.rows.toLocaleString()],
        ["Selected columns",this.dataDetail?String(this.dataDetail.columns.length):"—"],
        ["Engine",this.databaseDetail?.engine??"—"]
      ];
    }else if(this.kind==="archive"){
      facts=[
        ["Format",first?.detection.format?.name??"Archive"],
        ["Compressed",formatBytes(total)],
        ["Files",this.archiveDetail?String(this.archiveDetail.files):"—"],
        ["Directories",this.archiveDetail?String(this.archiveDetail.directories):"—"],
        ["Expanded",this.archiveDetail?formatBytes(this.archiveDetail.expandedSize):"—"],
        ["Ratio",this.archiveDetail?this.archiveDetail.compressionRatio.toFixed(1)+"×":"—"],
        ["Encrypted",this.archiveDetail?.encrypted==null?"Unknown":this.archiveDetail.encrypted?"Yes":"No"],
        ["Engine",this.archiveDetail?.engine??"—"]
      ];
    }else if(this.kind==="archive-build"){
      facts=[
        ["Files",String(this.files.length)],
        ["Total size",formatBytes(total)],
        ["Operation","Create new archive"],
        ["Paths","Local filenames only"]
      ];
    }else if(this.kind==="pdf"){
      facts=[
        ["Format","PDF"],
        ["Size",formatBytes(total)],
        ["Pages",this.pdfDetail?String(this.pdfDetail.pages):"Locked / not inspected"],
        ["Content",this.pdfDetail
          ? this.pdfDetail.mixed?"Mixed text + scans":this.pdfDetail.scannedPages===this.pdfDetail.pages?"Image / scanned":"Searchable text"
          :"—"],
        ["Text pages",this.pdfDetail?String(this.pdfDetail.textPages):"—"],
        ["Scan pages",this.pdfDetail?String(this.pdfDetail.scannedPages):"—"],
        ["Forms",this.pdfDetail?String(this.pdfDetail.forms):"—"],
        ["Annotations",this.pdfDetail?String(this.pdfDetail.annotations):"—"],
        ["Attachments",this.pdfDetail?String(this.pdfDetail.attachments):"—"],
        ["Bookmarks",this.pdfDetail?String(this.pdfDetail.outlineItems):"—"],
        ["Signatures",this.pdfDetail?String(this.pdfDetail.signatures):"—"],
        ["Producer",this.pdfDetail?.producer??"—"]
      ];
    }else if(this.kind==="specialist"){
      const sourceId=first?.detection.format?.id;
      const targets=sourceId?this.planner.availableTargets(sourceId):[];
      facts=[
        ["Format",first?.detection.format?.name??"Unknown"],
        ["Size",formatBytes(total)],
        ["Family",first?.detection.format?.category??"Specialist"],
        ["Status",targets.length?targets.length+" local target"+(targets.length===1?"":"s"):"Recognition only"],
        ["Safety","Local · guarded parser"]
      ];
    }else{
      facts=[
        ["Format",first?.detection.format?.name??"Unknown"],
        ["Size",formatBytes(total)],
        ["Status","No active workflow"],
        ["Category",first?.detection.format?.category??"Unknown"]
      ];
    }

    const container=element("file-facts");
    container.replaceChildren(...facts.map(([label,value])=>{
      const node=document.createElement("div");node.className="fact";
      const caption=document.createElement("span");caption.textContent=label;
      const strong=document.createElement("strong");strong.textContent=value;
      node.append(caption,strong);return node;
    }));
  }

  private renderTracks(){
    const container=element("track-list");
    if(!this.mediaDetail||!this.mediaDetail.tracks.length){
      container.classList.add("hidden");return;
    }
    container.classList.remove("hidden");container.replaceChildren();
    for(const track of this.mediaDetail.tracks){
      const row=document.createElement("div");row.className="track-row";
      const type=document.createElement("strong");type.textContent=track.type.toUpperCase()+" "+track.number;
      const info=document.createElement("span");
      info.textContent=[
        track.codecParameters??track.codec??"unknown codec",
        track.language!=="und"?track.language:null,
        track.name,
        track.bitrate?Math.round(track.bitrate/1000)+" kbps":null,
        track.type==="audio"&&track.channels?track.channels+" ch":null
      ].filter(Boolean).join(" · ");
      row.append(type,info);container.append(row);
    }
  }

  private renderArchiveEntries(){
    const container=element("archive-entry-list");
    const summary=element("archive-entry-summary");
    const note=element("archive-entry-note");

    if(this.kind!=="archive"||!this.archiveDetail){
      container.replaceChildren();
      container.classList.add("hidden");
      summary.textContent=this.kind==="archive-build"?"Create a new archive":"No archive inspected";
      note.textContent="";
      return;
    }

    const entries=this.archiveDetail.entries.filter(entry=>!entry.directory);
    const renderLimit=this.deviceProfile.mobileLike
      ?(this.deviceProfile.tier==="constrained"?80:120)
      :500;
    const shown=entries.slice(0,renderLimit);
    container.replaceChildren();
    container.classList.toggle("hidden",shown.length===0);

    for(const entry of shown){
      const row=document.createElement("label");
      row.className="archive-entry-row";

      const checkbox=document.createElement("input");
      checkbox.type="checkbox";
      checkbox.value=entry.path;
      checkbox.addEventListener("change",()=>void this.renderRoute());

      const meta=document.createElement("span");
      meta.className="archive-entry-meta";
      const name=document.createElement("strong");
      name.textContent=entry.path;
      const detail=document.createElement("small");
      detail.textContent=formatBytes(entry.size)
        +(entry.encrypted?" · encrypted":"")
        +(entry.compressedSize!=null?" · "+formatBytes(entry.compressedSize)+" compressed":"");
      meta.append(name,detail);
      row.append(checkbox,meta);
      container.append(row);
    }

    summary.textContent=this.archiveDetail.files+" file(s) · "+formatBytes(this.archiveDetail.expandedSize)+" expanded";
    note.textContent=entries.length>shown.length
      ?"Showing the first "+shown.length+" entries. Use Extract all for the entire archive."
      :"";
  }

  private populateDataSelectors(){
    const sheetSelect=element<HTMLSelectElement>("data-sheet-select");
    sheetSelect.replaceChildren();
    for(const sheet of this.spreadsheetDetail?.sheets??[]){
      const option=document.createElement("option");
      option.value=sheet.name;
      option.textContent=sheet.name+(sheet.hidden?" · hidden":"");
      sheetSelect.append(option);
    }

    const tableSelect=element<HTMLSelectElement>("data-table-select");
    const previous=tableSelect.value;
    tableSelect.replaceChildren();
    for(const table of this.databaseDetail?.tables??[]){
      const option=document.createElement("option");
      option.value=table.name;
      option.textContent=table.name+(table.type==="view"?" · view":"");
      tableSelect.append(option);
    }
    if(previous&&[...tableSelect.options].some(option=>option.value===previous)) tableSelect.value=previous;
  }

  private async refreshDatabasePreview(){
    if(this.kind!=="database"||this.files.length!==1) return;
    const table=element<HTMLSelectElement>("data-table-select").value;
    if(!table) return;
    try{
      this.dataDetail=await this.sqliteEngine.preview(this.files[0],table);
      this.renderDataPreview();
      await this.renderRoute();
    }catch(error){
      this.renderWarnings("inspection-warnings",[error instanceof Error?error.message:String(error)]);
    }
  }

  private renderDataPreview(){
    const container=element("data-preview");
    container.replaceChildren();
    if(!this.dataDetail||!this.dataDetail.columns.length){
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");

    const summary=document.createElement("div");
    summary.className="data-preview-summary";
    summary.textContent=(this.dataDetail.rows==null?"Unknown row count":this.dataDetail.rows.toLocaleString()+" row(s)")
      +" · "+this.dataDetail.columns.length+" column(s)";

    const wrap=document.createElement("div");
    wrap.className="data-preview-scroll";
    const table=document.createElement("table");
    const head=document.createElement("thead");
    const headRow=document.createElement("tr");
    for(const column of this.dataDetail.columns.slice(0,30)){
      const th=document.createElement("th");
      th.textContent=column.name;
      th.title=column.type+(column.nullable?" · nullable":"");
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);

    const body=document.createElement("tbody");
    for(const row of this.dataDetail.preview.slice(0,20)){
      const tr=document.createElement("tr");
      for(const column of this.dataDetail.columns.slice(0,30)){
        const td=document.createElement("td");
        const value=row[column.name];
        td.textContent=value==null?"":typeof value==="object"?JSON.stringify(value):String(value);
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
    wrap.append(table);
    container.append(summary,wrap);
  }

  private updateDataOptionVisibility(){
    const active=this.kind==="spreadsheet"||this.kind==="data"||this.kind==="database";
    element("data-controls").classList.toggle("hidden",!active);
    if(!active) return;

    const spreadsheet=this.kind==="spreadsheet";
    const database=this.kind==="database";
    element("data-route-wrap").classList.toggle("hidden",!spreadsheet);
    element("data-sheet-policy-wrap").classList.toggle("hidden",!spreadsheet);
    element("data-sheet-select-wrap").classList.toggle("hidden",!spreadsheet);
    element("data-formula-wrap").classList.toggle("hidden",!spreadsheet);
    element("data-table-select-wrap").classList.toggle("hidden",!database);

    const policy=element<HTMLSelectElement>("data-sheet-policy").value;
    element("data-sheet-select-wrap").classList.toggle("hidden",!spreadsheet||policy!=="selected");
    element("data-query").toggleAttribute("disabled",false);
  }

  private selectedDelimiter():string{
    const value=element<HTMLSelectElement>("data-delimiter").value;
    return value==="\\t"?"\t":value;
  }

  private readSpreadsheetOptions():SpreadsheetConversionOptions & {query?:string}{
    return {
      routePreference:element<HTMLSelectElement>("data-route").value as SpreadsheetConversionOptions["routePreference"],
      sheetPolicy:element<HTMLSelectElement>("data-sheet-policy").value as SpreadsheetConversionOptions["sheetPolicy"],
      selectedSheet:element<HTMLSelectElement>("data-sheet-select").value||undefined,
      formulaMode:element<HTMLSelectElement>("data-formula-mode").value as SpreadsheetConversionOptions["formulaMode"],
      delimiter:this.selectedDelimiter(),
      header:element<HTMLInputElement>("data-header").checked,
      query:element<HTMLTextAreaElement>("data-query").value.trim()||undefined
    };
  }

  private readDataOptions():DataConversionOptions{
    return {
      routePreference:"semantic",
      selectedTable:element<HTMLSelectElement>("data-table-select").value||undefined,
      delimiter:this.selectedDelimiter(),
      header:element<HTMLInputElement>("data-header").checked,
      query:element<HTMLTextAreaElement>("data-query").value.trim()||undefined
    };
  }

  private synchronousPipelineOptions():{options:Record<string,unknown>;quality:number}{
    if(this.kind==="image"){
      return {
        options:this.readImageOptions() as unknown as Record<string,unknown>,
        quality:Number(element<HTMLSelectElement>("image-quality").value)
      };
    }
    if(this.kind==="media"){
      return {options:this.readMediaOptions() as unknown as Record<string,unknown>,quality:.82};
    }
    if(this.kind==="spreadsheet"){
      return {options:this.readSpreadsheetOptions() as unknown as Record<string,unknown>,quality:.82};
    }
    if(this.kind==="data"||this.kind==="database"){
      return {options:this.readDataOptions() as unknown as Record<string,unknown>,quality:.82};
    }
    if(this.kind==="archive"){
      return {options:this.readArchiveOptions() as unknown as Record<string,unknown>,quality:.82};
    }
    if(this.kind==="document"){
      return {
        options:{
          routePreference:element<HTMLSelectElement>("document-route").value,
          trackChanges:element<HTMLSelectElement>("document-track-changes").value,
          assets:element<HTMLSelectElement>("document-assets").value,
          standalone:element<HTMLInputElement>("document-standalone").checked,
          tableOfContents:element<HTMLInputElement>("document-toc").checked,
          preserveComments:true
        },
        quality:.82
      };
    }
    return {options:{},quality:.82};
  }

  private updateBatchControls(){
    const operation=this.kind==="archive"?element<HTMLSelectElement>("archive-operation").value:"";
    const active=this.files.length>1
      &&this.kind!=="pdf"
      &&this.kind!=="archive-build"
      &&(this.kind!=="archive"||operation==="repack");
    element("batch-controls").classList.toggle("hidden",!active);
    if(!active){
      element("batch-task-list").classList.add("hidden");
      element<HTMLButtonElement>("batch-resume-button").classList.add("hidden");
      return;
    }

    const targetId=element<HTMLSelectElement>("target-format").value;
    if(!targetId){
      element("batch-pipeline-summary").textContent="No common target is available.";
      element("batch-pipeline-steps").replaceChildren();
      return;
    }

    try{
      const current=this.synchronousPipelineOptions();
      const pipeline=buildBatchPipeline({
        targetFormatId:targetId,
        quality:current.quality,
        options:current.options,
        namingTemplate:element<HTMLInputElement>("batch-name-template").value,
        executionMode:element<HTMLSelectElement>("batch-execution").value as BatchExecutionMode,
        packageResults:element<HTMLInputElement>("batch-package-results").checked
      });
      const labels=describePipeline(pipeline);
      element("batch-pipeline-summary").textContent=
        pipeline.executionMode==="auto"
          ?"Automatic local scheduling · "+labels.length+" step(s)"
          :"Sequential local scheduling · "+labels.length+" step(s)";
      const container=element("batch-pipeline-steps");
      container.replaceChildren();
      labels.forEach((label,index)=>{
        if(index){
          const arrow=document.createElement("span");arrow.className="pipeline-arrow";arrow.textContent="→";container.append(arrow);
        }
        const step=document.createElement("span");step.className="pipeline-step";step.textContent=label;container.append(step);
      });
    }catch(error){
      element("batch-pipeline-summary").textContent=error instanceof Error?error.message:String(error);
      element("batch-pipeline-steps").replaceChildren();
    }
  }

  private renderBatchSnapshot(snapshot:BatchSnapshot){
    this.setProgress(snapshot.progress,snapshot.stage);
    element("batch-status").textContent=
      snapshot.completed+"/"+snapshot.total+" complete"
      +(snapshot.failed?" · "+snapshot.failed+" failed":"")
      +(snapshot.cancelled?" · "+snapshot.cancelled+" cancelled":"");
    const renderLimit=this.deviceProfile.mobileLike
      ?(this.deviceProfile.tier==="constrained"?60:100)
      :250;
    element("batch-status-detail").textContent=
      snapshot.running+" running · "+snapshot.pending+" queued · failures stay isolated"
      +(snapshot.tasks.length>renderLimit?" · showing "+renderLimit+"/"+snapshot.tasks.length:"");
    element<HTMLButtonElement>("batch-resume-button").classList.toggle("hidden",!snapshot.resumable||snapshot.running>0);

    const container=element("batch-task-list");
    container.classList.toggle("hidden",snapshot.tasks.length===0);
    container.replaceChildren();
    for(const task of snapshot.tasks.slice(0,renderLimit)){
      const row=document.createElement("div");row.className="batch-task-row";
      const name=document.createElement("div");name.className="batch-task-name";
      const strong=document.createElement("strong");strong.textContent=task.sourceName;
      const sub=document.createElement("span");
      sub.textContent=task.outputName
        ?task.outputName
        :task.error
          ?friendlyIssueText(task.error)
          :(task.sourceFormatId??"Inspecting");
      name.append(strong,sub);

      const stage=document.createElement("div");stage.className="batch-task-stage";
      stage.textContent=Math.round(task.progress*100)+"% · "+task.stage;

      const state=document.createElement("span");state.className="batch-task-state "+task.state;
      state.textContent=task.state;
      row.append(name,stage,state);container.append(row);
    }
  }

  private async resumeBatch(){
    if(!this.batchRunner.hasResumable()) return;
    const button=element<HTMLButtonElement>("convert-button");
    const cancel=element<HTMLButtonElement>("cancel-button");
    button.disabled=true;cancel.classList.remove("hidden");
    try{
      const result=await this.batchRunner.resume(snapshot=>this.renderBatchSnapshot(snapshot),true);
      await this.renderBatchResults(result,this.batchPackageResults);
    }catch(error){
      this.renderWarnings("loss-warnings",[error instanceof Error?error.message:String(error)]);
    }finally{
      button.disabled=false;cancel.classList.add("hidden");
    }
  }

  private async renderBatchResults(result:BatchRunResult,packageResults:boolean){
    await this.releaseResults();
    const expanded:Array<{name:string;blob:Blob;warnings:string[];release?:()=>Promise<void>}>=[];

    for(const output of result.outputs){
      expanded.push({name:output.fileName,blob:output.blob,warnings:output.warnings});
      const prefix=sanitizeFilename(stem(output.fileName));
      for(const extra of output.extraFiles??[]){
        expanded.push({
          name:prefix+"-assets-"+sanitizeFilename(extra.name.replaceAll("/","-")),
          blob:extra.blob,
          warnings:[]
        });
      }
    }

    const failures=[...result.failures];
    if(packageResults&&expanded.length>1){
      let packageWorkspace:TempWorkspace|null=null;
      try{
        packageWorkspace=await TempWorkspace.create("package-"+crypto.randomUUID());
        const handle=packageWorkspace
          ?await packageWorkspace.getFileHandle("converted-files.zip")
          :undefined;
        const packaged=await this.archiveEngine.createFromFiles(
          expanded.map(item=>({blob:item.blob,path:item.name,lastModified:null})),
          "zip",
          {compressionLevel:6,preservePaths:false},
          handle,
          (_progress,stage)=>this.setProgress(1,"Packaging results · "+stage)
        );
        const retainedPackageWorkspace=packageWorkspace;
        expanded.push({
          name:"converted-files.zip",
          blob:packaged.blob,
          warnings:[
            handle
              ?"Local Phase 9 batch package streamed into OPFS."
              :"Local batch package; this browser could not provide OPFS streaming."
          ],
          release:retainedPackageWorkspace
            ?async()=>{await retainedPackageWorkspace.cleanup();}
            :undefined
        });
        packageWorkspace=null;
      }catch(error){
        try{await packageWorkspace?.cleanup();}catch{}
        failures.push({
          name:"converted-files.zip",
          error:"Batch packaging failed: "+(error instanceof Error?error.message:String(error))
        });
      }
    }

    this.showBlobResults(expanded,failures,false);
    this.setProgress(1,"Batch complete");
  }

  private commonTargets():string[]{
    if(!this.files.length||!this.kind||this.kind==="pdf") return [];
    if(this.kind==="archive-build"){
      return ["zip","7z","tar","tar-gzip","tar-bzip2","tar-xz"];
    }
    if(!this.inspections.length||this.inspections.some(i=>!i.detection.format)) return [];
    const sets=this.inspections.map(i=>new Set(this.planner.availableTargets(i.detection.format!.id)));
    return [...sets[0]].filter(target=>sets.every(set=>set.has(target)));
  }

  private populateTargets(){
    const select=element<HTMLSelectElement>("target-format");
    select.replaceChildren();
    if(this.kind==="pdf"){
      element<HTMLButtonElement>("convert-button").disabled=false;
      return;
    }

    const targets=this.commonTargets();
    for(const id of targets){
      const format=this.formats.get(id);if(!format) continue;
      const option=document.createElement("option");option.value=id;option.textContent=format.name;select.append(option);
    }

    const source=this.inspections[0]?.detection.format?.id;
    const preferred=this.kind==="image"
      ? source==="heic"?"jpeg":source==="svg"?"webp":source==="png"?"webp":source
      : this.kind==="media"
        ? (source==="asf"&&this.files.every(file=>file.name.toLowerCase().endsWith(".wma"))
          ? "mp3"
          : source==="mov"||source==="mkv"||source==="webm-media"||source==="avi"||source==="flv"||source==="asf"
            ? "mp4"
            : source)
        : this.kind==="document"
          ? (["markdown","latex","typst","txt","html-doc","epub"].includes(source??"")?"docx":targets.includes("pdf")?"pdf":source)
          : this.kind==="spreadsheet"
            ? (source&&targets.includes(source)?source:targets.includes("xlsx")?"xlsx":source)
            : this.kind==="data"
              ? (source&&targets.includes(source)?source:targets.includes("parquet")?"parquet":source)
              : this.kind==="database"
                ? (targets.includes("sqlite")?"sqlite":targets.includes("csv")?"csv":source)
                : this.kind==="specialist"
                  ? (source==="psd"?(targets.includes("png")?"png":targets[0])
                    :source==="camera-raw"?"jpeg"
                    :source==="fits"?"json-data"
                    :source==="fb2"?(targets.includes("docx")?"docx":targets.includes("html-doc")?"html-doc":targets[0])
                    :source&&targets.includes(source)?source:targets[0])
                  : source;

    if(preferred&&targets.includes(preferred)) select.value=preferred;
    else if(this.kind==="media"&&targets.includes("mp4")) select.value="mp4";
    else if(this.kind==="image"&&targets.includes("webp")) select.value="webp";
    else if(this.kind==="document"&&targets.includes("docx")) select.value="docx";
    else if(this.kind==="spreadsheet"&&targets.includes("xlsx")) select.value="xlsx";
    else if(this.kind==="data"&&targets.includes("parquet")) select.value="parquet";
    else if(this.kind==="database"&&targets.includes("sqlite")) select.value="sqlite";
    else if((this.kind==="archive"||this.kind==="archive-build")&&targets.includes("zip")) select.value="zip";

    element<HTMLButtonElement>("convert-button").disabled=targets.length===0;
  }

  private readImageOptions():ImageConversionOptions{
    const max=element<HTMLSelectElement>("max-dimension").value;
    const targetMb=numeric("image-target-size");
    return {
      metadataPolicy:element<HTMLSelectElement>("metadata-policy").value as ImageConversionOptions["metadataPolicy"],
      maxDimension:max?Number(max):undefined,
      targetBytes:targetMb?Math.round(targetMb*1024*1024):undefined,
      background:element<HTMLInputElement>("background-color").value,
      lossless:element<HTMLInputElement>("lossless").checked,
      preserveAnimation:true
    };
  }

  private readMediaOptions():MediaConversionOptions{
    const height=element<HTMLSelectElement>("media-height").value;
    const fps=element<HTMLSelectElement>("media-fps").value;
    const targetMb=numeric("media-target-size");
    const trimStart=numeric("trim-start");
    const trimEnd=numeric("trim-end");
    const targetId=element<HTMLSelectElement>("target-format").value;
    return {
      tracks:element<HTMLSelectElement>("track-policy").value as MediaConversionOptions["tracks"],
      metadataPolicy:element<HTMLSelectElement>("metadata-policy").value as MediaConversionOptions["metadataPolicy"],
      trimStart,trimEnd,
      maxHeight:height?Number(height):undefined,
      frameRate:fps?Number(fps):undefined,
      videoCodec:element<HTMLSelectElement>("video-codec").value||undefined,
      audioCodec:element<HTMLSelectElement>("audio-codec").value||undefined,
      videoBitrate:numeric("video-bitrate",1_000_000),
      audioBitrate:numeric("audio-bitrate",1_000),
      targetBytes:targetMb?Math.round(targetMb*1024*1024):undefined,
      extractAudio:this.formats.get(targetId)?.category==="audio",
      hardwareAcceleration:element<HTMLSelectElement>("hardware-acceleration").value as MediaConversionOptions["hardwareAcceleration"]
    };
  }

  private async readDocumentOptions():Promise<DocumentConversionOptions>{
    const reference=element<HTMLInputElement>("document-reference").files?.[0];
    const resources=[...(element<HTMLInputElement>("document-resources").files??[])].map(file=>({name:file.name,blob:file}));
    const fontFiles=[...(element<HTMLInputElement>("document-fonts").files??[])];
    const fonts=await Promise.all(fontFiles.map(async file=>({
      filename:file.name,
      data:await file.arrayBuffer()
    })));

    return {
      routePreference:element<HTMLSelectElement>("document-route").value as DocumentConversionOptions["routePreference"],
      trackChanges:element<HTMLSelectElement>("document-track-changes").value as DocumentConversionOptions["trackChanges"],
      assets:element<HTMLSelectElement>("document-assets").value as DocumentConversionOptions["assets"],
      standalone:element<HTMLInputElement>("document-standalone").checked,
      tableOfContents:element<HTMLInputElement>("document-toc").checked,
      preserveComments:true,
      referenceDocument:reference,
      referenceDocumentName:reference?.name,
      resources,
      fonts
    };
  }

  private readArchiveOptions():ArchiveConversionOptions{
    return {
      inputPassword:element<HTMLInputElement>("archive-input-password").value||undefined,
      outputPassword:element<HTMLInputElement>("archive-output-password").value||undefined,
      compressionLevel:Number(element<HTMLSelectElement>("archive-compression-level").value)||0,
      preservePaths:element<HTMLInputElement>("archive-preserve-paths").checked
    };
  }

  private selectedArchivePaths():string[]{
    return [...document.querySelectorAll<HTMLInputElement>("#archive-entry-list input[type=checkbox]:checked")]
      .map(input=>input.value);
  }

  private updateArchiveOptionVisibility(){
    if(this.kind!=="archive"&&this.kind!=="archive-build") return;
    const operation=element<HTMLSelectElement>("archive-operation");
    const isBuild=this.kind==="archive-build";

    for(const option of [...operation.options]){
      if(option.value==="create") option.disabled=!isBuild;
      else option.disabled=isBuild;
    }
    if(isBuild&&operation.value!=="create") operation.value="create";
    if(!isBuild&&operation.value==="create") operation.value="repack";

    const extracting=operation.value==="extract-all"||operation.value==="extract-selected";
    element("common-controls").classList.toggle("hidden",extracting);
    element("archive-entry-list").classList.toggle(
      "hidden",
      isBuild||!this.archiveDetail||this.archiveDetail.entries.filter(entry=>!entry.directory).length===0
    );
    element<HTMLButtonElement>("archive-select-all").disabled=isBuild||!this.archiveDetail;
    element<HTMLButtonElement>("archive-select-none").disabled=isBuild||!this.archiveDetail;
    element<HTMLButtonElement>("archive-reinspect-button").disabled=isBuild||this.files.length!==1;
  }

  private readPdfPassword():string|undefined{
    return element<HTMLInputElement>("pdf-password").value||undefined;
  }

  private updatePdfOptionVisibility(){
    if(this.kind!=="pdf") return;
    const operation=element<HTMLSelectElement>("pdf-operation").value;
    for(const node of document.querySelectorAll<HTMLElement>(".pdf-option")) node.classList.add("hidden");
    const show=(selector:string)=>document.querySelectorAll<HTMLElement>(selector).forEach(node=>node.classList.remove("hidden"));

    if(operation==="encrypt") show(".pdf-new-password");
    if(operation==="export-images"){show(".pdf-pages");show(".pdf-render");show(".pdf-dpi");}
    if(operation==="ocr"){show(".pdf-ocr");show(".pdf-dpi");}
    if(operation==="split"){show(".pdf-split");}
    if(operation==="rotate"){show(".pdf-pages");show(".pdf-rotate");}
    if(operation==="reorder"){show(".pdf-reorder");}
  }

  private async renderRoute(){
    const revision=++this.routeRevision;
    const box=element("route-box");

    if(this.kind==="archive"||this.kind==="archive-build"){
      this.updateArchiveOptionVisibility();
      const operation=element<HTMLSelectElement>("archive-operation").value;
      const targetId=element<HTMLSelectElement>("target-format").value;
      const options=this.readArchiveOptions();
      const warnings:string[]=[];

      if(this.kind==="archive-build"){
        const target=this.formats.get(targetId)?.name??targetId;
        box.textContent="Create "+target+" from "+this.files.length+" local file(s)";
        if(targetId!=="zip"&&options.outputPassword){
          warnings.push("Output encryption is currently implemented only for ZIP AES-256; the password will not be used for this target.");
        }
        warnings.push("Archive creation stays local. Large selections are bounded by a browser memory safety budget.");
      }else{
        if(operation==="extract-all"){
          box.textContent="Extract all "+(this.archiveDetail?.files??"?")+" file(s) locally";
          if(this.archiveDetail?.expandedSize){
            warnings.push("Extraction materializes up to "+formatBytes(this.archiveDetail.expandedSize)+" of declared content in browser results.");
          }
        }else if(operation==="extract-selected"){
          const count=this.selectedArchivePaths().length;
          box.textContent="Extract "+count+" selected archive entr"+(count===1?"y":"ies")+" locally";
          if(count===0) warnings.push("Select at least one archive entry.");
        }else{
          const sourceId=this.inspections[0]?.detection.format?.id;
          if(sourceId&&targetId){
            const route=this.planner.plan(sourceId,targetId);
            box.textContent=(this.formats.get(sourceId)?.name??sourceId)+" → "+(this.formats.get(targetId)?.name??targetId)+" · extract + repack locally";
            warnings.push(...route.warnings.map(w=>w.message));
          }else{
            box.textContent="Choose an archive output format.";
          }
          warnings.push("Repacking materializes archive entries locally before writing the new container.");
          if(targetId!=="zip"&&options.outputPassword){
            warnings.push("Output encryption is currently implemented only for ZIP AES-256.");
          }
        }

        if(this.archiveDetail?.passwordRequired&&!options.inputPassword){
          warnings.push("This archive reports encrypted data; enter its password before extraction/repacking.");
        }
        if(this.archiveDetail?.duplicatePaths.length){
          warnings.push("Duplicate paths exist. Individual extraction avoids overwriting them, but repacking may require renamed entries.");
        }
      }

      this.renderWarnings("loss-warnings",[...new Set(warnings)]);
      return;
    }

    if(this.kind==="pdf"){
      const operation=element<HTMLSelectElement>("pdf-operation").value;
      const labels:Record<string,string>={
        optimize:"Lossless structural optimization with qpdf",
        linearize:"Linearize PDF for progressive web viewing",
        repair:"Rewrite PDF structure with qpdf",
        "export-images":"Render selected pages locally with PDF.js",
        "extract-text":"Extract positioned PDF text locally",
        "reconstruct-docx":"Editable reconstruction: PDF text → DOCX",
        "reconstruct-markdown":"Editable reconstruction: PDF text → Markdown",
        "reconstruct-html":"Editable reconstruction: PDF text → HTML",
        "reconstruct-odt":"Editable reconstruction: PDF text → ODT",
        ocr:"Render → Tesseract OCR → searchable PDF pages",
        split:"Create selected page groups without rasterizing",
        rotate:"Rotate page metadata/content without rasterizing",
        reorder:"Rebuild page tree in the specified order",
        "flatten-forms":"Flatten AcroForm fields into page appearances",
        encrypt:"Encrypt with qpdf AES-256",
        decrypt:"Decrypt with qpdf",
        merge:"Merge selected PDFs without rasterizing"
      };
      box.textContent=(labels[operation]??operation)+" · local only";
      const warnings:string[]=[];
      if(this.pdfDetail?.signatures&&operation!=="extract-text"&&operation!=="export-images"){
        warnings.push("This PDF contains digital signature fields. Modifying the document may invalidate existing signatures.");
      }
      if(this.pdfDetail?.javascriptActions){
        warnings.push("Embedded PDF JavaScript/actions were detected. They are never executed.");
      }
      if(["optimize","linearize","repair","encrypt","decrypt"].includes(operation)){
        warnings.push("qpdf WASM uses a memory filesystem; this operation is size-gated on large PDFs.");
      }
      if(operation==="merge"&&this.files.length<2) warnings.push("Select at least two PDF files to merge.");
      if(operation==="ocr") warnings.push("OCR assets and selected language data are self-hosted and processed locally.");
      if(operation.startsWith("reconstruct-")){
        warnings.push("Editable reconstruction preserves reading text, not exact PDF layout, fonts, floating objects, headers/footers, or pagination.");
      }
      this.renderWarnings("loss-warnings",warnings);
      return;
    }

    const targetId=element<HTMLSelectElement>("target-format").value;
    if(!targetId||!this.kind||!this.inspections.length){
      box.textContent="No common local conversion route is available for this selection.";
      this.renderWarnings("loss-warnings",[]);return;
    }

    try{
      const uniqueSources=[...new Set(this.inspections.map(i=>i.detection.format!.id))];
      const routePreference=this.kind==="document"
        ? element<HTMLSelectElement>("document-route").value as "semantic"|"fidelity"
        : this.kind==="spreadsheet"
          ? element<HTMLSelectElement>("data-route").value as "semantic"|"fidelity"
          : this.kind==="data"||this.kind==="database"
            ? "semantic"
            : undefined;
      const routes=uniqueSources.map(source=>this.planner.plan(source,targetId,routePreference));
      const warnings=[...new Set(routes.flatMap(route=>route.warnings.map(w=>w.message)))];

      if(this.kind==="document"){
        const engines=[...new Set(routes.flatMap(route=>route.edges.map(edge=>
          edge.engineId==="pandoc-document"?"Pandoc WASM"
          :edge.engineId==="libreoffice-document"?"LibreOffice WASM"
          :edge.engineId==="pdf-reconstruction"?"PDF text reconstruction"
          :edge.engineId
        )))];
        box.textContent=(this.files.length>1?this.files.length+" documents · ":"")
          +(this.formats.get(targetId)?.name??targetId)
          +" · "+engines.join(" → ")
          +" · "+(routePreference==="semantic"?"structure/editability priority":"appearance/layout priority");
        if(routePreference==="fidelity"){
          warnings.push("LibreOffice fidelity mode lazy-loads a large local WASM runtime on first use.");
        }
        if(this.documentDetail?.macros){
          warnings.push("Macro payload is present or cannot be ruled out. VBA is never executed; macro-enabled packaged files use semantic conversion only.");
        }
        if(this.documentDetail?.externalLinks){
          warnings.push("External links/resources are not fetched during conversion.");
        }
        if(this.documentDetail?.fonts.length&&routePreference==="fidelity"){
          warnings.push("Layout fidelity depends on matching fonts; add local font files if substitutions change pagination.");
        }
        if(["markdown","txt"].includes(targetId)){
          warnings.push("The target cannot preserve page layout, floating objects, headers/footers, or presentation positioning.");
        }
      }else if(this.kind==="spreadsheet"||this.kind==="data"||this.kind==="database"){
        const engineLabel=(engineId:string)=>
          engineId==="sheetjs-spreadsheet"?"SheetJS"
          :engineId==="duckdb-data"?"DuckDB-Wasm"
          :engineId==="sqlite-data"?"sql.js / SQLite"
          :engineId==="libreoffice-document"?"LibreOffice Calc WASM"
          :engineId;
        const engines=[...new Set(routes.flatMap(route=>route.edges.map(edge=>engineLabel(edge.engineId))))];
        const usesLibreOffice=routes.some(route=>route.edges.some(edge=>edge.engineId==="libreoffice-document"));
        box.textContent=(this.files.length>1?this.files.length+" files · ":"")
          +(this.formats.get(targetId)?.name??targetId)
          +" · "+engines.join(" → ")
          +(this.kind==="spreadsheet"
            ? " · "+(routePreference==="fidelity"?"appearance/layout priority":"data/formula priority")
            : " · local structured-data pipeline");

        const query=element<HTMLTextAreaElement>("data-query").value.trim();
        const usesDuckDb=routes.some(route=>route.edges.some(edge=>edge.engineId==="duckdb-data"));
        const usesSqlite=routes.some(route=>route.edges.some(edge=>edge.engineId==="sqlite-data"));
        const queryApplied=usesDuckDb
          ||(this.kind==="database"&&usesSqlite&&targetId!=="sqlite");
        if(query&&!queryApplied){
          warnings.push("The SQL transform is ignored by this route. Choose a DuckDB-backed target, or export a SQLite table to a flat/data target first.");
        }
        if(query&&queryApplied){
          warnings.push("The optional SQL transform runs locally and is restricted to one SELECT/WITH query.");
        }

        if(this.kind==="spreadsheet"){
          const flatTarget=["csv","tsv","json-data","jsonl","parquet","arrow","sqlite"].includes(targetId);
          if(flatTarget){
            warnings.push("Flat/data targets cannot preserve workbook layout, multiple-sheet presentation, charts, or cell styling.");
          }
          if(this.spreadsheetDetail?.macros){
            warnings.push("VBA macro payload is never executed and is not preserved into the current output formats.");
          }
          if((this.spreadsheetDetail?.sheets??[]).some(sheet=>sheet.formulas>0)){
            if(usesLibreOffice){
              warnings.push("LibreOffice Calc may recalculate formulas and update cached results during fidelity conversion.");
            }else{
              warnings.push("SheetJS preserves formula expressions where supported but does not calculate workbook formulas.");
            }
          }
          if(element<HTMLSelectElement>("data-sheet-policy").value==="all"&&["csv","tsv","json-data"].includes(targetId)){
            warnings.push("All-sheet flat export returns the first sheet as the main output and additional sheets as sidecar files.");
          }
          if(usesLibreOffice){
            warnings.push("LibreOffice spreadsheet fidelity mode lazy-loads the larger Calc WASM runtime on first use.");
          }
        }else if(this.kind==="database"){
          warnings.push("SQLite is memory-backed in sql.js; database size and flat-export row counts are guarded.");
          if(targetId!=="sqlite"){
            warnings.push("Flat exports operate on the selected table unless a restricted SQL query is provided.");
          }
        }else{
          warnings.push("DuckDB reads CSV/JSON/Parquet from the local browser file handle; Arrow IPC input is memory-gated.");
        }
      }else if(this.kind==="image"){
        box.textContent=(this.files.length>1?this.files.length+" files · ":"")
          +"→ "+(this.formats.get(targetId)?.name??targetId)
          +" · "+[...new Set(routes.flatMap(r=>r.edges.map(e=>
            e.engineId==="vips-image"?"libvips/WASM":e.engineId==="pdf-engine"?"PDF engine":"browser fallback"
          )))].join(" + ")+" · local only";
      }else if(this.kind==="media"){
        const usesLegacy=routes.some(route=>route.edges.some(edge=>edge.engineId==="ffmpeg-legacy"));
        if(usesLegacy){
          box.textContent=(this.files.length>1?this.files.length+" legacy media files · ":"")
            +(this.formats.get(targetId)?.name??targetId)
            +" · FFmpeg WASM compatibility transcode · local only";
          warnings.push("Legacy AVI/FLV/ASF/WMV/WMA routes lazy-load FFmpeg WASM and are memory-backed. They do not use the primary streaming Mediabunny path.");
          warnings.push("Advanced WebCodecs media controls are intentionally hidden for the compatibility fallback; Phase 7 uses conservative fixed transcode settings.");
        }else if(this.files.length===1){
          box.textContent="Inspecting stream-copy compatibility…";
          const mediaPlan=await this.mediaEngine.plan(this.files[0],targetId,this.readMediaOptions());
          if(revision!==this.routeRevision) return;
          const mode=mediaPlan.mode==="remux"?"Lossless stream copy / remux":mediaPlan.mode==="partial-transcode"?"Partial transcode":"Transcode required";
          box.textContent=mode+" · "+mediaPlan.copyableTracks+"/"+mediaPlan.selectedTracks+" selected tracks directly copyable · OPFS streaming output";
          warnings.push(...mediaPlan.warnings);
        }else{
          box.textContent=this.files.length+" media files · copy/transcode route assessed per file · OPFS streaming output";
        }
      }else if(this.kind==="batch"){
        const engines=[...new Set(routes.flatMap(route=>route.edges.map(edge=>edge.engineId)))];
        box.textContent=this.files.length+" mixed files → "
          +(this.formats.get(targetId)?.name??targetId)
          +" · "+engines.length+" local engine"+(engines.length===1?"":"s")
          +" · per-file validated pipeline";
        warnings.push("Each file is planned independently. Unsupported routes fail only that file; successful files continue.");
        warnings.push("Capability-aware mode parallelizes only non-exclusive routes and serializes memory-heavy engines.");
      }else{
        const labels:Record<string,string>={
          "psd-layered":"PSD composite flattening",
          "raw-preview":"embedded RAW JPEG preview",
          "subtitle-compat":"subtitle semantics",
          "mesh-compat":"triangle-mesh converter",
          "font-compat":"fonteditor-core",
          "fb2-compat":"FB2 semantic extraction",
          "scientific-metadata":"FITS metadata extractor"
        };
        const engines=[...new Set(routes.flatMap(route=>route.edges.map(edge=>labels[edge.engineId]??edge.engineId)))];
        box.textContent=(this.files.length>1?this.files.length+" files · ":"")
          +(this.formats.get(targetId)?.name??targetId)+" · "+engines.join(" → ")+" · specialist local route";
        const sourceIds=new Set(uniqueSources);
        if(sourceIds.has("camera-raw")) warnings.push("RAW conversion extracts an embedded camera JPEG preview; it does not develop sensor data.");
        if(sourceIds.has("psd")) warnings.push("PSD conversion flattens the composite image and cannot preserve editable layers.");
        if(sourceIds.has("fits")) warnings.push("FITS conversion exports header metadata only; numerical payloads are intentionally left untouched.");
      }
      this.renderWarnings("loss-warnings",[...new Set(warnings)]);
    }catch(error){
      if(revision!==this.routeRevision) return;
      box.textContent=friendlyIssueText(error);
      this.renderWarnings("loss-warnings",[]);
    }
  }

  private renderWarnings(id:string,warnings:string[]){
    const container=element(id);container.replaceChildren();
    for(const text of warnings){
      const issue=presentIssue(text);
      const warning=document.createElement("div");
      warning.className="warning";
      warning.textContent=issue.code?friendlyIssueText(text):text;
      if(issue.code&&warning.textContent!==text) warning.title=text;
      container.append(warning);
    }
  }

  private validateMediaOptions(options:MediaConversionOptions):string|null{
    if(options.trimStart!=null&&options.trimEnd!=null&&options.trimEnd<=options.trimStart){
      return "Trim end must be later than trim start.";
    }
    return null;
  }

  private parsePageSpec(spec:string,max:number):number[]{
    const value=spec.trim().toLowerCase();
    if(!value||value==="all") return Array.from({length:max},(_,i)=>i+1);
    const pages:number[]=[];
    for(const token of value.split(",").map(v=>v.trim()).filter(Boolean)){
      const range=token.match(/^(\d+)(?:-(\d+))?$/);
      if(!range) throw new Error("PDF_PAGE_RANGE_INVALID: Invalid page token "+token);
      const start=Number(range[1]),end=Number(range[2]??range[1]);
      const step=start<=end?1:-1;
      for(let p=start;step>0?p<=end:p>=end;p+=step){
        if(p<1||p>max) throw new Error("PDF_PAGE_RANGE_INVALID: Page "+p+" is outside 1-"+max+".");
        if(!pages.includes(p)) pages.push(p);
      }
    }
    if(!pages.length) throw new Error("PDF_PAGE_RANGE_INVALID: No pages selected.");
    return pages;
  }

  private async ensurePdfDetail():Promise<DetailedPdfInspection>{
    if(this.pdfDetail) return this.pdfDetail;
    if(this.files.length!==1) throw new Error("PDF_OPERATION_REQUIRES_SINGLE_FILE: This operation requires one PDF.");
    this.pdfDetail=await this.pdfEngine.inspect(this.files[0],this.readPdfPassword());
    return this.pdfDetail;
  }

  private async convertAll(){
    if(!this.files.length||!this.kind) return;
    if(this.kind==="pdf"){
      await this.runPdfOperation();
      return;
    }
    if(this.kind==="archive"||this.kind==="archive-build"){
      await this.runArchiveOperation();
      return;
    }

    const targetId=element<HTMLSelectElement>("target-format").value;
    if(!targetId) return;

    if(this.kind==="image"&&targetId==="pdf"&&this.files.length>1){
      await this.createCombinedImagePdf();
      return;
    }

    const imageOptions=this.kind==="image"?this.readImageOptions():null;
    const mediaOptions=this.kind==="media"?this.readMediaOptions():null;
    const documentOptions=this.kind==="document"?await this.readDocumentOptions():null;
    const spreadsheetOptions=this.kind==="spreadsheet"?this.readSpreadsheetOptions():null;
    const dataOptions=(this.kind==="data"||this.kind==="database")?this.readDataOptions():null;
    if(spreadsheetOptions?.sheetPolicy==="all"&&["parquet","arrow","sqlite","jsonl"].includes(targetId)){
      this.renderWarnings("loss-warnings",[
        "This target represents one logical table. Choose First sheet or Selected sheet instead of All sheets."
      ]);
      return;
    }
    if(mediaOptions){
      const validation=this.validateMediaOptions(mediaOptions);
      if(validation){this.renderWarnings("loss-warnings",[validation]);return;}
    }

    await this.runGenericBatch(
      targetId,
      imageOptions,
      mediaOptions,
      documentOptions,
      spreadsheetOptions,
      dataOptions
    );
  }

  private async runGenericBatch(
    targetId:string,
    imageOptions:ImageConversionOptions|null,
    mediaOptions:MediaConversionOptions|null,
    documentOptions:DocumentConversionOptions|null,
    spreadsheetOptions:(SpreadsheetConversionOptions & {query?:string})|null,
    dataOptions:DataConversionOptions|null
  ){
    const options=(
      imageOptions
      ??mediaOptions
      ??documentOptions
      ??spreadsheetOptions
      ??dataOptions
      ??{}
    ) as unknown as Record<string,unknown>;
    const quality=this.kind==="image"
      ?Number(element<HTMLSelectElement>("image-quality").value)
      :.82;
    await this.runBatchPipeline(targetId,options,quality);
  }

  private async runBatchPipeline(
    targetId:string,
    options:Record<string,unknown>,
    quality:number
  ){
    const button=element<HTMLButtonElement>("convert-button");
    const cancel=element<HTMLButtonElement>("cancel-button");
    const panel=element("job-panel");
    const results=element("results");

    const packageResults=this.files.length>1
      &&element<HTMLInputElement>("batch-package-results").checked;
    const pipeline=buildBatchPipeline({
      targetFormatId:targetId,
      quality,
      options,
      namingTemplate:this.files.length>1
        ?element<HTMLInputElement>("batch-name-template").value
        :"{name}-converted",
      executionMode:this.files.length>1
        ?element<HTMLSelectElement>("batch-execution").value as BatchExecutionMode
        :"sequential",
      packageResults
    });
    this.batchPackageResults=pipeline.packageResults;

    button.disabled=true;
    cancel.classList.remove("hidden");
    panel.classList.remove("hidden");
    results.classList.add("hidden");
    results.replaceChildren();
    await this.releaseResults();

    try{
      const result=await this.batchRunner.start(
        this.files,
        pipeline,
        snapshot=>this.renderBatchSnapshot(snapshot)
      );
      await this.renderBatchResults(result,pipeline.packageResults);
      if(result.cancelled){
        this.renderWarnings("loss-warnings",[
          "Batch stopped. Completed outputs are retained in this session; choose Resume / retry remaining to continue."
        ]);
      }
    }catch(error){
      this.renderWarnings("loss-warnings",[error instanceof Error?error.message:String(error)]);
    }finally{
      button.disabled=false;
      cancel.classList.add("hidden");
      this.updateBatchControls();
    }
  }

  private async runArchiveOperation(){
    const operation=element<HTMLSelectElement>("archive-operation").value;
    const targetId=element<HTMLSelectElement>("target-format").value;
    const options=this.readArchiveOptions();
    const button=element<HTMLButtonElement>("convert-button");
    const cancel=element<HTMLButtonElement>("cancel-button");
    const results=element("results");

    button.disabled=true;
    cancel.classList.remove("hidden");
    results.classList.add("hidden");
    results.replaceChildren();
    await this.releaseResults();

    const controller=new AbortController();
    this.archiveAbort=controller;

    try{
      if(this.kind==="archive-build"){
        if(!targetId) throw new Error("ARCHIVE_TARGET_REQUIRED: Choose an archive format.");
        const sourceFiles=this.files.map(file=>({
          blob:file,
          path:(file as File & {webkitRelativePath?:string}).webkitRelativePath||file.name,
          lastModified:file.lastModified
        }));
        const created=await this.archiveEngine.createFromFiles(
          sourceFiles,
          targetId,
          options,
          undefined,
          (progress,stage)=>this.setProgress(progress,stage),
          controller.signal
        );
        const password=targetId==="zip"?options.outputPassword:undefined;
        await this.archiveEngine.inspect(created.blob,targetId,password);
        const extension=this.formats.get(targetId)?.extensions[0]??targetId;
        this.showBlobResults([{
          name:"archive."+extension,
          blob:created.blob,
          warnings:targetId!=="zip"&&options.outputPassword
            ? ["Output password applies only to ZIP and was ignored."]
            : []
        }],[]);
        this.setProgress(1,"Archive complete");
        return;
      }

      if(this.kind!=="archive") throw new Error("ARCHIVE_SELECTION_INVALID: No archive workflow is active.");
      if(operation==="repack"){
        if(!targetId) throw new Error("ARCHIVE_TARGET_REQUIRED: Choose an archive output format.");
        this.archiveAbort=null;
        await this.runBatchPipeline(targetId,options as unknown as Record<string,unknown>,.82);
        return;
      }

      if(this.files.length!==1){
        throw new Error("ARCHIVE_EXTRACTION_SINGLE: Extract one archive at a time.");
      }
      const sourceFormat=this.inspections[0]?.detection.format?.id;
      if(!sourceFormat) throw new Error("ARCHIVE_FORMAT_UNKNOWN: Archive format is unknown.");

      const selected=operation==="extract-selected"?this.selectedArchivePaths():undefined;
      if(operation==="extract-selected"&&(!selected||selected.length===0)){
        throw new Error("ARCHIVE_SELECTION_EMPTY: Select at least one entry.");
      }

      const extracted=await this.archiveEngine.extract(
        this.files[0],
        sourceFormat,
        options.inputPassword,
        selected,
        (progress,stage)=>this.setProgress(progress,stage),
        controller.signal
      );

      const counts=new Map<string,number>();
      const outputs=extracted.map(item=>{
        const seen=(counts.get(item.path)??0)+1;
        counts.set(item.path,seen);
        const name=seen===1?item.path:item.path+"."+seen;
        return {name,blob:item.blob,warnings:[] as string[]};
      });
      this.showBlobResults(outputs,[]);
      this.setProgress(1,"Extraction complete");
    }catch(error){
      this.renderWarnings("loss-warnings",[
        error instanceof Error?error.message:String(error)
      ]);
    }finally{
      this.archiveAbort=null;
      cancel.classList.add("hidden");
      button.disabled=false;
    }
  }

  private async createCombinedImagePdf(){
    const button=element<HTMLButtonElement>("convert-button");
    const cancel=element<HTMLButtonElement>("cancel-button");
    button.disabled=true;cancel.classList.remove("hidden");
    await this.releaseResults();
    element("job-panel").classList.remove("hidden");
    const normalized:Array<PdfCreateImage>=[];
    const releases:Array<()=>Promise<void>>=[];
    try{
      const options=this.readImageOptions();
      for(let i=0;i<this.files.length;i++){
        const file=this.files[i];
        const sourceId=this.inspections[i].detection.format!.id;
        if(sourceId==="jpeg"||sourceId==="png"){
          normalized.push({blob:file,format:sourceId,name:file.name});
        }else{
          const result=await this.jobs.convert(file,"png",1,options as unknown as Record<string,unknown>,snapshot=>{
            this.setProgress((i+snapshot.progress)/this.files.length,"Normalizing image "+(i+1)+"/"+this.files.length);
          });
          normalized.push({blob:result.blob,format:"png",name:file.name});
          if(result.release) releases.push(result.release);
        }
      }
      this.setProgress(.9,"Building PDF");
      const blob=await this.pdfEngine.imagesToPdf(normalized,"auto",0);
      await this.pdfEngine.inspect(blob);
      this.showBlobResults([{name:"images-combined.pdf",blob,warnings:[]}],[]);
      this.setProgress(1,"Complete");
    }catch(error){
      this.renderWarnings("loss-warnings",[error instanceof Error?error.message:String(error)]);
    }finally{
      for(const release of releases){try{await release();}catch{}}
      cancel.classList.add("hidden");
      button.disabled=false;
    }
  }

  private async runPdfOperation(){
    const operation=element<HTMLSelectElement>("pdf-operation").value;
    const button=element<HTMLButtonElement>("convert-button");
    const cancel=element<HTMLButtonElement>("cancel-button");
    const panel=element("job-panel");
    button.disabled=true;cancel.classList.remove("hidden");panel.classList.remove("hidden");
    await this.releaseResults();
    element("results").classList.add("hidden");
    element("results").replaceChildren();

    const password=this.readPdfPassword();
    const outputs:Array<{name:string;blob:Blob;warnings:string[];release?:()=>Promise<void>}>=[];

    try{
      if(operation==="merge"){
        if(this.files.length<2) throw new Error("PDF_MERGE_REQUIRES_MULTIPLE: Select at least two PDFs.");
        this.setProgress(.1,"Merging PDFs");
        const blob=await this.pdfEngine.merge(this.files);
        await this.pdfEngine.inspect(blob);
        outputs.push({name:"merged.pdf",blob,warnings:[]});
      }else{
        if(this.files.length!==1) throw new Error("PDF_OPERATION_REQUIRES_SINGLE_FILE: Choose one PDF for this operation.");
        const source=this.files[0];
        const base=sanitizeFilename(stem(source.name));

        if(operation==="optimize"){
          this.setProgress(.2,"Lossless structural optimization");
          const blob=await this.pdfEngine.optimize(source,password);
          await this.pdfEngine.inspect(blob,password);
          outputs.push({name:base+"-optimized.pdf",blob,warnings:[]});
        }else if(operation==="linearize"){
          this.setProgress(.2,"Linearizing PDF");
          const blob=await this.pdfEngine.linearize(source,password);
          await this.pdfEngine.inspect(blob,password);
          outputs.push({name:base+"-web.pdf",blob,warnings:[]});
        }else if(operation==="repair"){
          this.setProgress(.2,"Repairing PDF structure");
          const blob=await this.pdfEngine.repair(source,password);
          await this.pdfEngine.inspect(blob,password);
          outputs.push({name:base+"-repaired.pdf",blob,warnings:[]});
        }else if(operation==="decrypt"){
          if(!password) throw new Error("PDF_PASSWORD_REQUIRED: Enter the current password.");
          this.setProgress(.2,"Decrypting PDF");
          const blob=await this.pdfEngine.decrypt(source,password);
          await this.pdfEngine.inspect(blob);
          outputs.push({name:base+"-decrypted.pdf",blob,warnings:[]});
        }else if(operation==="encrypt"){
          const newPassword=element<HTMLInputElement>("pdf-new-password").value;
          if(!newPassword) throw new Error("PDF_PASSWORD_REQUIRED: Enter a new password.");
          this.setProgress(.2,"Encrypting PDF with AES-256");
          const blob=await this.pdfEngine.encrypt(source,newPassword,password);
          await this.pdfEngine.inspect(blob,newPassword);
          outputs.push({name:base+"-encrypted.pdf",blob,warnings:["Owner password is generated locally and not retained; the user password can still open/decrypt the file."]});
        }else if(operation==="flatten-forms"){
          this.setProgress(.2,"Flattening form fields");
          const blob=await this.pdfEngine.flattenForms(source,password);
          await this.pdfEngine.inspect(blob);
          outputs.push({name:base+"-flattened.pdf",blob,warnings:["Form fields are no longer editable."]});
        }else if(operation==="extract-text"){
          this.setProgress(.2,"Extracting PDF text");
          const result=await this.pdfEngine.extractText(source,password);
          outputs.push({name:base+".txt",blob:new Blob([result.text],{type:"text/plain;charset=utf-8"}),warnings:[]});
        }else if(operation.startsWith("reconstruct-")){
          const targetMap:Record<string,string>={
            "reconstruct-docx":"docx",
            "reconstruct-markdown":"markdown",
            "reconstruct-html":"html-doc",
            "reconstruct-odt":"odt"
          };
          const targetId=targetMap[operation];
          const docOptions:DocumentConversionOptions={
            routePreference:"semantic",
            trackChanges:"all",
            assets:"extract",
            standalone:true,
            tableOfContents:false,
            preserveComments:true
          };
          const output=await this.jobs.convert(
            source,
            targetId,
            .9,
            {...docOptions,password} as unknown as Record<string,unknown>,
            snapshot=>this.setProgress(snapshot.progress,snapshot.stage)
          );
          outputs.push({
            name:base+"-reconstructed."+(this.formats.get(targetId)?.extensions[0]??targetId),
            blob:output.blob,
            warnings:output.warnings,
            release:output.release
          });
          for(const extra of output.extraFiles??[]){
            outputs.push({
              name:base+"-assets-"+sanitizeFilename(extra.name.replaceAll("/","-")),
              blob:extra.blob,
              warnings:[]
            });
          }
        }else if(operation==="export-images"){
          const detail=await this.ensurePdfDetail();
          const pages=this.parsePageSpec(element<HTMLInputElement>("pdf-pages").value,detail.pages);
          const format=element<HTMLSelectElement>("pdf-image-format").value as "png"|"jpeg"|"webp";
          const dpi=Number(element<HTMLSelectElement>("pdf-dpi").value);
          const quality=Number(element<HTMLSelectElement>("pdf-image-quality").value);
          const rendered=await this.pdfEngine.exportPages(source,format,dpi,quality,pages,password,(progress,stage)=>this.setProgress(progress,stage));
          outputs.push(...rendered.map(item=>({name:item.name,blob:item.blob,warnings:[]})));
        }else if(operation==="ocr"){
          const detail=await this.ensurePdfDetail();
          const options:PdfOcrOptions={
            language:element<HTMLSelectElement>("pdf-ocr-language").value,
            dpi:Number(element<HTMLSelectElement>("pdf-dpi").value),
            pages:element<HTMLSelectElement>("pdf-ocr-pages").value as PdfOcrOptions["pages"]
          };
          if(options.pages==="scanned"&&detail.scannedPages===0){
            throw new Error("PDF_OCR_NOT_NEEDED: No pages without searchable text were detected.");
          }
          const result=await this.pdfEngine.ocrSearchable(source,options,password,(progress,stage)=>this.setProgress(progress,stage));
          await this.pdfEngine.inspect(result.blob);
          outputs.push({name:base+"-searchable.pdf",blob:result.blob,warnings:["OCR replaced selected scan pages with locally rendered searchable equivalents."]});
          if(result.text.trim()) outputs.push({name:base+"-ocr.txt",blob:new Blob([result.text],{type:"text/plain;charset=utf-8"}),warnings:[]});
        }else if(operation==="split"){
          const detail=await this.ensurePdfDetail();
          const raw=element<HTMLInputElement>("pdf-split-groups").value.trim();
          const groups=raw?raw.split(";").filter(Boolean):detail.pagesInfo.map(page=>String(page.page));
          const ranges:PdfSplitRange[]=groups.map((group,index)=>({
            name:base+"-part-"+String(index+1).padStart(3,"0")+".pdf",
            pages:this.parsePageSpec(group,detail.pages)
          }));
          const split=await this.pdfEngine.split(source,ranges,password);
          outputs.push(...split.map(item=>({name:item.name,blob:item.blob,warnings:[]})));
        }else if(operation==="rotate"){
          const detail=await this.ensurePdfDetail();
          const pages=this.parsePageSpec(element<HTMLInputElement>("pdf-pages").value,detail.pages);
          const rotation=Number(element<HTMLSelectElement>("pdf-rotation").value) as 90|180|270;
          const blob=await this.pdfEngine.rotate(source,pages,rotation,password);
          await this.pdfEngine.inspect(blob);
          outputs.push({name:base+"-rotated.pdf",blob,warnings:[]});
        }else if(operation==="reorder"){
          const detail=await this.ensurePdfDetail();
          const order=this.parsePageSpec(element<HTMLInputElement>("pdf-order").value,detail.pages);
          const blob=await this.pdfEngine.reorder(source,order,password);
          await this.pdfEngine.inspect(blob);
          outputs.push({name:base+"-reordered.pdf",blob,warnings:order.length<detail.pages?["Pages omitted from the order were removed."]:[]});
        }
      }

      this.setProgress(1,"Complete");
      this.showBlobResults(outputs,[]);
    }catch(error){
      this.renderWarnings("loss-warnings",[error instanceof Error?error.message:String(error)]);
    }finally{
      cancel.classList.add("hidden");
      button.disabled=false;
    }
  }

  private setProgress(progress:number,stage:string){
    element("job-panel").classList.remove("hidden");
    const value=Math.max(0,Math.min(1,progress));
    const percent=Math.round(value*100);
    element("job-stage").textContent=stage;
    element("job-progress").textContent=percent+"%";
    element<HTMLElement>("progress-bar").style.width=percent+"%";
    const track=element("job-progress-track");
    track.setAttribute("aria-valuenow",String(percent));
    track.setAttribute("aria-valuetext",stage+" · "+percent+"%");
  }

  private async renderResults(outputs:ConversionOutput[],failed:Array<{name:string;error:string}>){
    const expanded:Array<{name:string;blob:Blob;warnings:string[];release?:()=>Promise<void>}>=[];

    for(const output of outputs){
      expanded.push({name:output.fileName,blob:output.blob,warnings:output.warnings,release:output.release});
      const prefix=sanitizeFilename(stem(output.fileName));
      for(const extra of output.extraFiles??[]){
        expanded.push({
          name:prefix+"-assets-"+sanitizeFilename(extra.name.replaceAll("/","-")),
          blob:extra.blob,
          warnings:[]
        });
      }
    }

    this.showBlobResults(expanded,failed);
  }

  private showBlobResults(
    outputs:Array<{name:string;blob:Blob;warnings:string[];release?:()=>Promise<void>}>,
    failed:Array<{name:string;error:string}>,
    autoPackage=true
  ){
    const container=element("results");container.replaceChildren();container.classList.remove("hidden");
    for(const output of outputs) this.addResult(container,output.name,output.blob,output.warnings,output.release);

    const total=outputs.reduce((sum,item)=>sum+item.blob.size,0);
    const conveniencePackageLimit=Math.min(
      512*1024*1024,
      Math.floor(this.deviceProfile.workingSetBudgetBytes*.25)
    );
    if(autoPackage&&outputs.length>1&&total<=conveniencePackageLimit){
      void (async()=>{
        try{
          const entries=Object.create(null) as Record<string,Uint8Array>;
          for(const output of outputs) entries[output.name]=new Uint8Array(await output.blob.arrayBuffer());
          const zipped=zipSync(entries,{level:0});
          this.addResult(
            container,
            "converted-files.zip",
            new Blob([zipped],{type:"application/zip"}),
            ["Local convenience package."]
          );
        }catch(error){
          const node=document.createElement("div");node.className="warning";
          node.textContent="ZIP package: "+friendlyIssueText(error);
          container.append(node);
        }
      })();
    }

    for(const failure of failed){
      const node=document.createElement("div");node.className="warning";
      node.textContent=failure.name+": "+friendlyIssueText(failure.error);container.append(node);
    }
  }

  private addResult(container:HTMLElement,name:string,blob:Blob,warnings:string[],release?:()=>Promise<void>){
    const url=URL.createObjectURL(blob);this.leases.push({url,release});
    const item=document.createElement("div");item.className="result-item";
    const meta=document.createElement("div");meta.className="result-meta";
    const strong=document.createElement("strong");strong.textContent=name;
    const sub=document.createElement("span");sub.textContent=formatBytes(blob.size)+(warnings.length?" · "+warnings.length+" warning(s)":"");
    meta.append(strong,sub);
    const link=document.createElement("a");link.className="download-link";link.href=url;link.download=name;link.textContent="Save";link.setAttribute("aria-label","Save "+name);
    item.append(meta,link);container.append(item);
  }

  private async releaseResults(){
    const leases=this.leases.splice(0);
    for(const lease of leases){
      URL.revokeObjectURL(lease.url);
      try{await lease.release?.();}catch{}
    }
  }

  private async renderCapabilities(profile:CapabilityProfile){
    const entries:Array<[string,boolean|string]>=[
      ["Image engine",this.imageEngine.isAvailable()],
      ["Media engine",this.mediaEngine.isAvailable()],
      ["PDF engine",this.pdfEngine.isAvailable()],
      ["Semantic documents",this.pandocDocumentEngine.isAvailable()],
      ["Office fidelity",this.officeDocumentEngine.isAvailable()],
      ["Archive engine",this.archiveEngine.isAvailable()],
      ["Spreadsheet engine",this.spreadsheetEngine.isAvailable()],
      ["Structured data",this.duckDbDataEngine.isAvailable()],
      ["SQLite engine",this.sqliteEngine.isAvailable()],
      ["PSD compatibility",this.layeredImageEngine.isAvailable()],
      ["Legacy media fallback",this.legacyMediaEngine.isAvailable()],
      ["Font conversion",this.fontEngine.isAvailable()],
      ["Subtitle conversion",this.subtitleEngine.isAvailable()],
      ["Mesh conversion",this.meshEngine.isAvailable()],
      ["RAW preview extraction",this.rawPreviewEngine.isAvailable()],
      ["Scientific metadata",this.scientificMetadataEngine.isAvailable()],
      ["Device profile",this.deviceProfile.tier+(this.deviceProfile.mobileLike?" · mobile":"")],
      ["Working-set budget",formatBytes(this.deviceProfile.workingSetBudgetBytes)],
      ["Batch parallelism",String(this.deviceProfile.maxBatchParallelism)],
      ["Batch scheduler","Auto-safe parallel · sequential · resume"],
      ["Local OCR","English · German · French · Turkish · Korean"],
      ["WebCodecs",profile.webCodecs],
      ["H.264 decode / encode",profile.codecs.h264.decode+" / "+profile.codecs.h264.encode],
      ["VP9 decode / encode",profile.codecs.vp9.decode+" / "+profile.codecs.vp9.encode],
      ["AV1 decode / encode",profile.codecs.av1.decode+" / "+profile.codecs.av1.encode],
      ["AAC decode / encode",profile.codecs.aac.decode+" / "+profile.codecs.aac.encode],
      ["Opus decode / encode",profile.codecs.opus.decode+" / "+profile.codecs.opus.encode],
      ["OPFS",profile.opfs],
      ["WASM threads",profile.wasmThreads],
      ["Cross-origin isolated",profile.crossOriginIsolated],
      ["Storage quota",formatBytes(profile.storageQuota)],
      ["CPU threads",String(profile.hardwareConcurrency)]
    ];

    const container=element("capabilities");container.replaceChildren();
    for(const [label,value] of entries){
      const node=document.createElement("div");
      node.className="capability"+(typeof value==="boolean"?(value?" ok":" no"):"");
      const caption=document.createElement("span");caption.textContent=label;
      const strong=document.createElement("strong");strong.textContent=typeof value==="boolean"?bool(value):String(value);
      node.append(caption,strong);container.append(node);
    }

    element("runtime-status").textContent=this.duckDbDataEngine.isAvailable()
      &&this.sqliteEngine.isAvailable()
      &&this.subtitleEngine.isAvailable()
      &&this.meshEngine.isAvailable()
      ?"v1.0 runtime ready"
      :"One or more local engines degraded";
    element("capability-json").textContent=JSON.stringify({
      ...profile,
      imageEngine:this.imageEngine.isAvailable()?"wasm-vips":"browser fallback",
      mediaEngine:this.mediaEngine.isAvailable()?"Mediabunny 1.58.0":"unavailable",
      pdfEngine:this.pdfEngine.isAvailable()?"PDF.js + pdf-lib + qpdf + Tesseract":"unavailable",
      semanticDocumentEngine:this.pandocDocumentEngine.isAvailable()?"Pandoc WASM 3.9":"unavailable",
      fidelityDocumentEngine:this.officeDocumentEngine.isAvailable()?"LibreOffice WASM (lazy)":"unavailable",
      archiveEngine:this.archiveEngine.isAvailable()?"zip.js 2.16.0 + libarchive.js 2.0.2":"unavailable",
      spreadsheetEngine:this.spreadsheetEngine.isAvailable()?"SheetJS CE 0.20.3":"unavailable",
      structuredDataEngine:this.duckDbDataEngine.isAvailable()?"DuckDB-Wasm 1.32.0":"unavailable",
      sqliteEngine:this.sqliteEngine.isAvailable()?"sql.js 1.14.2":"unavailable",
      psdEngine:this.layeredImageEngine.isAvailable()?"ag-psd 31.0.2":"unavailable",
      legacyMediaEngine:this.legacyMediaEngine.isAvailable()?"FFmpeg WASM 0.12.10 (lazy)":"unavailable",
      fontEngine:this.fontEngine.isAvailable()?"fonteditor-core 2.6.3":"unavailable",
      specialistNativeEngines:"subtitles + meshes + RAW preview + FITS metadata + FB2",
      batchScheduler:"capability-aware + sequential + in-session resume",
      deviceProfile:this.deviceProfile
    },null,2);
  }
}
