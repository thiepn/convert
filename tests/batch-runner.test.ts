import { describe,expect,it } from "vitest";
import { BatchRunner } from "../src/core/batch/BatchRunner";
import { buildBatchPipeline } from "../src/core/batch/pipeline";
import { createDefaultFormatRegistry } from "../src/core/formats/defaultFormats";
import type { JobSnapshot } from "../src/core/jobs/types";
import type { ConversionPlanner } from "../src/core/planner/ConversionPlanner";
import type { JobManager } from "../src/core/jobs/JobManager";

function subtitleFile(name:string,text="1\n00:00:01,000 --> 00:00:02,000\nHello\n"):File{
  return new File([text],name,{type:"application/x-subrip"});
}

describe("Phase 8 BatchRunner",()=>{
  it("isolates failures, preserves successes, retries failed tasks, and deduplicates names",async()=>{
    const formats=createDefaultFormatRegistry();
    const planner={
      plan:()=>({
        edges:[{
          from:"srt",to:"vtt",engineId:"subtitle-compat",qualityLoss:0,
          metadataLoss:[],temporaryMultiplier:1,streaming:false
        }],
        score:1,
        warnings:[]
      })
    } as unknown as ConversionPlanner;

    const attempts=new Map<string,number>();
    const jobs={
      cancelAll:()=>{},
      convert:async(
        source:File,
        target:string,
        _quality:number,
        _options:Record<string,unknown>,
        onUpdate?:(snapshot:JobSnapshot)=>void
      )=>{
        const count=(attempts.get(source.name)??0)+1;
        attempts.set(source.name,count);
        onUpdate?.({id:source.name,state:"RUNNING",progress:.5,stage:"Converting"});
        if(source.name==="fail.srt"&&count===1) throw new Error("synthetic failure");
        onUpdate?.({id:source.name,state:"COMPLETED",progress:1,stage:"Complete"});
        return {
          blob:new Blob(["WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n"],{type:"text/vtt"}),
          fileName:"unused."+target,
          formatId:target,
          jobId:source.name,
          warnings:[]
        };
      }
    } as unknown as JobManager;

    const runner=new BatchRunner(formats,planner,jobs);
    const pipeline=buildBatchPipeline({
      targetFormatId:"vtt",
      quality:1,
      options:{},
      namingTemplate:"output",
      executionMode:"sequential",
      packageResults:false
    });

    const first=await runner.start([
      subtitleFile("ok.srt"),
      subtitleFile("fail.srt")
    ],pipeline);

    expect(first.outputs).toHaveLength(1);
    expect(first.failures).toEqual([{name:"fail.srt",error:"synthetic failure"}]);
    expect(first.outputs[0].fileName).toBe("output.vtt");
    expect(runner.hasResumable()).toBe(true);

    const resumed=await runner.resume(undefined,true);
    expect(resumed.failures).toEqual([]);
    expect(resumed.outputs.map(output=>output.fileName)).toEqual(["output.vtt","output-2.vtt"]);
    expect(resumed.tasks.every(task=>task.state==="completed")).toBe(true);
    expect(runner.hasResumable()).toBe(false);
  });

  it("does not offer deterministic runtime failures for retry",async()=>{
    const formats=createDefaultFormatRegistry();
    const planner={
      plan:()=>({
        edges:[{
          from:"srt",to:"vtt",engineId:"subtitle-compat",qualityLoss:0,
          metadataLoss:[],temporaryMultiplier:1,streaming:false
        }],
        score:1,
        warnings:[]
      })
    } as unknown as ConversionPlanner;
    const jobs={
      cancelAll:()=>{},
      convert:async()=>{throw new Error("OUTPUT_INVALID: synthetic invalid output");}
    } as unknown as JobManager;
    const runner=new BatchRunner(formats,planner,jobs);

    const result=await runner.start(
      [subtitleFile("broken.srt")],
      buildBatchPipeline({
        targetFormatId:"vtt",
        quality:1,
        options:{},
        executionMode:"sequential",
        packageResults:false
      })
    );

    expect(result.tasks[0].state).toBe("failed");
    expect(result.tasks[0].retryable).toBe(false);
    expect(result.tasks[0].stage).toMatch(/needs changes/i);
    expect(runner.hasResumable()).toBe(false);
  });

  it("does not offer deterministic planning failures for retry",async()=>{
    const formats=createDefaultFormatRegistry();
    const planner={
      plan:()=>{throw new Error("no route");}
    } as unknown as ConversionPlanner;
    const jobs={cancelAll:()=>{}} as unknown as JobManager;
    const runner=new BatchRunner(formats,planner,jobs);

    const result=await runner.start(
      [subtitleFile("x.srt")],
      buildBatchPipeline({
        targetFormatId:"vtt",
        quality:1,
        options:{},
        executionMode:"sequential",
        packageResults:false
      })
    );

    expect(result.tasks[0].state).toBe("failed");
    expect(result.tasks[0].stage).toBe("Cannot plan");
    expect(runner.hasResumable()).toBe(false);
  });
});
