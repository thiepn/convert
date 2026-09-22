import { FormatRegistry } from "../formats/FormatRegistry";
import { inspectFile } from "../inspection/inspectFile";
import { JobManager } from "../jobs/JobManager";
import type { ConversionOutput,JobSnapshot } from "../jobs/types";
import { ConversionPlanner } from "../planner/ConversionPlanner";
import { getDeviceProfile } from "../performance/DeviceProfile";
import { isRetryableIssue } from "../ux/errors";
import { recommendedBatchParallelism } from "../performance/Budget";
import { renderBatchName,uniqueBatchName } from "./naming";
import type {
  BatchFailure,
  BatchPipeline,
  BatchRunResult,
  BatchSnapshot,
  BatchTaskSnapshot
} from "./types";

const EXCLUSIVE_ENGINES=new Set([
  "libreoffice-document","ffmpeg-legacy","mediabunny","vips-image","pdf-engine",
  "pandoc-document","pdf-reconstruction","archive-engine","sheetjs-spreadsheet","duckdb-data","sqlite-data",
  "psd-layered","font-compat","raw-preview","mesh-compat"
]);

interface Session {
  files:File[];
  pipeline:BatchPipeline;
  tasks:BatchTaskSnapshot[];
  outputs:Map<number,ConversionOutput>;
  usedNames:Set<string>;
}

function cloneTask(task:BatchTaskSnapshot):BatchTaskSnapshot {
  return {...task,warnings:[...task.warnings]};
}

export class BatchRunner {
  private session:Session|null=null;
  private stopRequested=false;
  private activeExecution:Promise<BatchRunResult>|null=null;

  constructor(
    private readonly formats:FormatRegistry,
    private readonly planner:ConversionPlanner,
    private readonly jobs:JobManager
  ) {}

  hasResumable():boolean {
    return Boolean(this.session?.tasks.some(task=>
      task.state==="cancelled"
      ||task.state==="pending"
      ||(task.state==="failed"&&task.retryable!==false)
    ));
  }

  cancel():void {
    this.stopRequested=true;
    this.jobs.cancelAll();
  }

  async start(
    files:File[],
    pipeline:BatchPipeline,
    onUpdate?:(snapshot:BatchSnapshot)=>void
  ):Promise<BatchRunResult>{
    await this.releaseSession();
    this.stopRequested=false;

    const tasks:BatchTaskSnapshot[]=files.map((file,index)=>({
      id:crypto.randomUUID(),
      index,
      sourceName:file.name,
      sourceFormatId:null,
      state:"pending",
      progress:0,
      stage:"Queued",
      attempts:0,
      warnings:[],
      exclusive:true
    }));

    this.session={
      files:[...files],
      pipeline,
      tasks,
      outputs:new Map(),
      usedNames:new Set()
    };

    const execution=(async()=>{
      await this.prepareTasks(this.session!,onUpdate);
      return this.execute(this.session!,onUpdate);
    })();
    this.activeExecution=execution;
    try{
      return await execution;
    }finally{
      if(this.activeExecution===execution) this.activeExecution=null;
    }
  }

  async resume(
    onUpdate?:(snapshot:BatchSnapshot)=>void,
    retryFailed=true
  ):Promise<BatchRunResult>{
    if(this.activeExecution){
      throw new Error("BATCH_ALREADY_RUNNING: A batch execution is already active.");
    }
    const session=this.session;
    if(!session) throw new Error("BATCH_NOT_RESUMABLE: No batch session exists.");

    this.stopRequested=false;
    for(const task of session.tasks){
      if(
        task.state==="cancelled"
        ||task.state==="pending"
        ||(retryFailed&&task.state==="failed"&&task.retryable!==false)
      ){
        task.state="pending";
        task.progress=0;
        task.stage="Queued for resume";
        task.error=undefined;
        task.retryable=undefined;
      }
    }
    const execution=this.execute(session,onUpdate);
    this.activeExecution=execution;
    try{
      return await execution;
    }finally{
      if(this.activeExecution===execution) this.activeExecution=null;
    }
  }

  async releaseSession():Promise<void>{
    if(this.activeExecution){
      this.cancel();
      try{await this.activeExecution;}catch{}
    }
    const session=this.session;
    this.session=null;
    if(!session) return;
    await Promise.allSettled(
      [...session.outputs.values()].map(async output=>{
        try{await output.release?.();}catch{}
      })
    );
  }

  private async prepareTasks(session:Session,onUpdate?:(snapshot:BatchSnapshot)=>void){
    for(const task of session.tasks){
      if(this.stopRequested){
        task.state="cancelled";
        task.progress=0;
        task.stage="Cancelled before planning";
        onUpdate?.(this.snapshot(session));
        continue;
      }
      try{
        const file=session.files[task.index];
        const inspection=await inspectFile(file,this.formats);
        const source=inspection.detection.format;
        if(!source) throw new Error("FORMAT_UNKNOWN: File format could not be identified.");
        task.sourceFormatId=source.id;
        const routePreference=session.pipeline.options.routePreference==="semantic"
          ||session.pipeline.options.routePreference==="fidelity"
          ?session.pipeline.options.routePreference
          :undefined;
        const route=this.planner.plan(source.id,session.pipeline.targetFormatId,routePreference);
        task.exclusive=route.edges.some(edge=>EXCLUSIVE_ENGINES.has(edge.engineId));
        task.warnings.push(...route.warnings.map(warning=>warning.message));
        task.stage="Ready";
      }catch(error){
        task.state="failed";
        task.progress=1;
        task.stage="Cannot plan";
        task.error=error instanceof Error?error.message:String(error);
        task.retryable=false;
      }
      onUpdate?.(this.snapshot(session));
    }
  }

  private parallelLimit(session:Session):number {
    if(session.pipeline.executionMode==="sequential") return 1;
    return recommendedBatchParallelism(getDeviceProfile());
  }

  private canLaunch(task:BatchTaskSnapshot,running:Map<number,Promise<void>>,session:Session):boolean {
    const limit=this.parallelLimit(session);
    if(running.size>=limit) return false;
    if(task.exclusive) return running.size===0;
    for(const index of running.keys()){
      if(session.tasks[index].exclusive) return false;
    }
    return true;
  }

  private async execute(session:Session,onUpdate?:(snapshot:BatchSnapshot)=>void):Promise<BatchRunResult>{
    const running=new Map<number,Promise<void>>();
    onUpdate?.(this.snapshot(session));

    while(true){
      if(this.stopRequested){
        for(const task of session.tasks){
          if(task.state==="pending"){
            task.state="cancelled";
            task.progress=0;
            task.stage="Cancelled before start";
          }
        }
      }

      let launched=false;
      if(!this.stopRequested){
        for(const task of session.tasks){
          if(task.state!=="pending") continue;
          if(!this.canLaunch(task,running,session)) continue;
          const promise=this.runTask(session,task,onUpdate)
            .finally(()=>running.delete(task.index));
          running.set(task.index,promise);
          launched=true;
        }
      }

      if(!running.size){
        if(!session.tasks.some(task=>task.state==="pending")) break;
        if(this.stopRequested) break;
        if(!launched){
          const pending=session.tasks.find(task=>task.state==="pending");
          if(!pending) break;
          const promise=this.runTask(session,pending,onUpdate)
            .finally(()=>running.delete(pending.index));
          running.set(pending.index,promise);
        }
      }

      if(running.size) await Promise.race(running.values());
    }

    await Promise.allSettled(running.values());
    onUpdate?.(this.snapshot(session));
    return this.result(session);
  }

  private async runTask(
    session:Session,
    task:BatchTaskSnapshot,
    onUpdate?:(snapshot:BatchSnapshot)=>void
  ):Promise<void>{
    const file=session.files[task.index];
    task.state="running";
    task.progress=0;
    task.stage="Starting";
    task.attempts++;
    task.error=undefined;
    onUpdate?.(this.snapshot(session));

    try{
      const output=await this.jobs.convert(
        file,
        session.pipeline.targetFormatId,
        session.pipeline.quality,
        session.pipeline.options,
        (job:JobSnapshot)=>{
          task.progress=job.progress;
          task.stage=job.stage;
          onUpdate?.(this.snapshot(session));
        }
      );

      const target=this.formats.get(session.pipeline.targetFormatId);
      const extension=target?.extensions[0]??session.pipeline.targetFormatId;
      const rendered=renderBatchName(session.pipeline.namingTemplate,{
        sourceName:file.name,
        targetExtension:extension,
        targetFormatId:session.pipeline.targetFormatId,
        index:task.index,
        total:session.files.length
      });
      output.fileName=uniqueBatchName(rendered,session.usedNames);

      const previous=session.outputs.get(task.index);
      if(previous&&previous!==output){
        try{await previous.release?.();}catch{}
      }
      session.outputs.set(task.index,output);
      task.outputName=output.fileName;
      task.warnings=[...new Set([...task.warnings,...output.warnings])];
      task.state="completed";
      task.progress=1;
      task.stage="Complete";
      task.retryable=undefined;
    }catch(error){
      const cancelled=this.stopRequested||(error instanceof DOMException&&error.name==="AbortError");
      task.state=cancelled?"cancelled":"failed";
      task.progress=cancelled?task.progress:1;
      task.retryable=cancelled?true:isRetryableIssue(error);
      task.stage=cancelled?"Cancelled":task.retryable?"Failed · retry available":"Failed · needs changes";
      task.error=cancelled?undefined:(error instanceof Error?error.message:String(error));
    }
    onUpdate?.(this.snapshot(session));
  }

  private snapshot(session:Session):BatchSnapshot {
    const tasks=session.tasks.map(cloneTask);
    const count=(state:BatchTaskSnapshot["state"])=>tasks.filter(task=>task.state===state).length;
    const progress=tasks.length
      ?tasks.reduce((sum,task)=>sum+(task.state==="failed"?1:task.progress),0)/tasks.length
      :0;
    const running=tasks.filter(task=>task.state==="running");
    return {
      total:tasks.length,
      pending:count("pending"),
      running:count("running"),
      completed:count("completed"),
      failed:count("failed"),
      cancelled:count("cancelled"),
      progress,
      stage:running.length
        ?running.length+" active · "+running.map(task=>task.stage).slice(0,2).join(" · ")
        :count("pending")?"Queued"
        :count("cancelled")?"Batch cancelled"
        :"Batch complete",
      resumable:tasks.some(task=>
        task.state==="cancelled"
        ||task.state==="pending"
        ||(task.state==="failed"&&task.retryable!==false)
      ),
      tasks
    };
  }

  private result(session:Session):BatchRunResult {
    const outputs=[...session.outputs.entries()]
      .sort((a,b)=>a[0]-b[0])
      .map(([,output])=>output);
    const failures:BatchFailure[]=session.tasks
      .filter(task=>task.state==="failed")
      .map(task=>({name:task.sourceName,error:task.error??"Conversion failed."}));
    return {
      outputs,
      failures,
      tasks:session.tasks.map(cloneTask),
      cancelled:session.tasks.some(task=>task.state==="cancelled")
    };
  }
}
