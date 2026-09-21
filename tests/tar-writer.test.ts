import { describe,expect,it } from "vitest";
import { createUstar,createUstarHeader } from "../src/core/archive/tar";

describe("USTAR writer",()=>{
  it("writes a standards-identifiable header and padded archive",async()=>{
    const blob=new Blob(["hello archive\n"]);
    const tar=await createUstar([{blob,path:"hello.txt",lastModified:0}]);
    const bytes=new Uint8Array(await tar.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0,9))).toBe("hello.txt");
    expect(new TextDecoder().decode(bytes.slice(257,262))).toBe("ustar");
    expect(bytes.byteLength%512).toBe(0);
    expect(bytes.byteLength).toBe(2048);
  });

  it("supports USTAR prefix paths",()=>{
    const path="folder/".repeat(12)+"file.txt";
    const header=createUstarHeader({blob:new Blob(["x"]),path,lastModified:0});
    expect(new TextDecoder().decode(header.slice(257,262))).toBe("ustar");
    expect(header[345]).not.toBe(0);
  });

  it("rejects paths that USTAR cannot represent safely",()=>{
    expect(()=>createUstarHeader({
      blob:new Blob(["x"]),
      path:"x".repeat(260),
      lastModified:0
    })).toThrow(/TAR_PATH_TOO_LONG/);
  });
});
