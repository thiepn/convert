import { describe,expect,it } from "vitest";
import { jsonTextToCsv,parseJsonTabular } from "../src/core/data/jsonBridge";

describe("local JSON tabular bridge",()=>{
  it("turns JSON arrays into CSV without external extensions",()=>{
    const csv=jsonTextToCsv(JSON.stringify([
      {name:"alpha",amount:2},
      {name:"beta",amount:7}
    ]),false);
    expect(csv).toContain("name,amount");
    expect(csv).toContain("alpha,2");
    expect(csv).toContain("beta,7");
  });

  it("serializes nested values safely and unions columns",()=>{
    const parsed=parseJsonTabular(JSON.stringify([
      {a:1,nested:{x:true}},
      {b:"two"}
    ]),false);
    expect(parsed.columns).toEqual(["a","nested","b"]);
    const csv=jsonTextToCsv(JSON.stringify([
      {a:1,nested:{x:true}},
      {b:"two"}
    ]),false);
    expect(csv).toContain('"{""x"":true}"');
  });

  it("supports JSON Lines and primitive rows",()=>{
    const csv=jsonTextToCsv('{"a":1}\n42\n',true);
    expect(csv).toContain("a,value,row_index");
    expect(csv).toContain("42,1");
  });
});
