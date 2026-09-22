import { test,expect } from "@playwright/test";
import * as XLSX from "xlsx";
import {
  adversarialCsvFixture,
  bomJsonFixture,
  complexXlsxFixture,
  flattenCollisionZipFixture,
  messyHtmlFixture,
  openApp,
  pdfWithTrailingJunkFixture,
  pngFixture,
  png512Fixture,
  resultBytes,
  resultText,
  runTarget,
  selectFixture,
  unicodeZipFixture,
  utf16SrtFixture,
  wavWithJunkFixture
} from "./helpers";

function tarPaths(bytes:Buffer):string[]{
  const paths:string[]=[];
  let offset=0;
  while(offset+512<=bytes.length){
    const block=bytes.subarray(offset,offset+512);
    if(block.every(value=>value===0)) break;
    const field=(start:number,length:number)=>
      block.subarray(start,start+length).toString("utf8").replace(/\0.*$/s,"").trim();
    const name=field(0,100);
    const prefix=field(345,155);
    const sizeText=field(124,12).replace(/\s/g,"");
    const size=parseInt(sizeText||"0",8)||0;
    paths.push(prefix?prefix+"/"+name:name);
    offset+=512+Math.ceil(size/512)*512;
  }
  return paths;
}

test.beforeEach(async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="chromium","adversarial compatibility matrix runs once in desktop Chromium");
  await openApp(page);
});

test("image options are actually honored instead of falling through the fast proof path",async({page})=>{
  await selectFixture(page,png512Fixture());
  await page.locator("#metadata-policy").selectOption("strip");
  await page.locator("#max-dimension").selectOption("320");
  await runTarget(page,"png");

  const resized=await resultBytes(page,"pixel-512-converted");
  expect(resized.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(resized.readUInt32BE(16)).toBe(320);
  expect(resized.readUInt32BE(20)).toBe(320);

  await page.locator("#start-over-button").click();
  await selectFixture(page,pngFixture());
  await page.locator("#metadata-policy").selectOption("strip");
  await page.locator("#max-dimension").selectOption("");
  await page.locator("#target-format").selectOption("webp");
  await expect(page.locator("#route-box")).toContainText(/browser fallback/i);
  await page.locator("#convert-button").click();
  await expect(page.locator("#results .result-item")).toHaveCount(1,{timeout:120_000});
  const webp=await resultBytes(page,"pixel-converted");
  expect(webp.subarray(8,12).toString("ascii")).toBe("WEBP");
});

test("semicolon CSV auto-detection survives quotes, embedded newlines, BOM, and XLSX output",async({page})=>{
  await selectFixture(page,adversarialCsvFixture(false));
  await expect(page.locator("#data-delimiter")).toHaveValue("auto");
  await runTarget(page,"xlsx");

  const output=await resultBytes(page,"edge-semicolon-converted");
  const workbook=XLSX.read(output,{type:"buffer",cellDates:true});
  const rows=XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]],{defval:null});
  expect(rows[0].name).toBe("Alpha, Inc");
  expect(rows[0].note).toContain("line one\nline two");
  expect(rows[1].name).toBe("München");
  expect(rows[1].note).toBe('quoted "value"');
});

test("UTF-16LE CSV reaches the structured-data engine without mojibake",async({page})=>{
  await selectFixture(page,adversarialCsvFixture(true));
  await runTarget(page,"json-data");

  const rows=JSON.parse(await resultText(page,"edge-utf16-converted"));
  expect(rows[0].name).toBe("Alpha, Inc");
  expect(rows[1].name).toBe("München");
  expect(rows[0].note).toContain("line two");
});

test("BOM JSON with nested and multilingual values converts cleanly",async({page})=>{
  await selectFixture(page,bomJsonFixture());
  await runTarget(page,"csv");
  const csv=await resultText(page,"unicode-bom-converted");
  expect(csv).toContain("München");
  expect(csv).toContain("서울");
  expect(csv).toContain("한글 데이터");
  expect(csv).toContain("active");
});

test("UTF-16 Windows subtitles preserve multilingual cue text",async({page})=>{
  await selectFixture(page,utf16SrtFixture());
  await runTarget(page,"vtt");
  const vtt=await resultText(page,"unicode-windows-converted");
  expect(vtt).toContain("WEBVTT");
  expect(vtt).toContain("Grüße aus Köln");
  expect(vtt).toContain("안녕하세요");
  expect(vtt).toContain("00:00:01.000 --> 00:00:03.000");
});

test("complex workbook exports formulas and hidden-sheet sidecars without losing Unicode",async({page})=>{
  await selectFixture(page,complexXlsxFixture());
  await expect(page.locator("#inspection-warnings")).toContainText(/Formula cells/i);
  await page.locator("#data-sheet-policy").selectOption("all");
  await runTarget(page,"csv");

  await expect(page.locator("#results .result-item")).toHaveCount(2,{timeout:120_000});
  const main=await resultText(page,"workbook-unicode-converted.csv");
  const hidden=await resultText(page,"assets-Hidden.csv");
  expect(main).toContain("München");
  expect(main).toContain("서울");
  expect(main).toMatch(/,6,/);
  expect(main).toMatch(/,14,/);
  expect(hidden).toContain("hidden-row");
  expect(hidden).toContain("42");
});

test("archive repacking preserves Unicode paths and case-colliding entries",async({page})=>{
  await selectFixture(page,unicodeZipFixture());
  await expect(page.locator("#inspection-warnings")).toContainText(/Case-colliding entries/i);
  await runTarget(page,"tar");

  const tar=await resultBytes(page,"unicode-paths-converted");
  const paths=tarPaths(tar);
  expect(paths).toContain("资料/α.txt");
  expect(paths).toContain("Case.txt");
  expect(paths).toContain("case.txt");
  expect(paths).toContain("nested/deep/한글.txt");
});

test("flattened archive creation applies path policy before duplicate-name handling",async({page})=>{
  await selectFixture(page,flattenCollisionZipFixture());
  await page.locator("#archive-preserve-paths").uncheck();
  await runTarget(page,"tar");

  const tar=await resultBytes(page,"flatten-collisions-converted");
  const paths=tarPaths(tar);
  expect(paths).toContain("readme.txt");
  expect(paths).toContain("readme (2).txt");
  expect(paths).toContain("README.txt");
  expect(paths.every(path=>!path.includes("/"))).toBe(true);
});

test("noncanonical PCM WAV with a JUNK chunk remains convertible",async({page})=>{
  await selectFixture(page,wavWithJunkFixture());
  await runTarget(page,"flac");
  const flac=await resultBytes(page,"stereo-junk-converted");
  expect(flac.subarray(0,4).toString("ascii")).toBe("fLaC");
  expect(flac.length).toBeGreaterThan(100);
});

test("PDF optimization accepts ordinary trailing transport junk after a valid EOF",async({page})=>{
  await selectFixture(page,await pdfWithTrailingJunkFixture());
  await page.locator("#pdf-operation").selectOption("optimize");
  await page.locator("#convert-button").click();
  await expect(page.locator("#results .result-item")).toHaveCount(1,{timeout:180_000});
  const pdf=await resultBytes(page,"trailing-junk-optimized.pdf");
  expect(pdf.subarray(0,5).toString("ascii")).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(100);
});

test("messy real-world HTML still survives semantic document conversion",async({page})=>{
  await selectFixture(page,messyHtmlFixture());
  await runTarget(page,"markdown");
  const markdown=await resultText(page,"messy-unicode-converted");
  expect(markdown).toContain("München");
  expect(markdown).toContain("서울");
  expect(markdown).toMatch(/one/);
  expect(markdown).toMatch(/two/);
  expect(markdown).toMatch(/A.*B/s);
});
