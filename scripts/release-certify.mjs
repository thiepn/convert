import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const failures=[];
const checks=[];

function read(rel){
  const full=path.join(root,rel);
  if(!fs.existsSync(full)){
    failures.push("Missing required file: "+rel);
    return "";
  }
  return fs.readFileSync(full,"utf8");
}
function ok(name,condition,detail=""){
  checks.push({name,condition,detail});
  if(!condition) failures.push(name+(detail?": "+detail:""));
}
function exists(rel){
  const value=fs.existsSync(path.join(root,rel));
  ok("Build contains "+rel,value);
}

const pkg=JSON.parse(read("package.json")||"{}");
ok("Package version is v1.0.0",pkg.version==="1.0.0",String(pkg.version??"missing"));

const manifest=JSON.parse(read("public/manifest.webmanifest")||"{}");
ok("Manifest has stable app id",manifest.id==="./");
ok("Manifest is standalone",manifest.display==="standalone");
ok("Manifest has install icon",Array.isArray(manifest.icons)&&manifest.icons.length>0);
ok("Manifest declares file handlers",Array.isArray(manifest.file_handlers)&&manifest.file_handlers.length>0);

const index=read("index.html");
const csp=index.match(/Content-Security-Policy" content="([^"]+)"/)?.[1]??"";
ok("HTML CSP exists",Boolean(csp));
ok("CSP restricts connections to self",/connect-src\s+'self'(?:;|$)/.test(csp));
ok("CSP does not allow global ws/wss",!/(?:^|\s)(?:ws:|wss:)/.test(csp));
ok("Converter has skip navigation",index.includes('class="skip-link"'));
ok("Converter exposes accessible progressbar",index.includes('role="progressbar"'));
ok("Converter exposes Start over recovery",index.includes('id="start-over-button"'));

const headers=read("public/_headers");
ok("Headers enable COOP",headers.includes("Cross-Origin-Opener-Policy: same-origin"));
ok("Headers enable COEP",headers.includes("Cross-Origin-Embedder-Policy: require-corp"));
ok("Headers deny framing",headers.includes("frame-ancestors 'none'"));
ok("Headers restrict connections",headers.includes("connect-src 'self'"));

const sw=read("public/sw.js");
ok("Service worker uses v1 cache",sw.includes('thiepn-convert-v1-0-0'));
ok("Service worker supports explicit update activation",sw.includes('type==="SKIP_WAITING"'));
const installBody=sw.match(/self\.addEventListener\("install"[\s\S]*?\n}\);/)?.[0]??"";
ok("Service worker does not force updates during install",!installBody.includes("skipWaiting"));

const licenses=JSON.parse(read("licenses/dependencies.json")||"{}");
ok("Dependency inventory is Phase 10",licenses.phase===10,String(licenses.phase??"missing"));

const privacy=read("docs/privacy-model.md");
ok("Privacy model forbids file uploads",/never uploaded/i.test(privacy));
ok("Privacy model covers same-origin engine assets",/same origin|same-origin/i.test(privacy));

[
  "dist/index.html",
  "dist/sw.js",
  "dist/manifest.webmanifest",
  "dist/icon.svg",
  "dist/engines/vips/vips.wasm",
  "dist/engines/pdfjs/pdf.worker.min.mjs",
  "dist/engines/qpdf/lib/qpdf.wasm",
  "dist/engines/pandoc/pandoc.wasm",
  "dist/engines/libarchive/libarchive.wasm",
  "dist/engines/duckdb/duckdb-mvp.wasm",
  "dist/engines/sqlite/sql-wasm.wasm",
  "dist/engines/ffmpeg/ffmpeg-core.wasm",
  "dist/engines/font/woff2.wasm"
].forEach(exists);

for(const check of checks){
  console.log((check.condition?"PASS ":"FAIL ")+check.name+(check.detail?" — "+check.detail:""));
}

if(failures.length){
  console.error("\nRelease certification failed:");
  for(const failure of failures) console.error("- "+failure);
  process.exit(1);
}

console.log("\nRelease certification passed: "+checks.length+" checks.");
