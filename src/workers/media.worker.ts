import {
  AdtsOutputFormat,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  FlacOutputFormat,
  Input,
  MkvOutputFormat,
  MovOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  MpegTsOutputFormat,
  OggOutputFormat,
  Output,
  StreamTarget,
  WavOutputFormat,
  WebMOutputFormat,
  canEncodeAudio
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { registerFlacEncoder } from "@mediabunny/flac-encoder";
import { registerMp3Encoder } from "@mediabunny/mp3-encoder";
import type { MediaConversionOptions, MediaTrackInspection } from "../core/media/types";
import type { MediaPlan, MediaWorkerRequest, MediaWorkerResponse } from "../engines/media/protocol";

const scope=globalThis as unknown as {
  postMessage(message:MediaWorkerResponse):void;
  onmessage:((event:MessageEvent<MediaWorkerRequest>)=>void)|null;
};

const active=new Map<string,any>();
let encodersReady:Promise<void>|null=null;

function send(message:MediaWorkerResponse){ scope.postMessage(message); }

async function ensureEncoders(){
  if(encodersReady) return encodersReady;
  encodersReady=(async()=>{
    if(!(await canEncodeAudio("aac"))) registerAacEncoder();
    if(!(await canEncodeAudio("mp3"))) registerMp3Encoder();
    if(!(await canEncodeAudio("flac"))) registerFlacEncoder();
  })();
  return encodersReady;
}

function inputFor(source:Blob){
  return new Input({formats:ALL_FORMATS,source:new BlobSource(source)});
}

function formatFor(id:string):any {
  if(id==="mp4") return new Mp4OutputFormat();
  if(id==="mov") return new MovOutputFormat();
  if(id==="mkv") return new MkvOutputFormat();
  if(id==="webm-media") return new WebMOutputFormat();
  if(id==="ogg") return new OggOutputFormat();
  if(id==="mp3") return new Mp3OutputFormat();
  if(id==="wav") return new WavOutputFormat();
  if(id==="flac") return new FlacOutputFormat();
  if(id==="aac") return new AdtsOutputFormat();
  if(id==="mpegts") return new MpegTsOutputFormat();
  throw new Error("MEDIA_TARGET_UNSUPPORTED: Unknown media target "+id);
}

function isAudioOnlyTarget(id:string){
  return ["mp3","wav","flac","aac","ogg"].includes(id);
}

function cleanTags(tags:any,policy:MediaConversionOptions["metadataPolicy"]){
  if(policy==="preserve") return tags;
  if(policy==="strip") return {};
  return {
    title:tags?.title,
    artist:tags?.artist,
    album:tags?.album,
    albumArtist:tags?.albumArtist,
    trackNumber:tags?.trackNumber,
    tracksTotal:tags?.tracksTotal,
    discNumber:tags?.discNumber,
    discsTotal:tags?.discsTotal,
    genre:tags?.genre,
    images:tags?.images
  };
}

async function inspectTrack(track:any):Promise<MediaTrackInspection> {
  const common:MediaTrackInspection={
    type:track.type??"unknown",
    number:track.number??0,
    codec:await track.getCodec?.()??null,
    codecParameters:await track.getCodecParameterString?.()??null,
    language:await track.getLanguageCode?.()??"und",
    name:await track.getName?.()??null,
    bitrate:await track.getAverageBitrate?.()??await track.getBitrate?.()??null,
    disposition:await track.getDisposition?.()??{}
  };

  if(track.type==="video"){
    common.width=await track.getCodedWidth?.();
    common.height=await track.getCodedHeight?.();
    common.displayWidth=await track.getDisplayWidth?.();
    common.displayHeight=await track.getDisplayHeight?.();
    common.rotation=await track.getRotation?.()??0;
    common.frameRate=await track.getFrameRate?.()??null;
    common.colorSpace=await track.getColorSpace?.()??null;
  } else if(track.type==="audio"){
    common.sampleRate=await track.getSampleRate?.();
    common.channels=await track.getNumberOfChannels?.();
  }
  return common;
}

async function inspect(source:Blob){
  const input=inputFor(source);
  try {
    if(!(await input.canRead())) throw new Error("MEDIA_INVALID: Mediabunny could not recognize this media file.");
    const format=await input.getFormat();
    const tracks=await input.getTracks();
    const duration=await input.getDurationFromMetadata(tracks,{skipLiveWait:true}).catch(()=>null);
    const firstTimestamp=await input.getFirstTimestamp(tracks).catch(()=>null);
    const tags=await input.getMetadataTags?.().catch(()=>({}));
    const inspected=await Promise.all(tracks.map(track=>inspectTrack(track)));
    return {
      container:format.name,
      mimeType:await input.getMimeType().catch(()=>format.mimeType),
      duration,
      firstTimestamp,
      tracks:inspected,
      videoTracks:inspected.filter(t=>t.type==="video").length,
      audioTracks:inspected.filter(t=>t.type==="audio").length,
      subtitleTracks:inspected.filter(t=>t.type==="subtitle").length,
      metadataKeys:Object.keys(tags??{}).filter(key=>(tags as any)?.[key]!=null),
      engine:"Mediabunny 1.58.0",
      warnings:[]
    };
  } finally {
    input.dispose();
  }
}

function conversionOptions(input:any,targetId:string,options:MediaConversionOptions,output:any){
  const video:any={};
  const audio:any={};
  const trim=(options.trimStart!=null||options.trimEnd!=null)
    ? {start:options.trimStart,end:options.trimEnd}
    : undefined;

  if(isAudioOnlyTarget(targetId)||options.extractAudio) video.discard=true;
  else {
    if(options.maxWidth) video.width=options.maxWidth;
    if(options.maxHeight) video.height=options.maxHeight;
    if(options.maxWidth||options.maxHeight) video.fit="contain";
    if(options.frameRate) video.frameRate=options.frameRate;
    if(options.videoCodec) video.codec=options.videoCodec;
    if(options.videoBitrate) video.bitrate=options.videoBitrate;
    video.hardwareAcceleration=options.hardwareAcceleration;
  }

  if(options.audioCodec) audio.codec=options.audioCodec;
  if(options.audioBitrate) audio.bitrate=options.audioBitrate;

  return {
    input,
    output,
    tracks:options.tracks,
    video,
    audio,
    trim,
    copy:{mode:"preferred" as const,boundaryPolicy:"expand" as const},
    tags:(tags:any)=>cleanTags(tags,options.metadataPolicy),
    showWarnings:false
  };
}

async function applyTargetSize(input:any,options:MediaConversionOptions,targetId:string){
  if(!options.targetBytes) return options;
  const tracks=await input.getTracks();
  const duration=await input.getDurationFromMetadata(tracks,{skipLiveWait:true}).catch(()=>null);
  if(!duration||duration<=0) return options;

  const seconds=Math.max(0.1,(options.trimEnd??duration)-(options.trimStart??0));
  const total=Math.max(32_000,Math.floor(options.targetBytes*8/seconds));
  const hasVideo=(await input.getVideoTracks()).length>0 && !isAudioOnlyTarget(targetId) && !options.extractAudio;
  if(hasVideo){
    const audio=Math.min(options.audioBitrate??128_000,Math.floor(total*0.2));
    return {...options,audioBitrate:audio,videoBitrate:Math.max(100_000,total-audio)};
  }
  return {...options,audioBitrate:Math.max(32_000,total)};
}

async function plan(source:Blob,targetId:string,options:MediaConversionOptions):Promise<MediaPlan>{
  await ensureEncoders();
  const input=inputFor(source);
  try {
    if(!(await input.canRead())) throw new Error("MEDIA_INVALID: Input is not readable.");
    const output=new Output({format:formatFor(targetId),target:new BufferTarget()});
    const forced:any=conversionOptions(input,targetId,options,output);
    forced.copy={mode:"forced",shiftTolerance:0,boundaryPolicy:"expand"};
    const conversion=await Conversion.init(forced);
    const selected=(options.tracks==="primary"
      ? [await input.getPrimaryVideoTrack(),await input.getPrimaryAudioTrack()].filter(Boolean)
      : await input.getTracks()).filter((track:any)=>!(isAudioOnlyTarget(targetId)&&track.type==="video"));
    const copyable=conversion.utilizedTracks?.length??0;
    const mode=copyable>=selected.length?"remux":copyable>0?"partial-transcode":"transcode";
    const warnings=(conversion.discardedTracks??[]).map((entry:any)=>
      "Copy-only probe: "+String(entry.reason??"track cannot be copied")
    );
    await conversion.cancel().catch(()=>{});
    return {mode,copyableTracks:copyable,selectedTracks:selected.length,warnings};
  } finally { input.dispose(); }
}

async function convert(request:Extract<MediaWorkerRequest,{type:"convert"}>){
  await ensureEncoders();
  const input=inputFor(request.source);
  let writable:FileSystemWritableFileStream|null=null;
  try {
    if(!(await input.canRead())) throw new Error("MEDIA_INVALID: Input is not readable.");
    const adjusted=await applyTargetSize(input,request.options,request.targetFormatId);

    let target:any;
    let outputInWorkspace=false;
    if(request.outputHandle){
      writable=await request.outputHandle.createWritable();
      target=new StreamTarget(writable,{chunked:true,chunkSize:8*1024*1024});
      outputInWorkspace=true;
    } else {
      target=new BufferTarget();
    }

    const outputFormat=formatFor(request.targetFormatId);
    const output=new Output({format:outputFormat,target});
    const conversion=await Conversion.init(conversionOptions(input,request.targetFormatId,adjusted,output));
    active.set(request.jobId,conversion);

    if(!conversion.isValid){
      const reasons=(conversion.discardedTracks??[]).map((entry:any)=>String(entry.reason??"unsupported track"));
      throw new Error("MEDIA_CONVERSION_INVALID: "+(reasons.join("; ")||"No valid local codec route is available."));
    }

    conversion.onProgress=(progress:number,processedTime:number)=>{
      send({type:"progress",requestId:request.requestId,progress,processedTime,stage:"Converting media locally"});
    };

    await conversion.execute();

    const discarded=(conversion.discardedTracks??[]);
    const warnings=discarded.map((entry:any)=>"Discarded track: "+String(entry.reason??"unsupported"));
    let blob:Blob;
    if(request.outputHandle){
      blob=await request.outputHandle.getFile();
    } else {
      const buffer=(target as BufferTarget).buffer;
      if(!buffer) throw new Error("MEDIA_OUTPUT_EMPTY: Conversion produced no output buffer.");
      blob=new Blob([buffer],{type:(outputFormat as any).mimeType??"application/octet-stream"});
    }
    return {
      blob,
      warnings,
      details:{
        discardedTracks:discarded.length,
        targetBytes:adjusted.targetBytes??null
      },
      outputInWorkspace
    };
  } finally {
    active.delete(request.jobId);
    input.dispose();
  }
}

scope.onmessage=async(event:MessageEvent<MediaWorkerRequest>)=>{
  const request=event.data;
  if(request.type==="cancel"){
    const conversion=active.get(request.jobId);
    if(conversion) {
      await conversion.cancel().catch(()=>{});
    }
    return;
  }

  try {
    if(request.type==="inspect"){
      const inspection=await inspect(request.source);
      send({type:"inspection",requestId:request.requestId,inspection});
    } else if(request.type==="plan"){
      const result=await plan(request.source,request.targetFormatId,request.options);
      send({type:"plan",requestId:request.requestId,plan:result});
    } else {
      const result=await convert(request);
      send({type:"result",requestId:request.requestId,...result});
    }
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    if(/cancel/i.test(message)) send({type:"cancelled",requestId:request.requestId});
    else send({type:"error",requestId:request.requestId,code:message.split(":")[0]||"MEDIA_ENGINE_FAILED",message});
  }
};
