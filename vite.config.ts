import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

function flatCopy(src:string,dest:string,name?:string){
  return {
    src,
    dest,
    rename:name
      ?{name,stripBase:true as const}
      :{stripBase:true as const}
  };
}

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.wasm"],
  plugins: [
    viteStaticCopy({
      targets: [
        flatCopy("node_modules/wasm-vips/lib/vips-es6.js","engines/vips"),
        flatCopy("node_modules/wasm-vips/lib/vips.wasm","engines/vips"),
        flatCopy("node_modules/wasm-vips/lib/vips-heif.wasm","engines/vips"),
        flatCopy("node_modules/wasm-vips/lib/vips-jxl.wasm","engines/vips"),
        flatCopy("node_modules/wasm-vips/lib/vips-resvg.wasm","engines/vips"),
        flatCopy("node_modules/wasm-vips/THIRD-PARTY-NOTICES.md","engines/vips"),

        flatCopy("node_modules/pdfjs-dist/build/pdf.worker.min.mjs","engines/pdfjs"),

        flatCopy("node_modules/qpdf-run/src/worker.js","engines/qpdf","worker.js"),
        flatCopy("node_modules/qpdf-run/vendor/qpdf/lib/qpdf.js","engines/qpdf/lib"),
        flatCopy("node_modules/qpdf-run/vendor/qpdf/lib/qpdf.wasm","engines/qpdf/lib"),

        flatCopy("node_modules/tesseract.js/dist/worker.min.js","engines/tesseract"),
        flatCopy("node_modules/tesseract.js-core/tesseract-core*.js","engines/tesseract/core"),
        flatCopy("node_modules/tesseract.js-core/tesseract-core*.wasm","engines/tesseract/core"),
        flatCopy("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz","engines/tesseract/lang"),
        flatCopy("node_modules/@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz","engines/tesseract/lang"),
        flatCopy("node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz","engines/tesseract/lang"),
        flatCopy("node_modules/@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz","engines/tesseract/lang"),
        flatCopy("node_modules/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz","engines/tesseract/lang"),

        flatCopy("node_modules/pandoc-wasm/src/pandoc.wasm","engines/pandoc","pandoc.wasm"),

        flatCopy("node_modules/@matbee/libreoffice-converter/wasm/*","engines/libreoffice/wasm"),
        flatCopy("node_modules/@matbee/libreoffice-converter/dist/browser.worker.global.js","engines/libreoffice","browser.worker.global.js"),

        flatCopy("node_modules/libarchive.js/dist/worker-bundle.js","engines/libarchive"),
        flatCopy("node_modules/libarchive.js/dist/libarchive.wasm","engines/libarchive"),

        flatCopy("node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm","engines/duckdb"),
        flatCopy("node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm","engines/duckdb"),
        flatCopy("node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js","engines/duckdb"),
        flatCopy("node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js","engines/duckdb"),

        flatCopy("node_modules/sql.js/dist/sql-wasm.wasm","engines/sqlite"),

        flatCopy("node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js","engines/ffmpeg"),
        flatCopy("node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm","engines/ffmpeg"),

        flatCopy("node_modules/fonteditor-core/woff2/woff2.wasm","engines/font")
      ]
    })
  ],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin"
    }
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin"
    }
  },
  build: { target: "es2022" },
  worker: { format: "es" },
  test: { environment: "node" }
});
