import { zipSync } from "fflate";
import type { CapabilityProfile } from "../core/capabilities/CapabilityProfile";
import { detectCapabilities } from "../core/capabilities/detectCapabilities";
import { EngineRegistry } from "../core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../core/formats/defaultFormats";
import type { DetailedImageInspection, ImageConversionOptions } from "../core/image/types";
import type { FileInspection } from "../core/inspection/inspectFile";
import { inspectFile } from "../core/inspection/inspectFile";
import { JobManager } from "../core/jobs/JobManager";
import { createConversionGraph } from "../core/planner/ConversionGraph";
import { ConversionPlanner } from "../core/planner/ConversionPlanner";
import { ImageOutputValidator } from "../core/validation/Validator";
import { BrowserImageEngine } from "../engines/browser-image/BrowserImageEngine";
import { VipsImageEngine } from "../engines/image/VipsImageEngine";

function element<T extends HTMLElement>(id:string):T {
  const value=document.getElementById(id);
  if (!value) throw new Error("Missing UI element: "+id);
  return value as T;
}

function formatBytes(bytes:number|null):string {
  if (bytes===null) return "Unknown";
  if (bytes<1024) return bytes+" B";
  const units=["KB","MB","GB","TB"];
  let value=bytes/1024,unit=0;
  while(value>=1024&&unit<units.length-1){value/=1024;unit++}
  return value.toFixed(value>=100?0:value>=10?1:2)+" "+units[unit];
}

function bool(value:boolean):string { return value?"Available":"Unavailable"; }

function mimeFallbackName(formatId:string):string {
  return ({jpeg:"JPEG",png:"PNG",webp:"WebP",gif:"GIF",tiff:"TIFF",avif:"AVIF",jxl:"JPEG XL"} as Record<string,string>)[formatId] ?? formatId;
}

export class App {
  private readonly formats=createDefaultFormatRegistry();
  private readonly engines=new EngineRegistry();
  private readonly graph=createConversionGraph();
  private readonly imageEngine=new VipsImageEngine();
  private readonly planner:ConversionPlanner;
  private readonly jobs:JobManager;

  private files:File[]=[];
  private inspections:FileInspection[]=[];
  private detailed:DetailedImageInspection|null=null;
  private urls:string[]=[];

  constructor() {
    this.engines.register(this.imageEngine);
    this.engines.register(new BrowserImageEngine());
    this.planner=new ConversionPlanner(this.graph,this.formats,this.engines);
    this.jobs=new JobManager(
      this.formats,
      this.engines,
      this.planner,
      new ImageOutputValidator(this.formats,async(blob,formatId)=>{
        const result=await this.imageEngine.inspect(blob,formatId);
        return {width:result.width,height:result.height};
      })
    );
  }

  async start():Promise<void> {
    this.bindInputs();
    await this.engines.prepareAll();
    await this.renderCapabilities(await detectCapabilities());
  }

  private bindInputs() {
    const input=element<HTMLInputElement>("file-input");
    const zone=element<HTMLLabelElement>("drop-zone");
    input.addEventListener("change",()=>{ if(input.files?.length) void this.loadFiles([...input.files]); });
    ["dragenter","dragover"].forEach(type=>zone.addEventListener(type,event=>{
      event.preventDefault();zone.classList.add("dragging");
    }));
    ["dragleave","drop"].forEach(type=>zone.addEventListener(type,event=>{
      event.preventDefault();zone.classList.remove("dragging");
    }));
    zone.addEventListener("drop",event=>{
      const files=[...(event.dataTransfer?.files ?? [])];
      if(files.length) void this.loadFiles(files);
    });

    ["target-format","quality","metadata-policy","max-dimension","target-size","background-color","lossless"]
      .forEach(id=>element(id).addEventListener("change",()=>this.renderRoute()));

    element<HTMLButtonElement>("convert-button").addEventListener("click",()=>void this.convertAll());
    element<HTMLButtonElement>("cancel-button").addEventListener("click",()=>this.jobs.cancelAll());
  }

  private async loadFiles(files:File[]) {
    this.revokeUrls();
    this.files=files;
    this.detailed=null;
    this.inspections=await Promise.all(files.map(file=>inspectFile(file,this.formats)));
    element("file-panel").classList.remove("hidden");
    element("results").classList.add("hidden");
    element("results").replaceChildren();

    const known=this.inspections.filter(item=>item.detection.format);
    element("file-name").textContent=files.length===1?files[0].name:files.length+" image files";
    element("detection-confidence").textContent=known.length===files.length
      ? (files.length===1
          ? known[0].detection.format!.name+" · "+Math.round(known[0].detection.confidence*100)+"%"
          : known.length+"/"+files.length+" recognized")
      : known.length+"/"+files.length+" recognized";

    this.renderGenericFacts();
    const warnings=this.inspections.flatMap(item=>item.detection.warnings.map(w=>item.name+": "+w));
    const unknown=this.inspections.filter(item=>!item.detection.format);
    if(unknown.length) warnings.push(unknown.length+" file(s) could not be identified and block a common batch route.");
    this.renderWarnings("inspection-warnings",warnings);

    if(files.length===1 && known.length===1 && this.imageEngine.isAvailable()) {
      try {
        this.detailed=await this.imageEngine.inspect(files[0],known[0].detection.format!.id);
        this.renderGenericFacts();
        this.renderWarnings("inspection-warnings",[
          ...warnings,
          ...this.detailed.warnings
        ]);
      } catch(error) {
        this.renderWarnings("inspection-warnings",[
          ...warnings,
          "Detailed libvips inspection unavailable: "+(error instanceof Error?error.message:String(error))
        ]);
      }
    }

    this.populateTargets();
    this.renderRoute();
  }

  private renderGenericFacts() {
    const total=this.files.reduce((sum,file)=>sum+file.size,0);
    const first=this.inspections[0];
    const formatNames=[...new Set(this.inspections.map(i=>i.detection.format?.name??"Unknown"))];
    const facts:Array<[string,string]> = this.files.length===1 ? [
      ["Format",first?.detection.format?.name??"Unknown"],
      ["Size",formatBytes(total)],
      ["Dimensions",this.detailed
        ? this.detailed.width+" × "+this.detailed.height
        : first?.width&&first?.height?first.width+" × "+first.height:"Inspecting with engine"],
      ["Frames / pages",this.detailed?String(this.detailed.frames):"—"],
      ["Alpha",this.detailed?(this.detailed.alpha?"Yes":"No"):"—"],
      ["Bit depth",this.detailed?.bitDepth?this.detailed.bitDepth+" bit":"—"],
      ["Color",this.detailed?.colorSpace??"—"],
      ["Decoded estimate",this.detailed?formatBytes(this.detailed.estimatedDecodedBytes):"—"]
    ] : [
      ["Files",String(this.files.length)],
      ["Total size",formatBytes(total)],
      ["Formats",formatNames.join(", ")],
      ["Common target","Calculated locally"]
    ];

    const container=element("file-facts");
    container.replaceChildren(...facts.map(([label,value])=>{
      const node=document.createElement("div");node.className="fact";
      const caption=document.createElement("span");caption.textContent=label;
      const strong=document.createElement("strong");strong.textContent=value;
      node.append(caption,strong);return node;
    }));
  }

  private commonTargets():string[] {
    if(!this.inspections.length||this.inspections.some(i=>!i.detection.format)) return [];
    const sets=this.inspections.map(i=>new Set(this.planner.availableTargets(i.detection.format!.id)));
    return [...sets[0]].filter(target=>sets.every(set=>set.has(target)));
  }

  private populateTargets() {
    const select=element<HTMLSelectElement>("target-format");
    select.replaceChildren();
    const targets=this.commonTargets();
    for(const id of targets){
      const format=this.formats.get(id);if(!format) continue;
      const option=document.createElement("option");option.value=id;option.textContent=format.name;
      select.append(option);
    }
    const source=this.inspections[0]?.detection.format?.id;
    const preferred=source==="heic"?"jpeg":source==="svg"?"webp":source==="gif"?"webp":source==="png"?"webp":source;
    if(preferred&&targets.includes(preferred)) select.value=preferred;
    else if(targets.includes("webp")) select.value="webp";

    element<HTMLButtonElement>("convert-button").disabled=targets.length===0;
  }

  private readOptions():ImageConversionOptions {
    const maxValue=element<HTMLSelectElement>("max-dimension").value;
    const sizeValue=Number(element<HTMLInputElement>("target-size").value);
    return {
      metadataPolicy:element<HTMLSelectElement>("metadata-policy").value as ImageConversionOptions["metadataPolicy"],
      maxDimension:maxValue?Number(maxValue):undefined,
      targetBytes:Number.isFinite(sizeValue)&&sizeValue>0?Math.round(sizeValue*1024*1024):undefined,
      background:element<HTMLInputElement>("background-color").value,
      lossless:element<HTMLInputElement>("lossless").checked,
      preserveAnimation:true
    };
  }

  private renderRoute() {
    const targetId=element<HTMLSelectElement>("target-format").value;
    const routeBox=element("route-box");
    if(!targetId||!this.inspections.length){
      routeBox.textContent="No common local image route is available for this selection.";
      this.renderWarnings("loss-warnings",[]);return;
    }

    try {
      const uniqueSources=[...new Set(this.inspections.map(i=>i.detection.format?.id).filter(Boolean) as string[])];
      const routes=uniqueSources.map(source=>this.planner.plan(source,targetId));
      const engines=[...new Set(routes.flatMap(route=>route.edges.map(edge=>edge.engineId)))];
      routeBox.textContent=(this.files.length>1?this.files.length+" files · ":"")
        +"→ "+(this.formats.get(targetId)?.name??mimeFallbackName(targetId))
        +" · "+engines.map(id=>id==="vips-image"?"libvips/WASM":"browser fallback").join(" + ")
        +" · local only";
      const warnings=[...new Set(routes.flatMap(route=>route.warnings.map(w=>w.message)))];
      if(this.detailed?.frames===1) {
        const animationMessage=this.formats.get(this.inspections[0].detection.format?.id??"")?.capabilities.animation;
        if(animationMessage) {
          const index=warnings.findIndex(w=>w.includes("animated input"));
          if(index>=0) warnings.splice(index,1);
        }
      }
      this.renderWarnings("loss-warnings",warnings);
    } catch(error) {
      routeBox.textContent=error instanceof Error?error.message:"No route available.";
      this.renderWarnings("loss-warnings",[]);
    }
  }

  private renderWarnings(id:string,warnings:string[]) {
    const container=element(id);container.replaceChildren();
    for(const text of warnings) {
      const warning=document.createElement("div");warning.className="warning";warning.textContent=text;container.append(warning);
    }
  }

  private async convertAll() {
    if(!this.files.length) return;
    const targetId=element<HTMLSelectElement>("target-format").value;
    if(!targetId) return;

    const button=element<HTMLButtonElement>("convert-button");
    const cancel=element<HTMLButtonElement>("cancel-button");
    const jobPanel=element("job-panel");
    const results=element("results");
    const quality=Number(element<HTMLSelectElement>("quality").value);
    const options=this.readOptions();

    button.disabled=true;cancel.classList.remove("hidden");jobPanel.classList.remove("hidden");
    results.classList.add("hidden");results.replaceChildren();this.revokeUrls();

    const outputs:Array<{blob:Blob;fileName:string;warnings:string[]}>=[];
    const failed:Array<{name:string;error:string}>=[];
    try {
      for(let index=0;index<this.files.length;index++){
        const file=this.files[index];
        try {
          const output=await this.jobs.convert(file,targetId,quality,options,snapshot=>{
            const overall=(index+snapshot.progress)/this.files.length;
            element("job-stage").textContent=this.files.length>1
              ?"File "+(index+1)+"/"+this.files.length+" · "+snapshot.stage
              : snapshot.stage;
            element("job-progress").textContent=Math.round(overall*100)+"%";
            element<HTMLElement>("progress-bar").style.width=Math.round(overall*100)+"%";
          });
          outputs.push(output);
        } catch(error) {
          if(error instanceof DOMException&&error.name==="AbortError") throw error;
          failed.push({name:file.name,error:error instanceof Error?error.message:String(error)});
        }
      }

      this.renderResults(outputs,failed);
    } catch(error) {
      this.renderWarnings("loss-warnings",[error instanceof Error?error.message:"Conversion cancelled."]);
    } finally {
      button.disabled=false;cancel.classList.add("hidden");
    }
  }

  private async renderResults(
    outputs:Array<{blob:Blob;fileName:string;warnings:string[]}>,
    failed:Array<{name:string;error:string}>
  ) {
    const container=element("results");container.replaceChildren();container.classList.remove("hidden");
    for(const output of outputs) this.addResult(container,output.fileName,output.blob,output.warnings);

    const total=outputs.reduce((sum,item)=>sum+item.blob.size,0);
    if(outputs.length>1&&total<=512*1024*1024){
      try {
        const entries:Record<string,Uint8Array>={};
        for(const output of outputs) entries[output.fileName]=new Uint8Array(await output.blob.arrayBuffer());
        const zipped=zipSync(entries,{level:0});
        this.addResult(container,"converted-images.zip",new Blob([zipped],{type:"application/zip"}),["Batch package; image payloads are stored without redundant ZIP recompression."]);
      } catch(error) {
        failed.push({name:"Batch ZIP",error:error instanceof Error?error.message:String(error)});
      }
    }

    for(const failure of failed) {
      const node=document.createElement("div");node.className="warning";
      node.textContent=failure.name+": "+failure.error;container.append(node);
    }
  }

  private addResult(container:HTMLElement,name:string,blob:Blob,warnings:string[]) {
    const url=URL.createObjectURL(blob);this.urls.push(url);
    const item=document.createElement("div");item.className="result-item";
    const meta=document.createElement("div");meta.className="result-meta";
    const strong=document.createElement("strong");strong.textContent=name;
    const sub=document.createElement("span");sub.textContent=formatBytes(blob.size)+(warnings.length?" · "+warnings.length+" warning(s)":"");
    meta.append(strong,sub);
    const link=document.createElement("a");link.className="download-link";link.href=url;link.download=name;link.textContent="Save";
    item.append(meta,link);container.append(item);
  }

  private revokeUrls(){ for(const url of this.urls) URL.revokeObjectURL(url);this.urls=[]; }

  private async renderCapabilities(profile:CapabilityProfile) {
    const entries:Array<[string,boolean|string]>=[
      ["Production image engine",this.imageEngine.isAvailable()],
      ["WebAssembly",profile.webAssembly],
      ["WASM SIMD",profile.wasmSIMD],
      ["WASM threads",profile.wasmThreads],
      ["Cross-origin isolated",profile.crossOriginIsolated],
      ["OPFS",profile.opfs],
      ["Workers",profile.workers],
      ["WebCodecs",profile.webCodecs],
      ["Direct file save",profile.fileSystemAccess],
      ["Storage quota",formatBytes(profile.storageQuota)],
      ["CPU threads",String(profile.hardwareConcurrency)]
    ];
    const capabilities=element("capabilities");capabilities.replaceChildren();
    for(const [label,value] of entries){
      const node=document.createElement("div");
      node.className="capability"+(typeof value==="boolean"?(value?" ok":" no"):"");
      const caption=document.createElement("span");caption.textContent=label;
      const strong=document.createElement("strong");strong.textContent=typeof value==="boolean"?bool(value):value;
      node.append(caption,strong);capabilities.append(node);
    }
    element("runtime-status").textContent=this.imageEngine.isAvailable()?"Phase 1 ready":"Basic-image fallback";
    element("capability-json").textContent=JSON.stringify({
      ...profile,
      imageEngine:this.imageEngine.isAvailable()?"wasm-vips (lazy)":"browser fallback"
    },null,2);
  }
}
