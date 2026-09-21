import { describe,expect,it } from "vitest";
import type { ConversionEngine,EngineConvertResult } from "../src/core/engines/Engine";
import { EngineRegistry } from "../src/core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { JobManager } from "../src/core/jobs/JobManager";
import { ConversionGraph } from "../src/core/planner/ConversionGraph";
import { ConversionPlanner } from "../src/core/planner/ConversionPlanner";
import type { OutputValidator } from "../src/core/validation/Validator";

function sourcePng():File{
  const bytes=new Uint8Array([
    137,80,78,71,13,10,26,10,
    0,0,0,13,73,72,68,82,
    0,0,0,1,0,0,0,1,
    8,6,0,0,0,0,0,0,0,
    0,0,0,0,73,69,78,68,174,66,96,130
  ]);
  return new File([bytes],"pixel.png",{type:"image/png"});
}

function engine(
  id:string,
  convert:()=>Promise<EngineConvertResult>
):ConversionEngine{
  return {
    id,version:"test",
    isAvailable:()=>true,
    canConvert:(from,to)=>from==="png"&&to==="jpeg",
    estimate:async()=>({
      temporaryBytes:1,memoryBytes:1,workspaceBytes:1,outputBytes:4,
      sourceAccess:"buffered",outputAccess:"buffered",notes:[]
    }),
    convert,
    dispose:()=>{}
  };
}

function setup(
  primary:()=>Promise<EngineConvertResult>,
  fallback:()=>Promise<EngineConvertResult>,
  validator:OutputValidator
){
  const formats=createDefaultFormatRegistry();
  const engines=new EngineRegistry();
  engines.register(engine("primary",primary));
  engines.register(engine("fallback",fallback));
  const graph=new ConversionGraph([
    {
      from:"png",to:"jpeg",engineId:"primary",
      qualityLoss:0,metadataLoss:[],temporaryMultiplier:1,
      streaming:false,baseCost:0,mode:"neutral",rootOnly:true
    },
    {
      from:"png",to:"jpeg",engineId:"fallback",
      qualityLoss:0,metadataLoss:[],temporaryMultiplier:1,
      streaming:false,baseCost:100,mode:"neutral",rootOnly:true
    }
  ]);
  const planner=new ConversionPlanner(graph,formats,engines);
  return new JobManager(formats,engines,planner,validator);
}

describe("direct conversion recovery",()=>{
  it("recovers from a primary engine crash with a same-mode alternate engine",async()=>{
    let fallbackCalls=0;
    const jobs=setup(
      async()=>{throw new Error("WORKER_CRASH: primary worker terminated");},
      async()=>{
        fallbackCalls++;
        return {blob:new Blob([new Uint8Array([0xff,0xd8,0xff,0xd9])],{type:"image/jpeg"})};
      },
      {
        validate:async()=>({valid:true,errors:[],properties:{}})
      }
    );

    const output=await jobs.convert(sourcePng(),"jpeg",.82);
    expect(fallbackCalls).toBe(1);
    expect(output.warnings.some(warning=>/alternate certified local engine/i.test(warning))).toBe(true);
  });

  it("recovers when the primary output fails independent validation",async()=>{
    let fallbackCalls=0;
    const jobs=setup(
      async()=>({blob:new Blob(["bad"],{type:"image/jpeg"})}),
      async()=>{
        fallbackCalls++;
        return {blob:new Blob(["good"],{type:"image/jpeg"})};
      },
      {
        validate:async blob=>{
          const text=await blob.text();
          return {valid:text==="good",errors:text==="good"?[]:["synthetic invalid output"],properties:{}};
        }
      }
    );

    const output=await jobs.convert(sourcePng(),"jpeg",.82);
    expect(fallbackCalls).toBe(1);
    expect(await output.blob.text()).toBe("good");
    expect(output.warnings.some(warning=>/failed independent validation/i.test(warning))).toBe(true);
  });
});
