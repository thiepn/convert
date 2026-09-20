# Thiepn Convert

A local-first universal file conversion platform for desktop and mobile browsers.

## Current status

Phase 3 — Production PDF Engine is implemented on top of the Phase 0 core, Phase 1 image engine, and Phase 2 media engine.

### Images

JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIC/HEIF input, JPEG XL, SVG rasterization, and image-to-PDF routing.

### Media

MP4/M4A, MOV, MKV, WebM, Ogg, MP3, WAV, FLAC, AAC/ADTS, and MPEG-TS with copy-first remuxing and local WebCodecs transcoding.

### PDF

- PDF inspection and scan/text classification
- merge, split, reorder, delete, and rotate pages
- page rendering to PNG/JPEG/WebP
- local text extraction
- local searchable OCR
- lossless structural optimization
- web linearization
- repair/rewrite
- form flattening
- AES-256 encryption and decryption
- images to PDF
- signature/action warnings
- attachment/bookmark/form/annotation inspection

The PDF stack uses PDF.js, pdf-lib, qpdf WASM, and Tesseract.js. OCR assets and traineddata are self-hosted; no OCR CDN or cloud conversion service is used.

## Development

Requirements: Node.js 22 or newer.

    npm install
    npm run dev

Checks:

    npm test
    npm run typecheck
    npm run build

## Privacy

Conversion jobs do not upload files. PDF passwords, text, OCR data, rendered pages, and outputs remain local to the browser.

See docs/privacy-model.md, docs/architecture.md, docs/image-engine.md, docs/media-engine.md, and docs/pdf-engine.md.

## Roadmap

- Phase 0: foundation — implemented
- Phase 1: production image engine — implemented
- Phase 2: production audio/video engine — implemented
- Phase 3: production PDF engine — implemented
- Phase 4: documents and Office
- Phase 5: archives
- Phase 6: spreadsheets, data, and databases
