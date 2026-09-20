import { describe,expect,it } from "vitest";
import { parseFitsHeader } from "../src/core/specialist/fits";
import { parseMesh,writeMesh } from "../src/core/specialist/mesh";
import { findLargestEmbeddedJpeg } from "../src/core/specialist/rawPreview";
import { parseSubtitle,serializeSubtitle } from "../src/core/specialist/subtitles";

describe("Phase 7 specialist primitives",()=>{
  it("converts subtitle cue timing and text between SRT and WebVTT",()=>{
    const source="1\n00:00:01,250 --> 00:00:03,500\nHello\nworld\n";
    const cues=parseSubtitle(source,"srt");
    expect(cues).toEqual([{startMs:1250,endMs:3500,text:"Hello\nworld"}]);
    const vtt=serializeSubtitle(cues,"vtt");
    expect(vtt).toContain("WEBVTT");
    expect(parseSubtitle(vtt,"vtt")).toEqual(cues);
  });

  it("reduces ASS dialogue override tags to readable cue text",()=>{
    const ass=[
      "[Script Info]","ScriptType: v4.00+","","[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\b1}Hello\\Nworld"
    ].join("\n");
    expect(parseSubtitle(ass,"ass")[0]).toMatchObject({startMs:1000,endMs:2500,text:"Hello\nworld"});
  });

  it("round-trips triangle geometry across OBJ, STL, and PLY",()=>{
    const obj=new TextEncoder().encode("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    const mesh=parseMesh(obj,"obj");
    expect(mesh.vertices).toHaveLength(3);
    expect(mesh.triangles).toEqual([[0,1,2]]);

    const stl=writeMesh(mesh,"stl");
    expect(parseMesh(stl,"stl").triangles).toHaveLength(1);

    const ply=writeMesh(mesh,"ply");
    expect(parseMesh(ply,"ply").triangles).toEqual([[0,1,2]]);
  });

  it("selects the largest complete embedded JPEG preview",()=>{
    const a=new Uint8Array([0xff,0xd8,0xff,1,2,0xff,0xd9]);
    const b=new Uint8Array([0xff,0xd8,0xff,1,2,3,4,5,6,0xff,0xd9]);
    const source=new Uint8Array(5+a.length+7+b.length+2);
    source.set(a,5);source.set(b,5+a.length+7);
    const result=findLargestEmbeddedJpeg(source);
    expect(result?.length).toBe(b.length);
    expect(result?.bytes).toEqual(b);
  });

  it("parses FITS cards without reading the scientific payload",()=>{
    const cards=[
      "SIMPLE  =                    T / conforms to FITS standard",
      "BITPIX  =                   16 / array data type",
      "NAXIS   =                    2",
      "END"
    ].map(card=>card.padEnd(80," ")).join("");
    const parsed=parseFitsHeader(new TextEncoder().encode(cards));
    expect(parsed.map(card=>card.key)).toEqual(["SIMPLE","BITPIX","NAXIS"]);
    expect(parsed[1].value).toBe("16");
  });
});
