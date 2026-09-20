import { copyFile, mkdir, rm, access } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("wasm-vips/vips.wasm");
const libDir = dirname(wasmPath);
const packageRoot = dirname(libDir);
const destination = resolve("public/engines/vips");

const required = [
  "vips-es6.js",
  "vips-es6.worker.js",
  "vips.wasm",
  "vips-heif.wasm",
  "vips-jxl.wasm",
  "vips-resvg.wasm"
];

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const file of required) {
  const source = join(libDir, file);
  await access(source, constants.R_OK);
  await copyFile(source, join(destination, file));
}

for (const file of ["THIRD-PARTY-NOTICES.md", "LICENSE", "versions.json"]) {
  const source = join(packageRoot, file);
  try {
    await access(source, constants.R_OK);
    await copyFile(source, join(destination, file));
  } catch {
    if (file === "versions.json") {
      const fallback = join(libDir, file);
      try {
        await access(fallback, constants.R_OK);
        await copyFile(fallback, join(destination, file));
      } catch {}
    }
  }
}

console.log("Prepared wasm-vips browser assets in public/engines/vips");
