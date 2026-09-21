import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { DataOutputValidator } from "../src/core/validation/Validator";

describe("local JSON output validation",()=>{
  it("validates JSON without requiring the DuckDB probe",async()=>{
    const formats=createDefaultFormatRegistry();
    let probeCalls=0;
    const validator=new DataOutputValidator(
      formats,
      async()=>{
        probeCalls++;
        throw new Error("DuckDB should not be needed for JSON validation.");
      }
    );

    const blob=new Blob([
      JSON.stringify([
        {keyword:"SIMPLE",value:"T"},
        {keyword:"OBJECT",value:"Maintenance smoke"}
      ])
    ],{type:"application/json"});

    const result=await validator.validate(blob,"json-data");

    expect(result.valid).toBe(true);
    expect(result.properties.rows).toBe(2);
    expect(result.properties.columns).toBe(2);
    expect(probeCalls).toBe(0);
  });

  it("rejects malformed JSON locally",async()=>{
    const formats=createDefaultFormatRegistry();
    const validator=new DataOutputValidator(
      formats,
      async()=>{throw new Error("probe should not run");}
    );
    const blob=new Blob(["[{broken"],{type:"application/json"});
    const result=await validator.validate(blob,"json-data");
    expect(result.valid).toBe(false);
    expect(result.errors.some(error=>/JSON/i.test(error))).toBe(true);
  });
});
