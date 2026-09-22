import { describe,expect,it } from "vitest";
import { detectDelimitedTextSeparator } from "../src/core/data/delimiter";

describe("quote-aware delimiter detection",()=>{
  it("detects semicolon CSV even with quoted commas and embedded newlines",()=>{
    const text=[
      "name;note;amount",
      "\"Alpha, Inc\";\"line one",
      "line two\";12.5",
      "München;\"quoted, comma\";7"
    ].join("\r\n");
    expect(detectDelimitedTextSeparator(text)).toBe(";");
  });

  it("detects comma and tab inputs",()=>{
    expect(detectDelimitedTextSeparator("a,b,c\n1,2,3\n4,5,6\n")).toBe(",");
    expect(detectDelimitedTextSeparator("a\tb\tc\n1\t2\t3\n")).toBe("\t");
  });

  it("ignores candidate characters inside quoted fields",()=>{
    expect(detectDelimitedTextSeparator('a|b|c\n"x,y;z"|2|3\n')).toBe("|");
  });
});
