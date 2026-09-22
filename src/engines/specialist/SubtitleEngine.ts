import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { parseSubtitle,serializeSubtitle } from "../../core/specialist/subtitles";
import { readTextBlob } from "../../core/text/decodeText";

const FORMATS=new Set(["srt","vtt","ass"]);
const MIME:Record<string,string>={
  srt:"application/x-subrip;charset=utf-8",
  vtt:"text/vtt;charset=utf-8",
  ass:"text/x-ssa;charset=utf-8"
};

export class SubtitleEngine implements ConversionEngine{
  readonly id="subtitle-compat";
  readonly version="phase7-native-1";

  async prepare():Promise<void>{}
  isAvailable():boolean{return typeof TextDecoder!=="undefined"&&typeof TextEncoder!=="undefined";}
  canConvert(from:string,to:string):boolean{return FORMATS.has(from)&&FORMATS.has(to);}

  async estimate(source:Blob):Promise<ConversionEstimate>{
    return {temporaryBytes:Math.max(8*1024*1024,source.size*4),outputBytes:source.size,notes:["Subtitle conversion is text-only and memory-backed."]};
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("SUBTITLE_ROUTE_UNSUPPORTED: Unsupported subtitle route.");
    if(request.source.size>32*1024*1024) throw new Error("SUBTITLE_SIZE_LIMIT: Subtitle file exceeds the guarded 32 MiB text limit.");
    request.onProgress?.(.2,"Parsing subtitle cues");
    const {text:inputText}=await readTextBlob(request.source);
    const cues=parseSubtitle(inputText,request.sourceFormatId);
    if(request.signal.aborted) throw new DOMException("Subtitle conversion cancelled.","AbortError");
    request.onProgress?.(.7,"Writing subtitle format");
    const outputText=serializeSubtitle(cues,request.targetFormatId);
    const warnings:string[]=[];
    if(request.sourceFormatId==="ass"&&request.targetFormatId!=="ass"){
      warnings.push("ASS/SSA styling, positioning, effects, and override tags are not representable in this target and were reduced to plain cue text.");
    }
    if(request.sourceFormatId==="vtt"&&request.targetFormatId!=="vtt"){
      warnings.push("WebVTT cue settings, STYLE, REGION, and NOTE blocks are not preserved.");
    }
    return {blob:new Blob([outputText],{type:MIME[request.targetFormatId]}),warnings,details:{cues:cues.length}};
  }

  dispose():void{}
}
