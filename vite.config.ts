import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: "./",
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "node_modules/wasm-vips/lib/vips-es6.js", dest: "engines/vips" },
        { src: "node_modules/wasm-vips/lib/vips.wasm", dest: "engines/vips" },
        { src: "node_modules/wasm-vips/lib/vips-heif.wasm", dest: "engines/vips" },
        { src: "node_modules/wasm-vips/lib/vips-jxl.wasm", dest: "engines/vips" },
        { src: "node_modules/wasm-vips/lib/vips-resvg.wasm", dest: "engines/vips" },
        { src: "node_modules/wasm-vips/THIRD-PARTY-NOTICES.md", dest: "engines/vips" },

        { src: "node_modules/pdfjs-dist/build/pdf.worker.min.mjs", dest: "engines/pdfjs" },

        { src: "node_modules/qpdf-run/src/worker.js", dest: "engines/qpdf", rename: "worker.js" },
        { src: "node_modules/qpdf-run/vendor/qpdf/lib/qpdf.js", dest: "engines/qpdf/lib" },
        { src: "node_modules/qpdf-run/vendor/qpdf/lib/qpdf.wasm", dest: "engines/qpdf/lib" },

        { src: "node_modules/tesseract.js/dist/worker.min.js", dest: "engines/tesseract" },
        { src: "node_modules/tesseract.js-core/tesseract-core*.js", dest: "engines/tesseract/core" },
        { src: "node_modules/tesseract.js-core/tesseract-core*.wasm", dest: "engines/tesseract/core" },
        { src: "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", dest: "engines/tesseract/lang" },
        { src: "node_modules/@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz", dest: "engines/tesseract/lang" },
        { src: "node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz", dest: "engines/tesseract/lang" },
        { src: "node_modules/@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz", dest: "engines/tesseract/lang" },
        { src: "node_modules/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz", dest: "engines/tesseract/lang" }
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
  test: { environment: "node" }
});
