import { describe,expect,it } from "vitest";
import { buildBatchPipeline,sanitizePipelineForStorage } from "../src/core/batch/pipeline";

describe("Phase 8 pipeline compilation",()=>{
  it("turns existing conversion options into explicit ordered steps",()=>{
    const pipeline=buildBatchPipeline({
      targetFormatId:"webp",
      quality:.82,
      namingTemplate:"{name}-{index:02}",
      executionMode:"auto",
      packageResults:true,
      options:{
        maxDimension:1920,
        metadataPolicy:"privacy",
        targetBytes:2*1024*1024
      }
    });

    expect(pipeline.steps.map(step=>step.kind)).toEqual([
      "resize","compress","metadata","quality","convert","package"
    ]);
    expect(pipeline.namingTemplate).toBe("{name}-{index:02}");
  });

  it("represents spreadsheet selection and local query stages",()=>{
    const pipeline=buildBatchPipeline({
      targetFormatId:"parquet",
      quality:1,
      options:{
        sheetPolicy:"selected",
        selectedSheet:"Data",
        query:"SELECT * FROM data WHERE amount > 0"
      },
      packageResults:false
    });
    expect(pipeline.steps.map(step=>step.kind)).toEqual([
      "select-sheet","filter","convert"
    ]);
  });

  it("strips secrets and browser file resources from stored pipeline data",()=>{
    const pipeline=buildBatchPipeline({
      targetFormatId:"zip",
      quality:.82,
      options:{
        inputPassword:"secret",
        outputPassword:"secret2",
        resources:[{name:"x"}],
        compressionLevel:6
      }
    });
    const stored=sanitizePipelineForStorage(pipeline);
    expect(stored.options.inputPassword).toBeUndefined();
    expect(stored.options.outputPassword).toBeUndefined();
    expect(stored.options.resources).toBeUndefined();
    expect(stored.options.compressionLevel).toBe(6);
  });
});
