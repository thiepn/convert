import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..",process.argv[3]??"dist");
const port=Number(process.argv[2]??4174);

const MIME={
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".webmanifest":"application/manifest+json",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".webp":"image/webp",
  ".wasm":"application/wasm",
  ".gz":"application/gzip",
  ".ttf":"font/ttf",
  ".woff":"font/woff",
  ".woff2":"font/woff2",
  ".pdf":"application/pdf"
};

function safePath(urlPath){
  const decoded=decodeURIComponent(urlPath.split("?")[0]);
  const normalized=path.normalize(decoded).replace(/^([/\\])+/, "");
  const full=path.resolve(root,normalized||"index.html");
  return full.startsWith(root+path.sep)||full===root?full:null;
}

const server=http.createServer((req,res)=>{
  if(req.method!=="GET"&&req.method!=="HEAD"){
    res.writeHead(405);res.end();return;
  }
  const target=safePath(req.url??"/");
  if(!target){res.writeHead(400);res.end();return;}

  let file=target;
  try{
    if(fs.statSync(file).isDirectory()) file=path.join(file,"index.html");
  }catch{}

  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});
    res.end("Not found");
    return;
  }

  res.setHeader("Content-Type",MIME[path.extname(file).toLowerCase()]??"application/octet-stream");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  // Deliberately NO COOP/COEP. This server certifies the service-worker
  // isolation fallback required by static hosts such as GitHub Pages.
  res.writeHead(200);
  if(req.method==="HEAD"){res.end();return;}
  fs.createReadStream(file).pipe(res);
});

server.listen(port,"127.0.0.1",()=>{
  console.log("Plain static test server: http://127.0.0.1:"+port+" from "+root);
});
