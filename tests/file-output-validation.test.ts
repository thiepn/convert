import { describe,expect,it } from "vitest";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { SpecialistOutputValidator } from "../src/core/validation/Validator";

describe("OPFS-backed File output validation",()=>{
  it("validates a real File without attempting to overwrite its readonly name",async()=>{
    const formats=createDefaultFormatRegistry();
    const validator=new SpecialistOutputValidator(formats);
    const output=new File([
      "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello\n"
    ],"engine-output.vtt",{type:"text/vtt"});

    const result=await validator.validate(output,"vtt");

    expect(result.valid).toBe(true);
    expect(output.name).toBe("engine-output.vtt");
  });
});
