import { test,expect } from "@playwright/test";
import {
  addLargeJpegComment,
  dngWithPreview,
  fitsFixture,
  fontFixture,
  htmlFixture,
  jsonFixture,
  objFixture,
  openApp,
  pdfFixture,
  pngFixture,
  psdFixture,
  resultBytes,
  resultText,
  runTarget,
  selectFixture,
  selectFixtures,
  srtFixture,
  wavFixture,
  xlsxFixture,
  zipFixture
} from "./helpers";

test.beforeEach(async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="chromium","real conversion matrix runs once in desktop Chromium");
  await openApp(page);
});

test("image engine and RAW preview route produce valid JPEG/WebP outputs",async({page})=>{
  await selectFixture(page,pngFixture());
  await runTarget(page,"jpeg");
  const jpeg=await resultBytes(page,"pixel-converted");
  expect(jpeg.subarray(0,2)).toEqual(Buffer.from([0xff,0xd8]));

  await page.locator("#start-over-button").click();
  await selectFixture(page,dngWithPreview(jpeg));
  await runTarget(page,"jpeg");
  const preview=await resultBytes(page,"preview-converted");
  expect(preview.subarray(0,2)).toEqual(Buffer.from([0xff,0xd8]));
  expect(preview.length).toBeGreaterThan(1024);

  await page.locator("#start-over-button").click();
  await selectFixture(page,pngFixture());
  await runTarget(page,"webp");
  const webp=await resultBytes(page,"pixel-converted");
  expect(webp.subarray(0,4).toString("ascii")).toBe("RIFF");
  expect(webp.subarray(8,12).toString("ascii")).toBe("WEBP");
});

test("subtitle, mesh, FITS, and font specialist routes preserve usable output",async({page})=>{
  await selectFixture(page,srtFixture());
  await runTarget(page,"vtt");
  expect(await resultText(page,"captions-converted")).toContain("WEBVTT");
  expect(await resultText(page,"captions-converted")).toContain("Hello local conversion");

  await page.locator("#start-over-button").click();
  await selectFixture(page,objFixture());
  await runTarget(page,"stl");
  const stl=await resultBytes(page,"triangle-converted");
  expect(stl.length).toBeGreaterThanOrEqual(134);
  expect(stl.readUInt32LE(80)).toBe(1);

  await page.locator("#start-over-button").click();
  await selectFixture(page,fitsFixture());
  await runTarget(page,"json-data");
  const fits=JSON.parse(await resultText(page,"header-converted"));
  expect(fits.some((card:any)=>card.keyword==="OBJECT")).toBe(true);

  await page.locator("#start-over-button").click();
  await selectFixture(page,fontFixture());
  await runTarget(page,"woff");
  const font=await resultBytes(page,"LiberationSans-Regular-converted");
  expect(font.subarray(0,4).toString("ascii")).toBe("wOFF");
});

test("PSD compatibility flattens an actual PSD to PNG",async({page})=>{
  await selectFixture(page,psdFixture());
  await runTarget(page,"png");
  const png=await resultBytes(page,"blank-converted");
  expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
});

test("primary media engine converts real PCM WAV to FLAC",async({page})=>{
  await selectFixture(page,wavFixture());
  await runTarget(page,"flac");
  const flac=await resultBytes(page,"tone-converted");
  expect(flac.subarray(0,4).toString("ascii")).toBe("fLaC");
});

test("PDF qpdf path optimizes a generated PDF and validates it",async({page})=>{
  await selectFixture(page,await pdfFixture());
  await page.locator("#pdf-operation").selectOption("optimize");
  await page.locator("#convert-button").click();
  await expect(page.locator("#results")).toBeVisible({timeout:180_000});
  const pdf=await resultBytes(page,"sample-optimized.pdf");
  expect(pdf.subarray(0,5).toString("ascii")).toBe("%PDF-");
});

test("Pandoc succeeds and LibreOffice either converts or fails with actionable fallback",async({page})=>{
  test.setTimeout(220_000);
  await selectFixture(page,htmlFixture());
  await runTarget(page,"markdown");
  const markdown=await resultText(page,"document-converted");
  expect(markdown).toMatch(/Maintenance/);
  expect(markdown).toMatch(/browser/);

  await page.locator("#start-over-button").click();
  await selectFixture(page,htmlFixture());
  await expect(page.locator('#target-format option[value="pdf"]')).toHaveCount(1,{timeout:30_000});
  await page.locator("#target-format").selectOption("pdf");
  await page.locator("#convert-button").click();

  await expect.poll(async()=>({
    outputs:await page.locator("#results .result-item").count(),
    failures:await page.locator("#results .warning").count()
  }),{timeout:150_000,intervals:[250,500,1000]}).not.toEqual({outputs:0,failures:0});

  if(await page.locator("#results .result-item").count()){
    const pdf=await resultBytes(page,"document-converted");
    expect(pdf.subarray(0,5).toString("ascii")).toBe("%PDF-");
  }else{
    const message=(await page.locator("#results .warning").first().textContent())??"";
    expect(message).not.toMatch(/OFFICE_ENGINE_UNAVAILABLE:/);
    expect(message).toMatch(/Conversion unavailable|Semantic structure mode/i);
  }
});

test("SheetJS, DuckDB, and sql.js process real workbook/data/database files",async({page})=>{
  await selectFixture(page,xlsxFixture());
  await runTarget(page,"csv");
  const csv=await resultText(page,"book-converted");
  expect(csv).toContain("alpha");
  expect(csv).toContain("beta");

  await page.locator("#start-over-button").click();
  await selectFixture(page,jsonFixture());
  await runTarget(page,"csv");
  const dataCsv=await resultText(page,"records-converted");
  expect(dataCsv).toContain("alpha");
  expect(dataCsv).toContain("beta");

  await page.locator("#start-over-button").click();
  await selectFixture(page,jsonFixture());
  await runTarget(page,"sqlite");
  const sqlite=await resultBytes(page,"records-converted");
  expect(sqlite.subarray(0,16).toString("binary")).toBe("SQLite format 3\u0000");
});

test("archive engine repacks ZIP to TAR through libarchive",async({page})=>{
  await selectFixture(page,zipFixture());
  await runTarget(page,"tar");
  const tar=await resultBytes(page,"sample-converted");
  expect(tar.length).toBeGreaterThanOrEqual(1024);
  expect(tar.subarray(0,100).toString("utf8")).toContain("hello.txt");
});

test("batch scheduler converts and packages multiple real subtitle files",async({page})=>{
  await selectFixtures(page,[
    srtFixture("one.srt"),
    srtFixture("two.srt"),
    srtFixture("three.srt")
  ]);
  await runTarget(page,"vtt");
  await expect(page.locator(".result-item")).toHaveCount(4,{timeout:180_000});
  const packageBytes=await resultBytes(page,"converted-files.zip");
  expect(packageBytes.subarray(0,2).toString("ascii")).toBe("PK");
  expect(await resultText(page,"one-converted")).toContain("WEBVTT");
});

test("invalid data query fails safely with a human-readable recovery message",async({page})=>{
  await selectFixture(page,jsonFixture());
  await expect(page.locator('#target-format option[value="csv"]')).toHaveCount(1,{timeout:120_000});
  await page.locator("#target-format").selectOption("csv");
  await page.locator("#data-query").fill("DELETE FROM data");
  await page.locator("#convert-button").click();

  const warning=page.locator("#loss-warnings .warning").last();
  await expect(warning).toBeVisible({timeout:10_000});
  const text=(await warning.textContent())??"";
  expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]+:/);
  expect(text).toMatch(/Query blocked|SELECT|WITH/i);
  await expect(page.locator("#job-stage")).not.toContainText(/DuckDB|analytical query/i);
});
