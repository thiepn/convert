# Thiepn Convert

A local-first universal file conversion platform for desktop and mobile browsers.

## Current status

Phase 1 — Production Image Engine is implemented on top of the Phase 0 conversion architecture.

Current image support:
- JPEG
- PNG
- WebP
- GIF
- TIFF
- AVIF
- HEIC / HEIF input
- JPEG XL
- SVG input / rasterization

The primary path is wasm-vips in a dedicated worker. Real HEIC input uses a separate local HEVC decoder before entering the libvips pipeline. The Phase 0 browser canvas engine remains as a degraded JPEG/PNG/WebP fallback.

Phase 1 includes content-based detection, detailed image inspection, same-format optimization, resize presets, metadata policies, transparency handling, animation/multipage awareness, lossless preference, target-size search, batch conversion, local ZIP packaging, worker recycling, resource guards, and independent output validation.

## Development

Requirements: Node.js 22 or newer.

    npm install
    npm run dev

Checks:

    npm test
    npm run typecheck
    npm run build

## Privacy

Conversion jobs do not upload files. Processing happens inside the browser. Application and engine assets are downloaded from this site's own origin and cached for offline use.

See docs/privacy-model.md, docs/architecture.md, and docs/image-engine.md.

## Roadmap

- Phase 0: foundation — implemented
- Phase 1: production image engine — implemented
- Phase 2: audio and video
- Phase 3: PDF
- Phase 4: documents and Office
- Phase 5: archives
- Phase 6: spreadsheets, data, and databases
