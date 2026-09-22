import { describe,expect,it } from "vitest";
import type { ConversionEngine,EngineConvertResult } from "../src/core/engines/Engine";
import { EngineRegistry } from "../src/core/engines/EngineRegistry";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import { JobManager } from "../src/core/jobs/JobManager";
import { ConversionGraph } from "../src/core/planner/ConversionGraph";
import { ConversionPlanner } from "../src/core/planner/ConversionPlanner";

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
  convert:()=>Promise<EngineConvertResult>,
  dispose:()=>void=()=>{}
):ConversionEngine{
  return {
    id,
    version:"test",
    isAvailable:()=>true,
    canConvert:(from,to)=>from==="png"&&to==="jpeg",
    estimate:async()=>({
      temporaryBytes:1,memoryBytes:1,workspaceBytes:1,outputBytes:4,
      sourceAccess:"buffered",outputAccess:"buffered",notes:[]
    }),
    convert,
    dispose
  };
}

describe("long-session resource lifecycle",()=>{
  it("continues disposing later engines when one teardown throws",()=>{
    const registry=new EngineRegistry();
    let disposed=false;
    registry.register(engine("bad",async()=>({blob:new Blob()}),()=>{
      throw new Error("synthetic teardown failure");
    }));
    registry.register(engine("good",async()=>({blob:new Blob()}),()=>{
      disposed=true;
    }));

    const warn=console.warn;
    console.warn=()=>{};
    try{registry.dispose();}
    finally{console.warn=warn;}

    expect(disposed).toBe(true);
  });

  it("invalidates an in-flight result that ignores abort after lifecycle disposal",async()=>{
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});

    const formats=createDefaultFormatRegistry();
    const engines=new EngineRegistry();
    engines.register(engine("slow",async()=>{
      await gate;
      return {
        blob:new Blob([new Uint8Array([0xff,0xd8,0xff,0xd9])],{type:"image/jpeg"})
      };
    }));
    const graph=new ConversionGraph([{
      from:"png",to:"jpeg",engineId:"slow",
      qualityLoss:0,metadataLoss:[],temporaryMultiplier:1,
      streaming:false,baseCost:0,mode:"neutral",rootOnly:true
    }]);
    const planner=new ConversionPlanner(graph,formats,engines);
    const jobs=new JobManager(formats,engines,planner,{
      validate:async()=>({valid:true,errors:[],properties:{}})
    });

    const conversion=jobs.convert(sourcePng(),"jpeg",.82);
    await Promise.resolve();
    expect(jobs.activeJobCount()).toBe(1);

    jobs.dispose();
    release();

    await expect(conversion).rejects.toThrow(/lifecycle disposal/i);
    expect(jobs.activeJobCount()).toBe(0);
    expect(jobs.retainedWorkspaceCount()).toBe(0);
  });
});
