import fs from "node:fs";
import path from "node:path";

const file=path.resolve("node_modules/@matbee/libreoffice-converter/dist/browser.worker.global.js");
if(!fs.existsSync(file)){
  throw new Error("LibreOffice browser worker was not installed: "+file);
}

let source=fs.readFileSync(file,"utf8");
const marker="WASM initialization timeout";
const markerIndex=source.indexOf(marker);
if(markerIndex<0) throw new Error("LibreOffice initialization-timeout marker was not found.");

const windowStart=markerIndex;
const windowEnd=Math.min(source.length,markerIndex+500);
const tail=source.slice(windowStart,windowEnd);

if(/(?:360000|36e4)/.test(tail)){
  console.log("LibreOffice initialization timeout already patched to 360000 ms.");
  process.exit(0);
}

const match=tail.match(/(?:120000|12e4)/);
if(!match||match.index==null){
  throw new Error("LibreOffice 120000 ms initialization deadline was not found near its timeout marker.");
}

const start=windowStart+match.index;
source=source.slice(0,start)+"360000"+source.slice(start+match[0].length);
fs.writeFileSync(file,source);
console.log("Patched LibreOffice browser WASM initialization timeout: 120000 ms -> 360000 ms.");
