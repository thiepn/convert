import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dist=path.join(root,"dist");
const configPath=path.join(root,"config","performance-budgets.json");
const reportDir=path.join(root,".performance");
const reportPath=path.join(reportDir,"static-report.json");

function fail(message){
  console.error("PERF FAIL "+message);
  process.exitCode=1;
}

function walk(dir){
  if(!fs.existsSync(dir)) return [];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...walk(full));
    else if(entry.isFile()) out.push(full);
  }
  return out;
}

function bytes(file){
  return fs.statSync(file).size;
}

function gzipBytes(file){
  return zlib.gzipSync(fs.readFileSync(file),{level:9}).byteLength;
}

function rel(file){
  return path.relative(root,file).replaceAll(path.sep,"/");
}

function sum(files,measure=bytes){
  return files.reduce((total,file)=>total+measure(file),0);
}

if(!fs.existsSync(dist)){
  console.error("Performance certification requires a production build in dist/.");
  process.exit(1);
}
if(!fs.existsSync(configPath)){
  console.error("Missing config/performance-budgets.json.");
  process.exit(1);
}

const config=JSON.parse(fs.readFileSync(configPath,"utf8"));
const budget=config.static??{};
const indexPath=path.join(dist,"index.html");
const index=fs.readFileSync(indexPath,"utf8");

const referenced=[
  ...[...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["']/gi)].map(match=>match[1]),
  ...[...index.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+\.css)["']/gi)].map(match=>match[1]),
  ...[...index.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css)["'][^>]*\brel=["']stylesheet["']/gi)].map(match=>match[1])
];

const startupFiles=[indexPath];
for(const value of new Set(referenced)){
  const normalized=value.replace(/^\.\//,"").split(/[?#]/,1)[0];
  const full=path.join(dist,normalized);
  if(fs.existsSync(full)) startupFiles.push(full);
}

const entryJs=startupFiles.filter(file=>file.endsWith(".js"));
const css=startupFiles.filter(file=>file.endsWith(".css"));
const allFiles=walk(dist);
const assetJs=allFiles.filter(file=>file.endsWith(".js"));
const workerJs=assetJs.filter(file=>/worker/i.test(path.basename(file)));
const engineFiles=walk(path.join(dist,"engines"));

const actual={
  indexHtmlBytes:bytes(indexPath),
  startupRawBytes:sum(startupFiles),
  startupGzipBytes:sum(startupFiles,gzipBytes),
  entryJavaScriptBytes:sum(entryJs),
  entryJavaScriptGzipBytes:sum(entryJs,gzipBytes),
  cssBytes:sum(css),
  workerJavaScriptTotalBytes:sum(workerJs),
  largestWorkerJavaScriptBytes:workerJs.length?Math.max(...workerJs.map(bytes)):0,
  engineAssetsTotalBytes:sum(engineFiles),
  distTotalBytes:sum(allFiles)
};

const rows=[
  ["indexHtmlBytes","index.html raw"],
  ["startupRawBytes","startup raw"],
  ["startupGzipBytes","startup gzip"],
  ["entryJavaScriptBytes","entry JavaScript raw"],
  ["entryJavaScriptGzipBytes","entry JavaScript gzip"],
  ["cssBytes","startup CSS raw"],
  ["workerJavaScriptTotalBytes","worker JavaScript total"],
  ["largestWorkerJavaScriptBytes","largest worker JavaScript"],
  ["engineAssetsTotalBytes","lazy engine assets total"],
  ["distTotalBytes","full dist total"]
];

for(const [key,label] of rows){
  const value=actual[key];
  const limit=Number(budget[key]);
  const ok=Number.isFinite(limit)&&value<=limit;
  console.log(
    (ok?"PERF PASS ":"PERF FAIL ")
    +label+": "+value.toLocaleString("en-US")+" B"
    +" / "+(Number.isFinite(limit)?limit.toLocaleString("en-US"):"missing")+" B"
  );
  if(!ok) process.exitCode=1;
}

const report={
  generatedAt:new Date().toISOString(),
  budgets:budget,
  actual,
  startupFiles:startupFiles.map(file=>({
    file:rel(file),
    bytes:bytes(file),
    gzipBytes:gzipBytes(file)
  })),
  workers:workerJs
    .map(file=>({file:rel(file),bytes:bytes(file)}))
    .sort((a,b)=>b.bytes-a.bytes),
  engineFamilies:Object.fromEntries(
    fs.existsSync(path.join(dist,"engines"))
      ?fs.readdirSync(path.join(dist,"engines"),{withFileTypes:true})
        .filter(entry=>entry.isDirectory())
        .map(entry=>{
          const files=walk(path.join(dist,"engines",entry.name));
          return [entry.name,sum(files)];
        })
        .sort((a,b)=>b[1]-a[1])
      :[]
  )
};

fs.mkdirSync(reportDir,{recursive:true});
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
console.log("Performance report: "+path.relative(root,reportPath));

if(process.exitCode){
  console.error("\nStatic performance budgets exceeded.");
  process.exit(process.exitCode);
}
console.log("\nStatic performance budgets passed.");
