import { test,expect,type Page } from "@playwright/test";
import {
  jsonFixture,
  openApp,
  pngFixture,
  runTarget,
  selectFixture,
  srtFixture,
  unicodeZipFixture
} from "./helpers";

async function installResourceProbe(page:Page){
  await page.addInitScript(()=>{
    const probe={
      createdUrls:0,
      revokedUrls:0,
      activeUrls:new Set<string>(),
      activeDownloadUrls:new Set<string>(),
      workersCreated:0,
      activeWorkers:0
    };
    (globalThis as any).__convertResourceProbe=probe;

    const nativeCreate=URL.createObjectURL.bind(URL);
    const nativeRevoke=URL.revokeObjectURL.bind(URL);
    (URL as any).createObjectURL=(value:any)=>{
      const url=nativeCreate(value);
      probe.createdUrls++;
      probe.activeUrls.add(url);
      return url;
    };
    (URL as any).revokeObjectURL=(url:string)=>{
      probe.revokedUrls++;
      probe.activeUrls.delete(url);
      probe.activeDownloadUrls.delete(url);
      return nativeRevoke(url);
    };

    const observeDownloads=()=>{
      const root=document.documentElement;
      if(!root) return;
      const scan=()=>{
        document.querySelectorAll<HTMLAnchorElement>("a.download-link").forEach(link=>{
          if(link.href.startsWith("blob:")) probe.activeDownloadUrls.add(link.href);
        });
      };
      new MutationObserver(scan).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["href"]});
      scan();
    };
    if(document.readyState==="loading"){
      document.addEventListener("DOMContentLoaded",observeDownloads,{once:true});
    }else{
      observeDownloads();
    }

    const NativeWorker=globalThis.Worker;
    class TrackingWorker extends NativeWorker {
      private trackedTerminated=false;
      constructor(scriptURL:string|URL,options?:WorkerOptions){
        super(scriptURL,options);
        probe.workersCreated++;
        probe.activeWorkers++;
      }
      override terminate(){
        if(!this.trackedTerminated){
          this.trackedTerminated=true;
          probe.activeWorkers=Math.max(0,probe.activeWorkers-1);
        }
        super.terminate();
      }
    }
    Object.defineProperty(globalThis,"Worker",{
      configurable:true,
      writable:true,
      value:TrackingWorker
    });
  });
}

async function resourceStats(page:Page){
  return page.evaluate(()=>{
    const probe=(globalThis as any).__convertResourceProbe;
    return {
      createdUrls:Number(probe?.createdUrls??0),
      revokedUrls:Number(probe?.revokedUrls??0),
      activeUrls:Number(probe?.activeUrls?.size??0),
      activeDownloadUrls:Number(probe?.activeDownloadUrls?.size??0),
      workersCreated:Number(probe?.workersCreated??0),
      activeWorkers:Number(probe?.activeWorkers??0)
    };
  });
}

async function opfsJobCount(page:Page):Promise<number|null>{
  return page.evaluate(async()=>{
    if(!navigator.storage?.getDirectory) return null;
    try{
      const root=await navigator.storage.getDirectory();
      const app=await root.getDirectoryHandle("thiepn-convert",{create:true});
      const jobs=await app.getDirectoryHandle("jobs",{create:true});
      let count=0;
      for await(const _entry of (jobs as any).entries()) count++;
      return count;
    }catch{
      return null;
    }
  });
}

async function startOver(page:Page){
  await page.locator("#start-over-button").click();
  await expect(page.locator("#file-panel")).toBeHidden();
}

test.beforeEach(async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="chromium","long-session endurance runs once in desktop Chromium");
  await installResourceProbe(page);
  await openApp(page);
});

test("30 subtitle conversion/reset cycles release every result URL and OPFS workspace",async({page})=>{
  test.setTimeout(180_000);

  for(let index=0;index<30;index++){
    await selectFixture(page,srtFixture("loop-"+index+".srt"));
    await runTarget(page,"vtt");
    await expect(page.locator("#results .result-item")).toHaveCount(1);
    await startOver(page);
  }

  await expect.poll(()=>opfsJobCount(page),{timeout:15_000,intervals:[100,250,500]})
    .toBe(0);

  const stats=await resourceStats(page);
  expect(stats.createdUrls).toBeGreaterThanOrEqual(30);
  expect(stats.activeUrls).toBe(0);
  expect(stats.revokedUrls).toBe(stats.createdUrls);
  expect(stats.activeWorkers).toBe(0);
});

test("native image workers terminate after repeated conversions instead of accumulating",async({page})=>{
  test.setTimeout(180_000);
  const baseline=await resourceStats(page);

  for(let index=0;index<16;index++){
    await selectFixture(page,pngFixture());
    await page.locator("#metadata-policy").selectOption("strip");
    await page.locator("#max-dimension").selectOption("128");
    await runTarget(page,"png");
    await startOver(page);
  }

  await expect.poll(()=>opfsJobCount(page),{timeout:15_000,intervals:[100,250,500]})
    .toBe(0);

  const stats=await resourceStats(page);
  expect(stats.workersCreated-baseline.workersCreated).toBeGreaterThanOrEqual(16);
  expect(stats.activeWorkers).toBeLessThanOrEqual(baseline.activeWorkers);
  expect(stats.activeDownloadUrls).toBe(0);
  // zip.js may retain one bounded internal blob URL for its worker/runtime.
  expect(stats.activeUrls).toBeLessThanOrEqual(1);
});

test("structured-data sessions recycle DuckDB without growing active worker count",async({page})=>{
  test.setTimeout(180_000);
  const baseline=await resourceStats(page);

  // Selection inspection + conversion + output validation create enough DuckDB
  // operations across these cycles to cross the 20-operation recycle boundary.
  for(let index=0;index<8;index++){
    const fixture=jsonFixture();
    fixture.name="records-"+index+".json";
    await selectFixture(page,fixture);
    await runTarget(page,"csv");
    await startOver(page);
  }

  await expect.poll(()=>opfsJobCount(page),{timeout:15_000,intervals:[100,250,500]})
    .toBe(0);

  const stats=await resourceStats(page);
  expect(stats.workersCreated-baseline.workersCreated).toBeGreaterThanOrEqual(2);
  expect(stats.activeWorkers).toBeLessThanOrEqual(baseline.activeWorkers+1);
  expect(stats.activeUrls).toBe(0);
});


test("clearing results during asynchronous convenience packaging cannot resurrect stale URLs",async({page})=>{
  test.setTimeout(120_000);

  await page.evaluate(()=>{
    const original=Blob.prototype.arrayBuffer;
    (globalThis as any).__delayPackageReads=false;
    Blob.prototype.arrayBuffer=async function(){
      if((globalThis as any).__delayPackageReads&&this.type==="application/octet-stream"){
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      return original.call(this);
    };
  });

  await selectFixture(page,unicodeZipFixture());
  await page.locator("#archive-operation").selectOption("extract-all");
  await page.evaluate(()=>{(globalThis as any).__delayPackageReads=true;});
  await page.locator("#convert-button").click();

  await expect(page.locator("#results .result-item")).toHaveCount(4,{timeout:60_000});
  await startOver(page);

  await page.waitForTimeout(1200);
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#results .result-item")).toHaveCount(0);

  await expect.poll(()=>opfsJobCount(page),{timeout:15_000,intervals:[100,250,500]})
    .toBe(0);

  const stats=await resourceStats(page);
  expect(stats.activeUrls).toBe(0);
});
