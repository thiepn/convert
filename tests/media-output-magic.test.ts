import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { MediaOutputValidator } from "../src/core/validation/Validator";

function probe(container:string){
  return async()=>({
    container,
    mimeType:null,
    duration:1,
    firstTimestamp:0,
    tracks:[{type:"audio",number:0,codec:null,codecParameters:null,language:"und",name:null,bitrate:null,disposition:{}}],
    videoTracks:0,
    audioTracks:1,
    subtitleTracks:0,
    metadataKeys:[],
    engine:"test",
    warnings:[]
  } as any);
}

describe("audio output magic validation",()=>{
  it("rejects RIFF/WAV bytes labeled as FLAC",async()=>{
    const bytes=new Uint8Array(32);
    bytes.set(new TextEncoder().encode("RIFF"),0);
    bytes.set(new TextEncoder().encode("WAVE"),8);
    const validator=new MediaOutputValidator(createDefaultFormatRegistry(),probe("WAV"));
    const result=await validator.validate(new Blob([bytes]),"flac");
    expect(result.valid).toBe(false);
    expect(result.errors.some(error=>/magic bytes/i.test(error))).toBe(true);
  });

  it("does not add a FLAC magic error for FLAC bytes",async()=>{
    const bytes=new Uint8Array([0x66,0x4c,0x61,0x43,0,0,0,0]);
    const validator=new MediaOutputValidator(createDefaultFormatRegistry(),probe("FLAC"));
    const result=await validator.validate(new Blob([bytes]),"flac");
    expect(result.errors.some(error=>/magic bytes/i.test(error))).toBe(false);
  });
});
