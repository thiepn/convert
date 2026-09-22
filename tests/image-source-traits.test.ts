import { describe,expect,it } from "vitest";
import { inspectCommonImageSourceTraits } from "../src/core/image/sourceTraits";

function owned(values:number[]):ArrayBuffer{
  const buffer=new ArrayBuffer(values.length);
  new Uint8Array(buffer).set(values);
  return buffer;
}

function pngChunk(type:string,data:number[]=[]):number[]{
  const length=data.length;
  return [
    (length>>>24)&255,(length>>>16)&255,(length>>>8)&255,length&255,
    ...[...type].map(char=>char.charCodeAt(0)),
    ...data,
    0,0,0,0
  ];
}

function png(chunks:Array<[string,number[]?]>):Blob{
  const bytes=[
    137,80,78,71,13,10,26,10,
    ...chunks.flatMap(([type,data])=>pngChunk(type,data??[]))
  ];
  return new Blob([owned(bytes)],{type:"image/png"});
}

describe("common image source traits",()=>{
  it("recognizes a plain static PNG as metadata-free",async()=>{
    const traits=await inspectCommonImageSourceTraits(
      png([["IHDR",new Array(13).fill(0)],["IDAT",[]],["IEND",[]]]),
      "png"
    );
    expect(traits).toEqual({metadata:false,animation:false,known:true});
  });

  it("detects PNG metadata and animation control chunks",async()=>{
    const traits=await inspectCommonImageSourceTraits(
      png([
        ["IHDR",new Array(13).fill(0)],
        ["tEXt",[]],
        ["acTL",new Array(8).fill(0)],
        ["IDAT",[]],
        ["IEND",[]]
      ]),
      "png"
    );
    expect(traits).toEqual({metadata:true,animation:true,known:true});
  });

  it("treats structurally incomplete containers as unknown",async()=>{
    const traits=await inspectCommonImageSourceTraits(
      png([["IHDR",new Array(13).fill(0)]]),
      "png"
    );
    expect(traits?.known).toBe(false);
  });
});
