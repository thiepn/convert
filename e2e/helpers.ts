import { expect,type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument,StandardFonts,rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import { zipSync,strToU8 } from "fflate";
import { writePsdBuffer } from "ag-psd";

export interface Fixture {
  name:string;
  mimeType:string;
  buffer:Buffer;
}

export async function openApp(page:Page,url="/"){
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await expect(page.locator("#drop-zone")).toBeVisible({timeout:60_000});
  await expect(page.locator("#runtime-status")).not.toHaveText(/Probing/i,{timeout:120_000});
}

export async function selectFixture(page:Page,fixture:Fixture){
  await page.locator("#file-input").setInputFiles({
    name:fixture.name,
    mimeType:fixture.mimeType,
    buffer:fixture.buffer
  });
  await expect(page.locator("#file-panel")).toBeVisible({timeout:120_000});
}

export async function selectFixtures(page:Page,fixtures:Fixture[]){
  await page.locator("#file-input").setInputFiles(fixtures.map(fixture=>({
    name:fixture.name,
    mimeType:fixture.mimeType,
    buffer:fixture.buffer
  })));
  await expect(page.locator("#file-panel")).toBeVisible({timeout:120_000});
}

export async function appDiagnostics(page:Page){
  return page.evaluate(()=>{
    const text=(id:string)=>document.getElementById(id)?.textContent?.trim()??"";
    const select=document.getElementById("target-format") as HTMLSelectElement|null;
    return {
      href:location.href,
      isolated:globalThis.crossOriginIsolated,
      runtime:text("runtime-status"),
      capabilities:text("capability-json"),
      targets:select?[...select.options].map(option=>({value:option.value,label:option.textContent??""})):[],
      inspectionWarnings:text("inspection-warnings"),
      lossWarnings:text("loss-warnings"),
      jobStage:text("job-stage"),
      jobProgress:text("job-progress"),
      results:text("results")
    };
  });
}

export async function runTarget(page:Page,target:string,timeoutMs=120_000){
  const option=page.locator(`#target-format option[value="${target}"]`);
  try{
    await expect(option).toHaveCount(1,{timeout:15_000});
  }catch(error){
    throw new Error(
      "Target "+target+" is unavailable. Diagnostics: "
      +JSON.stringify(await appDiagnostics(page))
      +"\n"+String(error)
    );
  }

  await page.locator("#target-format").selectOption(target);
  const button=page.locator("#convert-button");
  await button.click();

  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(await page.locator("#results .result-item").count()) return;
    if(!(await button.isDisabled())){
      // UI completion and result insertion happen in adjacent microtasks.
      // Re-check after a short settle period before declaring a failure.
      await page.waitForTimeout(100);
      if(await page.locator("#results .result-item").count()) return;
      throw new Error(
        "Conversion to "+target+" ended without an output. Diagnostics: "
        +JSON.stringify(await appDiagnostics(page))
      );
    }
    await page.waitForTimeout(250);
  }

  throw new Error(
    "Conversion to "+target+" timed out. Diagnostics: "
    +JSON.stringify(await appDiagnostics(page))
  );
}

export async function resultBytes(page:Page,namePart:string):Promise<Buffer>{
  const row=page.locator(".result-item").filter({hasText:namePart}).first();
  await expect(row).toBeVisible({timeout:120_000});
  const link=row.locator("a.download-link");
  const downloadPromise=page.waitForEvent("download");
  await link.click();
  const download=await downloadPromise;
  const stream=await download.createReadStream();
  if(!stream) throw new Error("Browser did not expose download bytes for "+namePart);
  const chunks:Buffer[]=[];
  for await(const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function resultText(page:Page,namePart:string):Promise<string>{
  return (await resultBytes(page,namePart)).toString("utf8");
}

export function pngFixture():Fixture {
  return {
    name:"pixel.png",
    mimeType:"image/png",
    buffer:fs.readFileSync(path.resolve("public/icon-192.png"))
  };
}

export function png512Fixture():Fixture {
  return {
    name:"pixel-512.png",
    mimeType:"image/png",
    buffer:fs.readFileSync(path.resolve("public/icon-512.png"))
  };
}

export function srtFixture(name="captions.srt"):Fixture {
  return {
    name,
    mimeType:"application/x-subrip",
    buffer:Buffer.from("1\n00:00:01,000 --> 00:00:03,000\nHello local conversion\n","utf8")
  };
}

export function objFixture():Fixture {
  return {
    name:"triangle.obj",
    mimeType:"model/obj",
    buffer:Buffer.from("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n","utf8")
  };
}

export function fitsFixture():Fixture {
  const card=(value:string)=>value.padEnd(80," ").slice(0,80);
  let text=[
    card("SIMPLE  =                    T / conforming FITS"),
    card("BITPIX  =                    8"),
    card("NAXIS   =                    0"),
    card("OBJECT  = 'Maintenance smoke'"),
    card("END")
  ].join("");
  text=text.padEnd(Math.ceil(text.length/2880)*2880," ");
  return {name:"header.fits",mimeType:"application/fits",buffer:Buffer.from(text,"ascii")};
}

export function htmlFixture():Fixture {
  return {
    name:"document.html",
    mimeType:"text/html",
    buffer:Buffer.from("<!doctype html><html><body><h1>Maintenance</h1><p>Hello <strong>browser</strong>.</p></body></html>","utf8")
  };
}

export function jsonFixture():Fixture {
  return {
    name:"records.json",
    mimeType:"application/json",
    buffer:Buffer.from(JSON.stringify([
      {name:"alpha",amount:2},
      {name:"beta",amount:7}
    ]),"utf8")
  };
}

export function zipFixture():Fixture {
  const bytes=zipSync({"hello.txt":strToU8("hello archive\n")},{level:6});
  return {name:"sample.zip",mimeType:"application/zip",buffer:Buffer.from(bytes)};
}

export function xlsxFixture():Fixture {
  const workbook=XLSX.utils.book_new();
  const sheet=XLSX.utils.json_to_sheet([
    {name:"alpha",amount:2},
    {name:"beta",amount:7}
  ]);
  XLSX.utils.book_append_sheet(workbook,sheet,"Data");
  const bytes=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"});
  return {name:"book.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:Buffer.from(bytes)};
}

export async function pdfFixture():Promise<Fixture>{
  const doc=await PDFDocument.create();
  const page=doc.addPage([300,200]);
  const font=await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Maintenance PDF",{x:30,y:120,size:18,font,color:rgb(0,0,0)});
  const bytes=await doc.save();
  return {name:"sample.pdf",mimeType:"application/pdf",buffer:Buffer.from(bytes)};
}

export function wavFixture():Fixture {
  const sampleRate=8_000;
  const seconds=.15;
  const samples=Math.floor(sampleRate*seconds);
  const dataBytes=samples*2;
  const buffer=Buffer.alloc(44+dataBytes);
  buffer.write("RIFF",0,"ascii");
  buffer.writeUInt32LE(36+dataBytes,4);
  buffer.write("WAVE",8,"ascii");
  buffer.write("fmt ",12,"ascii");
  buffer.writeUInt32LE(16,16);
  buffer.writeUInt16LE(1,20);
  buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(sampleRate,24);
  buffer.writeUInt32LE(sampleRate*2,28);
  buffer.writeUInt16LE(2,32);
  buffer.writeUInt16LE(16,34);
  buffer.write("data",36,"ascii");
  buffer.writeUInt32LE(dataBytes,40);
  for(let i=0;i<samples;i++){
    const value=Math.round(Math.sin(2*Math.PI*440*i/sampleRate)*12_000);
    buffer.writeInt16LE(value,44+i*2);
  }
  return {name:"tone.wav",mimeType:"audio/wav",buffer};
}

export function fontFixture():Fixture {
  const fontPath=path.resolve("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");
  if(!fs.existsSync(fontPath)) throw new Error("Expected PDF.js LiberationSans fixture is missing.");
  return {name:"LiberationSans-Regular.ttf",mimeType:"font/ttf",buffer:fs.readFileSync(fontPath)};
}

export function psdFixture():Fixture {
  const bytes=writePsdBuffer({
    width:8,
    height:8,
    children:[{name:"Blank layer"}]
  } as any,{generateThumbnail:false});
  return {name:"blank.psd",mimeType:"image/vnd.adobe.photoshop",buffer:Buffer.from(bytes)};
}

export function addLargeJpegComment(jpeg:Buffer):Buffer {
  if(jpeg.length<4||jpeg[0]!==0xff||jpeg[1]!==0xd8) throw new Error("Expected JPEG fixture.");
  const comment=Buffer.alloc(2048,0x41);
  const length=comment.length+2;
  const segment=Buffer.alloc(4+comment.length);
  segment[0]=0xff;segment[1]=0xfe;
  segment.writeUInt16BE(length,2);
  comment.copy(segment,4);
  return Buffer.concat([jpeg.subarray(0,2),segment,jpeg.subarray(2)]);
}

export function dngWithPreview(jpeg:Buffer):Fixture {
  const tiff=Buffer.alloc(256);
  tiff.write("II",0,"ascii");
  tiff.writeUInt16LE(42,2);
  tiff.writeUInt32LE(8,4);
  tiff.writeUInt16LE(0,8);
  tiff.writeUInt32LE(0,10);
  return {
    name:"preview.dng",
    mimeType:"image/x-adobe-dng",
    buffer:Buffer.concat([tiff,addLargeJpegComment(jpeg)])
  };
}


export function utf16leBuffer(text:string):Buffer {
  return Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,"utf16le")]);
}

export function adversarialCsvFixture(utf16=false):Fixture {
  const text=[
    "name;note;amount",
    "\"Alpha, Inc\";\"line one",
    "line two\";12.5",
    "\"München\";\"quoted \"\"value\"\"\";7"
  ].join("\r\n")+"\r\n";
  const buffer=utf16
    ?utf16leBuffer(text)
    :Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text,"utf8")]);
  return {
    name:utf16?"edge-utf16.csv":"edge-semicolon.csv",
    mimeType:"text/csv",
    buffer
  };
}

export function utf16SrtFixture():Fixture {
  return {
    name:"unicode-windows.srt",
    mimeType:"application/x-subrip",
    buffer:utf16leBuffer(
      "1\r\n00:00:01,000 --> 00:00:03,000\r\nGrüße aus Köln — 안녕하세요\r\n\r\n"
      +"2\r\n00:00:04,000 --> 00:00:05,500\r\nSecond line\r\n"
    )
  };
}

export function bomJsonFixture():Fixture {
  const payload=JSON.stringify([
    {name:"München",note:"comma, quote \" and newline\nkept",nested:{active:true}},
    {name:"서울",note:"한글 데이터",nested:{active:false}}
  ]);
  return {
    name:"unicode-bom.json",
    mimeType:"application/json",
    buffer:Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(payload,"utf8")])
  };
}

export function complexXlsxFixture():Fixture {
  const workbook=XLSX.utils.book_new();
  const main=XLSX.utils.aoa_to_sheet([
    ["Name","Amount","Computed","Note"],
    ["München",3,null,"comma, newline\nand \"quotes\""],
    ["서울",7,null,"한글"],
    ["Merged title",null,null,null]
  ]);
  (main as any)["C2"]={t:"n",v:6,f:"B2*2"};
  (main as any)["C3"]={t:"n",v:14,f:"B3*2"};
  main["!merges"]=[XLSX.utils.decode_range("A4:B4")];
  XLSX.utils.book_append_sheet(workbook,main,"Data ✓");

  const hidden=XLSX.utils.aoa_to_sheet([
    ["secret","value"],
    ["hidden-row",42]
  ]);
  XLSX.utils.book_append_sheet(workbook,hidden,"Hidden");
  workbook.Workbook={Sheets:[{Hidden:0},{Hidden:1}]} as any;
  workbook.Props={
    Title:"Adversarial workbook",
    Author:"Compatibility Matrix",
    Company:"Local Test"
  };

  const bytes=XLSX.write(workbook,{type:"buffer",bookType:"xlsx",compression:true});
  return {
    name:"workbook-unicode.xlsx",
    mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer:Buffer.from(bytes)
  };
}

export function unicodeZipFixture():Fixture {
  const bytes=zipSync({
    "资料/α.txt":strToU8("alpha unicode\n"),
    "Case.txt":strToU8("upper\n"),
    "case.txt":strToU8("lower\n"),
    "nested/deep/한글.txt":strToU8("korean path\n")
  },{level:6});
  return {name:"unicode-paths.zip",mimeType:"application/zip",buffer:Buffer.from(bytes)};
}

export async function pdfWithTrailingJunkFixture():Promise<Fixture>{
  const base=await pdfFixture();
  const junk=Buffer.from("\n% trailing transport bytes that appear after a valid PDF EOF\n".repeat(8),"utf8");
  return {
    name:"trailing-junk.pdf",
    mimeType:"application/pdf",
    buffer:Buffer.concat([base.buffer,junk])
  };
}

export function messyHtmlFixture():Fixture {
  return {
    name:"messy-unicode.html",
    mimeType:"text/html",
    buffer:Buffer.from(
      "<!doctype html><meta charset=utf-8><title>Edge</title>"
      +"<h1>München &amp; 서울</h1><p>Paragraph <strong>without closed parent tags"
      +"<ul><li>one<li>two</ul><table><tr><th>A<th>B<tr><td>1<td>2</table>",
      "utf8"
    )
  };
}


export function flattenCollisionZipFixture():Fixture {
  const bytes=zipSync({
    "folder-a/readme.txt":strToU8("first\n"),
    "folder-b/readme.txt":strToU8("second\n"),
    "folder-c/README.txt":strToU8("case distinct\n")
  },{level:6});
  return {name:"flatten-collisions.zip",mimeType:"application/zip",buffer:Buffer.from(bytes)};
}

export function wavWithJunkFixture():Fixture {
  const sampleRate=16_000;
  const channels=2;
  const seconds=.12;
  const samples=Math.floor(sampleRate*seconds);
  const blockAlign=channels*2;
  const dataBytes=samples*blockAlign;
  const junkSize=18;
  const fmtSize=16;
  const riffPayload=
    4
    +(8+junkSize+(junkSize%2))
    +(8+fmtSize)
    +(8+dataBytes);
  const buffer=Buffer.alloc(8+riffPayload);
  let offset=0;
  buffer.write("RIFF",offset,"ascii");offset+=4;
  buffer.writeUInt32LE(riffPayload,offset);offset+=4;
  buffer.write("WAVE",offset,"ascii");offset+=4;

  buffer.write("JUNK",offset,"ascii");offset+=4;
  buffer.writeUInt32LE(junkSize,offset);offset+=4;
  buffer.fill(0x4a,offset,offset+junkSize);offset+=junkSize;
  if(junkSize%2) offset++;

  buffer.write("fmt ",offset,"ascii");offset+=4;
  buffer.writeUInt32LE(fmtSize,offset);offset+=4;
  buffer.writeUInt16LE(1,offset);offset+=2;
  buffer.writeUInt16LE(channels,offset);offset+=2;
  buffer.writeUInt32LE(sampleRate,offset);offset+=4;
  buffer.writeUInt32LE(sampleRate*blockAlign,offset);offset+=4;
  buffer.writeUInt16LE(blockAlign,offset);offset+=2;
  buffer.writeUInt16LE(16,offset);offset+=2;

  buffer.write("data",offset,"ascii");offset+=4;
  buffer.writeUInt32LE(dataBytes,offset);offset+=4;
  for(let i=0;i<samples;i++){
    const left=Math.round(Math.sin(2*Math.PI*440*i/sampleRate)*10_000);
    const right=Math.round(Math.sin(2*Math.PI*660*i/sampleRate)*8_000);
    buffer.writeInt16LE(left,offset);offset+=2;
    buffer.writeInt16LE(right,offset);offset+=2;
  }
  return {name:"stereo-junk.wav",mimeType:"audio/wav",buffer};
}
