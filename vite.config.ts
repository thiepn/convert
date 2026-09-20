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
        { src: "node_modules/wasm-vips/THIRD-PARTY-NOTICES.md", dest: "engines/vips" }
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
  build: {
    target: "es2022"
  },
  test: {
    environment: "node"
  }
});
