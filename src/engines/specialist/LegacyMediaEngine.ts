import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { assertMemoryBackedSource } from "../../core/performance/Budget";

const INPUTS=new Set(["avi","flv","asf"]);
const OUTPUTS=new Set(["mp4","webm-media","mp3","wav","flac","ogg"]);
const EXT:Record<string,string>={
  avi:"avi",flv:"flv",asf:"asf",
  mp4:"mp4","webm-media":"webm",mp3:"mp3",wav:"wav",flac:"flac",ogg:"ogg"
};
const MIME:Record<string,string>={
  mp4:"video/mp4","webm-media":"video/webm",mp3:"audio/mpeg",wav:"audio/wav",flac:"audio/flac",ogg:"audio/ogg"
};

function command(input:string,output:string,target:string):string[]{
  const base=["-hide_banner","-nostdin","-y","-i",input];
  if(target==="mp4") return [...base,"-map","0:v?","-map","0:a?","-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-movflags","+faststart",output];
  if(target==="webm-media") return [...base,"-map","0:v?","-map","0:a?","-c:v","libvpx-vp9","-crf","32","-b:v","0","-c:a","libopus","-b:a","128k",output];
  if(target==="mp3") return [...base,"-vn","-c:a","libmp3lame","-q:a","2",output];
  if(target==="wav") return [...base,"-vn","-c:a","pcm_s16le",output];
  if(target==="flac") return [...base,"-vn","-c:a","flac",output];
  if(target==="ogg") return [...base,"-vn","-c:a","libvorbis","-q:a","5",output];
  throw new Error("LEGACY_MEDIA_TARGET_UNSUPPORTED: "+target);
}

export class LegacyMediaEngine implements ConversionEngine{
  readonly id="ffmpeg-legacy";
  readonly version="ffmpeg.wasm-core-0.12.10";
  private ffmpeg:FFmpeg|null=null;
  private loaded=false;
  private coreUrl="";
  private wasmUrl="";
  private currentProgress:((progress:number,stage:string)=>void)|undefined;

  async prepare():Promise<void>{
    this.coreUrl=new URL("engines/ffmpeg/ffmpeg-core.js",document.baseURI).href;
    this.wasmUrl=new URL("engines/ffmpeg/ffmpeg-core.wasm",document.baseURI).href;
  }

  isAvailable():boolean{return typeof Worker!=="undefined"&&typeof WebAssembly!=="undefined";}
  canConvert(from:string,to:string):boolean{return INPUTS.has(from)&&OUTPUTS.has(to);}

  async estimate(source:Blob):Promise<ConversionEstimate>{
    const memoryBytes=Math.max(256*1024*1024,source.size*4);
    return {
      temporaryBytes:memoryBytes,
      memoryBytes,
      workspaceBytes:Math.max(96*1024*1024,source.size*1.25),
      outputBytes:null,
      sourceAccess:"buffered",
      outputAccess:"buffered",
      notes:["Legacy FFmpeg compatibility uses an in-memory WASM filesystem and is not a large-file streaming route."]
    };
  }

  private async getFfmpeg():Promise<FFmpeg>{
    if(this.ffmpeg&&this.loaded) return this.ffmpeg;
    const ffmpeg=new FFmpeg();
    ffmpeg.on("progress",({progress})=>{
      if(Number.isFinite(progress)) this.currentProgress?.(.12+Math.max(0,Math.min(1,progress))*.78,"Transcoding legacy media");
    });
    await ffmpeg.load({coreURL:this.coreUrl,wasmURL:this.wasmUrl});
    this.ffmpeg=ffmpeg;this.loaded=true;
    return ffmpeg;
  }

  private reset(){
    if(this.ffmpeg){
      try{this.ffmpeg.terminate();}catch{}
    }
    this.ffmpeg=null;this.loaded=false;
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("LEGACY_MEDIA_ROUTE_UNSUPPORTED: FFmpeg compatibility route is not enabled for this pair.");
    assertMemoryBackedSource(request.source.size,"legacy FFmpeg transcoding",4,384*1024*1024);

    this.currentProgress=request.onProgress;
    request.onProgress?.(.04,"Loading legacy FFmpeg compatibility engine");
    const ffmpeg=await this.getFfmpeg();
    const token=crypto.randomUUID().replaceAll("-","");
    const input="input-"+token+"."+EXT[request.sourceFormatId];
    const output="output-"+token+"."+EXT[request.targetFormatId];

    const abort=()=>this.reset();
    request.signal.addEventListener("abort",abort,{once:true});
    try{
      const source=new Uint8Array(await request.source.arrayBuffer());
      await ffmpeg.writeFile(input,source);
      request.onProgress?.(.1,"Decoding legacy media");
      const exit=await ffmpeg.exec(command(input,output,request.targetFormatId));
      if(request.signal.aborted) throw new DOMException("Legacy media conversion cancelled.","AbortError");
      if(exit!==0) throw new Error("LEGACY_MEDIA_FFMPEG_FAILED: FFmpeg exited with code "+exit+".");
      const data=await ffmpeg.readFile(output);
      if(typeof data==="string") throw new Error("LEGACY_MEDIA_OUTPUT_INVALID: FFmpeg returned text instead of binary media.");
      const copy=new Uint8Array(data.byteLength);copy.set(data);
      request.onProgress?.(.95,"Finalizing legacy media output");
      return {
        blob:new Blob([copy.buffer],{type:MIME[request.targetFormatId]??"application/octet-stream"}),
        warnings:["Legacy compatibility uses full transcoding through a lazy FFmpeg WASM fallback. It can be substantially slower and more memory-intensive than the primary Mediabunny/WebCodecs routes."],
        details:{engine:"FFmpeg WASM legacy fallback"}
      };
    }finally{
      request.signal.removeEventListener("abort",abort);
      this.currentProgress=undefined;
      try{await ffmpeg.deleteFile(input);}catch{}
      try{await ffmpeg.deleteFile(output);}catch{}
    }
  }

  dispose():void{this.reset();}
}
