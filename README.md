# Thiepn Convert

A local-first universal file conversion platform for desktop and mobile browsers.

## Current status — Phase 1

Phase 0 established the engine registry, conversion graph, worker isolation, OPFS jobs, privacy guard, capability detection, validation, offline shell, and resource preflight.

Phase 1 adds the production image subsystem.

### Image support

**Input**
- JPEG
- PNG
- WebP
- GIF
- TIFF
- BMP
- AVIF
- HEIC / HEIF
- JPEG XL
- SVG

**Output**
- JPEG
- PNG
- WebP
- GIF
- TIFF
- AVIF
- JPEG XL

HEIC/HEIF is intentionally decode-only in Phase 1. The current wasm-vips HEIF side module is built for AVIF and does not ship an HEVC decoder/encoder. HEIC input is therefore decoded through a separate local libheif path rather than falsely advertising unsupported HEIC output.

### Phase 1 capabilities

- wasm-vips production processing in disposable workers
- local HEIC/HEIF decoding
- lazy AVIF, JPEG XL, and SVG WASM modules
- JPEG / PNG / WebP browser fallback on runtimes where wasm-vips prerequisites are unavailable
- batch conversion
- header-level image inspection before full decode
- actual alpha / animation / multipage loss warnings
- EXIF autorotation
- metadata Preserve / Privacy / Strip policies
- ICC-aware privacy policy
- resizing by longest edge, width, height, or percentage
- target file-size mode for lossy codecs
- lossless WebP / AVIF / JPEG XL modes
- animated GIF/WebP preservation where target supports it
- multipage TIFF preservation for TIFF-to-TIFF processing
- local output validation
- mobile-aware decoded-memory safety limits
- side-by-side before/after preview for single-image jobs
- sequential batch processing to avoid mobile memory spikes

## Development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

The predev/prebuild hook copies pinned wasm-vips runtime assets into `public/engines/vips`. Runtime conversion assets are served from the same origin.

Checks:

```bash
npm test
npm run typecheck
npm run build
```

## Privacy

Conversion jobs do not upload files. Processing occurs in browser workers using browser APIs and WebAssembly. Runtime engine assets may be downloaded from this site's own origin and cached for offline use.

See:
- `docs/privacy-model.md`
- `docs/architecture.md`
- `docs/image-engine.md`

## Roadmap

- Phase 2: audio and video
- Phase 3: PDF
- Phase 4: documents and Office
- Phase 5: archives
- Phase 6: spreadsheets, data, and databases
