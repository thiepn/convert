# Thiepn Convert

A local-first universal browser file-conversion platform.

## Current status

Phase 4 — Documents & Office is implemented on top of the image, media, and PDF engines.

### Images

JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIC/HEIF input, JPEG XL, SVG rasterization, and image-to-PDF routing.

### Media

MP4/M4A, MOV, MKV, WebM, Ogg, MP3, WAV, FLAC, AAC/ADTS, and MPEG-TS with copy-first remuxing and local WebCodecs transcoding.

### PDF

Inspection, merge/split/reorder/rotate, page rendering, text extraction, searchable OCR, qpdf optimization/repair/encryption, and image-to-PDF.

### Documents & Office

Semantic conversion uses Pandoc WASM; fidelity conversion uses a lazy self-hosted LibreOffice WASM worker.

Supported document families include DOC / DOCX / DOCM input, ODT, RTF, HTML, Markdown, TXT, LaTeX, Typst, EPUB, PPT / PPTX / PPTM input, ODP, Office/document to PDF fidelity conversion, and PDF to editable DOCX/ODT/HTML/Markdown reconstruction.

Phase 4 includes semantic-vs-fidelity route selection, tracked-change policy, extracted/embedded resource handling, reference DOCX/ODT/PPTX styling, local user-supplied fonts for LibreOffice, macro detection for packaged OOXML, external-relationship warnings, selective ZIP package inspection with bomb/path guards, document batch conversion, sidecar asset output, and output reopening/validation.

The LibreOffice runtime is intentionally lazy and is only downloaded/initialized when a fidelity route actually needs it.

## Development

Requirements: Node.js 22 or newer.

    npm install
    npm run dev

Checks:

    npm test
    npm run typecheck
    npm run build

## Privacy

Conversion jobs do not upload files. Document resources, fonts, reference files, extracted text, and outputs remain local to the browser.

See docs/privacy-model.md, docs/architecture.md, docs/image-engine.md, docs/media-engine.md, docs/pdf-engine.md, and docs/document-engine.md.

## Licensing

The dependency manifest is in licenses/dependencies.json. In particular, pandoc-wasm ships the GPL-2.0-or-later Pandoc binary; distribution must comply with the relevant GPL obligations.

## Roadmap

- Phase 0: foundation — implemented
- Phase 1: production image engine — implemented
- Phase 2: production audio/video engine — implemented
- Phase 3: production PDF engine — implemented
- Phase 4: documents and Office — implemented
- Phase 5: archives
- Phase 6: spreadsheets, data, and databases
