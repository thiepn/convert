import { test,expect,type Page,type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  jsonFixture,
  openApp,
  pdfFixture,
  runTarget,
  selectFixtures,
  srtFixture
} from "./helpers";

const budgets=JSON.parse(
  fs.readFileSync(path.resolve("config/performance-budgets.json"),"utf8")
).runtime as Record<string,number>;
const reportPath=path.resolve("test-results/performance-report.json");

function record(
  testInfo:TestInfo,
  metrics:Record<string,number|string|boolean>
){
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  let report:any={generatedAt:new Date().toISOString(),runtimeBudgets:budgets,tests:{}};
  try{
    if(fs.existsSync(reportPath)) report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
  }catch{}
  report.generatedAt=new Date().toISOString();
  report.runtimeBudgets=budgets;
  report.tests[testInfo.title]=metrics;
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");

  const summary=Object.entries(metrics)
    .map(([key,value])=>key+"="+(typeof value==="number"?Math.round(value*100)/100:value))
    .join(" · ");
  console.log("[PERF] "+testInfo.title+" · "+summary);
}

async function measureSelectionReady(
  page:Page,
  fixture:{name:string;mimeType:string;buffer:Buffer}
):Promise<number>{
  await page.evaluate(()=>performance.clearMarks("convert:selection-ready"));
  const started=Date.now();
  await page.locator("#file-input").setInputFiles({
    name:fixture.name,
    mimeType:fixture.mimeType,
    buffer:fixture.buffer
  });
  await expect.poll(
    ()=>page.evaluate(()=>performance.getEntriesByName("convert:selection-ready").length),
    {timeout:30_000,intervals:[25,50,100,250]}
  ).toBeGreaterThan(0);
  return Date.now()-started;
}

async function startHeartbeat(page:Page){
  await page.evaluate(()=>{
    const state={last:performance.now(),maxGap:0,ticks:0,id:0};
    state.id=window.setInterval(()=>{
      const now=performance.now();
      state.maxGap=Math.max(state.maxGap,now-state.last);
      state.last=now;
      state.ticks++;
    },25);
    (globalThis as any).__perfHeartbeat=state;
  });
}

async function stopHeartbeat(page:Page):Promise<{maxGap:number;ticks:number}>{
  return page.evaluate(()=>{
    const state=(globalThis as any).__perfHeartbeat;
    if(!state) return {maxGap:0,ticks:0};
    clearInterval(state.id);
    return {maxGap:Number(state.maxGap),ticks:Number(state.ticks)};
  });
}

test.beforeEach(async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="chromium","performance budgets run once in desktop Chromium");
  await openApp(page);
});

test("startup reaches runtime-ready within release budget",async({page},testInfo)=>{
  const values=await page.evaluate(()=>{
    const ready=performance.getEntriesByName("convert:runtime-ready").at(-1);
    const navigation=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
    return {
      runtimeReadyMs:ready?.startTime??Number.POSITIVE_INFINITY,
      domContentLoadedMs:navigation?.domContentLoadedEventEnd??0,
      loadEventMs:navigation?.loadEventEnd??0
    };
  });

  expect(values.runtimeReadyMs).toBeLessThanOrEqual(budgets.runtimeReadyMs);
  record(testInfo,values);
});

test("DuckDB cold and warm inspections stay within latency budgets",async({page},testInfo)=>{
  test.setTimeout(60_000);
  const first=jsonFixture();
  first.name="perf-cold.json";
  const cold=await measureSelectionReady(page,first);

  const second=jsonFixture();
  second.name="perf-warm.json";
  const warm=await measureSelectionReady(page,second);

  const relativeLimit=cold*budgets.duckDbWarmVsColdFactor+750;
  expect(cold).toBeLessThanOrEqual(budgets.duckDbColdInspectionMs);
  expect(warm).toBeLessThanOrEqual(budgets.duckDbWarmInspectionMs);
  expect(warm).toBeLessThanOrEqual(relativeLimit);

  record(testInfo,{
    coldMs:cold,
    warmMs:warm,
    warmToColdRatio:cold?warm/cold:0,
    coldBudgetMs:budgets.duckDbColdInspectionMs,
    warmBudgetMs:budgets.duckDbWarmInspectionMs
  });
});

test("PDF.js cold and warm inspections stay within latency budgets",async({page},testInfo)=>{
  test.setTimeout(60_000);
  const first=await pdfFixture();
  first.name="perf-cold.pdf";
  const cold=await measureSelectionReady(page,first);

  const second={...first,name:"perf-warm.pdf"};
  const warm=await measureSelectionReady(page,second);

  const relativeLimit=cold*budgets.pdfWarmVsColdFactor+750;
  expect(cold).toBeLessThanOrEqual(budgets.pdfColdInspectionMs);
  expect(warm).toBeLessThanOrEqual(budgets.pdfWarmInspectionMs);
  expect(warm).toBeLessThanOrEqual(relativeLimit);

  record(testInfo,{
    coldMs:cold,
    warmMs:warm,
    warmToColdRatio:cold?warm/cold:0,
    coldBudgetMs:budgets.pdfColdInspectionMs,
    warmBudgetMs:budgets.pdfWarmInspectionMs
  });
});

test("24-file batch preserves UI heartbeat and throughput budget",async({page},testInfo)=>{
  test.setTimeout(90_000);
  const files=Array.from({length:24},(_,index)=>srtFixture("perf-"+String(index+1).padStart(2,"0")+".srt"));
  await selectFixtures(page,files);
  await page.locator("#batch-package-results").uncheck();

  await startHeartbeat(page);
  const started=Date.now();
  await runTarget(page,"vtt",60_000);
  const duration=Date.now()-started;
  const heartbeat=await stopHeartbeat(page);

  await expect(page.locator("#results .result-item")).toHaveCount(24);
  expect(duration).toBeLessThanOrEqual(budgets.subtitleBatch24Ms);
  expect(heartbeat.ticks).toBeGreaterThan(0);
  expect(heartbeat.maxGap).toBeLessThanOrEqual(budgets.heartbeatMaxGapMs);

  record(testInfo,{
    durationMs:duration,
    maxHeartbeatGapMs:heartbeat.maxGap,
    heartbeatTicks:heartbeat.ticks,
    throughputFilesPerSecond:24/(duration/1000),
    durationBudgetMs:budgets.subtitleBatch24Ms,
    heartbeatBudgetMs:budgets.heartbeatMaxGapMs
  });
});

test("renderer heap stays bounded across repeated result lifecycles",async({page},testInfo)=>{
  test.setTimeout(120_000);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");

  const heap=async()=>{
    const result=await cdp.send("Runtime.getHeapUsage") as {usedSize:number;totalSize:number};
    return Number(result.usedSize);
  };

  const baseline=await heap();
  let peak=baseline;

  for(let index=0;index<12;index++){
    await page.locator("#file-input").setInputFiles({
      name:"heap-"+index+".srt",
      mimeType:"application/x-subrip",
      buffer:srtFixture("heap-"+index+".srt").buffer
    });
    await runTarget(page,"vtt");
    peak=Math.max(peak,await heap());
    await page.locator("#start-over-button").click();
    await expect(page.locator("#file-panel")).toBeHidden();
  }

  await cdp.send("HeapProfiler.collectGarbage");
  const retained=await heap();
  const peakGrowth=Math.max(0,peak-baseline);
  const retainedGrowth=Math.max(0,retained-baseline);

  expect(peakGrowth).toBeLessThanOrEqual(budgets.rendererHeapPeakGrowthBytes);
  expect(retainedGrowth).toBeLessThanOrEqual(budgets.rendererHeapRetainedGrowthBytes);

  record(testInfo,{
    baselineBytes:baseline,
    peakBytes:peak,
    retainedBytes:retained,
    peakGrowthBytes:peakGrowth,
    retainedGrowthBytes:retainedGrowth,
    peakGrowthBudgetBytes:budgets.rendererHeapPeakGrowthBytes,
    retainedGrowthBudgetBytes:budgets.rendererHeapRetainedGrowthBytes
  });

  await cdp.detach();
});
