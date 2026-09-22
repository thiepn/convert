import { test,expect,type Page,type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  htmlFixture,
  jsonFixture,
  objFixture,
  openApp,
  pdfFixture,
  pngFixture,
  resultBytes,
  resultText,
  runTarget,
  selectFixture,
  srtFixture,
  wavFixture,
  xlsxFixture,
  zipFixture
} from "./helpers";

const reportPath=path.resolve("test-results/browser-parity-report.json");

function record(testInfo:TestInfo,details:Record<string,unknown>){
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  let report:any={generatedAt:new Date().toISOString(),projects:{}};
  try{
    if(fs.existsSync(reportPath)) report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
  }catch{}
  const project=testInfo.project.name;
  report.generatedAt=new Date().toISOString();
  report.projects[project]??={};
  report.projects[project][testInfo.title]=details;
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
  console.log("[PARITY] "+project+" · "+testInfo.title+" · "+JSON.stringify(details));
}

async function reset(page:Page){
  await page.locator("#start-over-button").click();
  await expect(page.locator("#file-panel")).toBeHidden();
}

async function capabilities(page:Page){
  return page.evaluate(()=>{
    try{return JSON.parse(document.getElementById("capability-json")?.textContent??"{}");}
    catch{return {};}
  });
}

test.beforeEach(async({page})=>{
  await openApp(page);
});

test("native and lightweight conversion parity",async({page},testInfo)=>{
  test.setTimeout(120_000);
  const caps=await capabilities(page);

  await selectFixture(page,srtFixture());
  await runTarget(page,"vtt",45_000);
  expect(await resultText(page,"captions-converted")).toContain("WEBVTT");

  await reset(page);
  await selectFixture(page,objFixture());
  await runTarget(page,"stl",45_000);
  const stl=await resultBytes(page,"triangle-converted");
  expect(stl.readUInt32LE(80)).toBe(1);

  await reset(page);
  await selectFixture(page,pngFixture());
  await page.locator("#metadata-policy").selectOption("strip");
  await runTarget(page,"jpeg",60_000);
  const jpeg=await resultBytes(page,"pixel-converted");
  expect(jpeg.subarray(0,2)).toEqual(Buffer.from([0xff,0xd8]));

  record(testInfo,{
    subtitle:true,
    mesh:true,
    commonImage:true,
    offscreenCanvas:Boolean(caps.offscreenCanvas),
    imageBitmap:Boolean(caps.imageBitmap),
    wasmThreads:Boolean(caps.wasmThreads)
  });
});

test("document spreadsheet and structured-data parity",async({page},testInfo)=>{
  test.setTimeout(150_000);
  const caps=await capabilities(page);

  await selectFixture(page,xlsxFixture());
  await runTarget(page,"csv",60_000);
  expect(await resultText(page,"book-converted")).toContain("alpha");

  await reset(page);
  await selectFixture(page,jsonFixture());
  await runTarget(page,"csv",90_000);
  const csv=await resultText(page,"records-converted");
  expect(csv).toContain("alpha");
  expect(csv).toContain("beta");

  await reset(page);
  await selectFixture(page,htmlFixture());
  await runTarget(page,"markdown",90_000);
  const markdown=await resultText(page,"document-converted");
  expect(markdown).toMatch(/Maintenance/);

  record(testInfo,{
    sheetjs:true,
    duckdb:true,
    pandoc:true,
    webAssembly:Boolean(caps.webAssembly),
    sharedArrayBuffer:Boolean(caps.sharedArrayBuffer)
  });
});

test("PDF and archive WASM parity",async({page},testInfo)=>{
  test.setTimeout(150_000);
  const caps=await capabilities(page);

  await selectFixture(page,await pdfFixture());
  await page.locator("#pdf-operation").selectOption("optimize");
  await page.locator("#convert-button").click();
  await expect(page.locator("#results .result-item")).toHaveCount(1,{timeout:90_000});
  const pdf=await resultBytes(page,"sample-optimized.pdf");
  expect(pdf.subarray(0,5).toString("ascii")).toBe("%PDF-");

  await reset(page);
  await selectFixture(page,zipFixture());
  await runTarget(page,"tar",90_000);
  const tar=await resultBytes(page,"sample-converted");
  expect(tar.subarray(0,100).toString("utf8")).toContain("hello.txt");

  record(testInfo,{
    qpdf:true,
    libarchive:true,
    crossOriginIsolated:Boolean(caps.crossOriginIsolated),
    wasmSIMD:Boolean(caps.wasmSIMD)
  });
});

test("primary audio conversion parity",async({page},testInfo)=>{
  test.setTimeout(120_000);
  const caps=await capabilities(page);

  await selectFixture(page,wavFixture());
  await runTarget(page,"flac",90_000);
  const flac=await resultBytes(page,"tone-converted");
  expect(flac.subarray(0,4).toString("ascii")).toBe("fLaC");

  record(testInfo,{
    wavToFlac:true,
    webCodecs:Boolean(caps.webCodecs),
    codecs:caps.codecs??{}
  });
});
