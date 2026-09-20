export type MediaMetadataPolicy = "preserve" | "privacy" | "strip";
export type TrackPolicy = "all" | "primary";

export interface MediaTrackInspection {
  type:"video"|"audio"|"subtitle"|"unknown";
  number:number;
  codec:string|null;
  codecParameters:string|null;
  language:string;
  name:string|null;
  bitrate:number|null;
  disposition:Record<string,boolean>;
  width?:number;
  height?:number;
  displayWidth?:number;
  displayHeight?:number;
  rotation?:number;
  frameRate?:number|null;
  sampleRate?:number;
  channels?:number;
  colorSpace?:Record<string,unknown>|null;
}

export interface DetailedMediaInspection {
  container:string;
  mimeType:string;
  duration:number|null;
  firstTimestamp:number|null;
  tracks:MediaTrackInspection[];
  videoTracks:number;
  audioTracks:number;
  subtitleTracks:number;
  metadataKeys:string[];
  engine:string;
  warnings:string[];
}

export interface MediaConversionOptions {
  tracks:TrackPolicy;
  metadataPolicy:MediaMetadataPolicy;
  trimStart?:number;
  trimEnd?:number;
  maxWidth?:number;
  maxHeight?:number;
  frameRate?:number;
  videoCodec?:string;
  audioCodec?:string;
  videoBitrate?:number;
  audioBitrate?:number;
  targetBytes?:number;
  extractAudio?:boolean;
  hardwareAcceleration:"no-preference"|"prefer-hardware"|"prefer-software";
}
