import { describe,expect,it } from "vitest";
import { detectTextEncoding,readTextBlob } from "../src/core/text/decodeText";
import { parseJsonTabular } from "../src/core/data/jsonBridge";

function bytes(values:number[]):ArrayBuffer{
  const array=new Uint8Array(values);
  const copy=new ArrayBuffer(array.byteLength);
  new Uint8Array(copy).set(array);
  return copy;
}

function utf16le(value:string):Blob{
  const encoded=new Uint8Array(value.length*2+2);
  encoded[0]=0xff;encoded[1]=0xfe;
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    encoded[2+i*2]=code&0xff;
    encoded[3+i*2]=code>>>8;
  }
  const copy=new ArrayBuffer(encoded.byteLength);
  new Uint8Array(copy).set(encoded);
  return new Blob([copy]);
}

describe("text input decoding",()=>{
  it("detects and decodes UTF-16LE with BOM",async()=>{
    const blob=utf16le("name;city\r\nAlpha;Köln\r\n");
    expect(await detectTextEncoding(blob)).toBe("utf-16le");
    expect((await readTextBlob(blob)).text).toContain("Alpha;Köln");
  });

  it("strips UTF-8 BOM from JSON bridge inputs",()=>{
    const parsed=parseJsonTabular("\uFEFF[{\"name\":\"한글\"}]",false);
    expect(parsed.rows[0].name).toBe("한글");
  });

  it("keeps ordinary UTF-8 unchanged",async()=>{
    const blob=new Blob([bytes([0x61,0x62,0x63])]);
    expect(await detectTextEncoding(blob)).toBe("utf-8");
    expect((await readTextBlob(blob)).text).toBe("abc");
  });
});
