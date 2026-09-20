# Thiepn Convert

A local-first universal browser file-conversion platform.

## Current status

Phase 5 — Archives & Compression is implemented on top of the image, media, PDF, and document engines.

### Images

JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIC/HEIF input, JPEG XL, SVG rasterization, and image-to-PDF routing.

### Media

MP4/M4A, MOV, MKV, WebM, Ogg, MP3, WAV, FLAC, AAC/ADTS, and MPEG-TS with copy-first remuxing and local WebCodecs transcoding.

### PDF

Inspection, merge/split/reorder/rotate, page rendering, text extraction, searchable OCR, qpdf optimization/repair/encryption, and image-to-PDF.

### Documents & Office

Pandoc WASM provides semantic conversion while a lazy self-hosted LibreOffice WASM worker handles layout-oriented Office fidelity conversion.

Supported families include DOC/DOCX/DOCM input, ODT, RTF, HTML, Markdown, TXT, LaTeX, Typst, EPUB, PPT/PPTX/PPTM input, ODP, Office-to-PDF conversion, and PDF-to-editable reconstruction.

### Archives & Compression

Phase 5 adds local inspection, extraction, creation, and repacking for common archive formats.

Read/input coverage includes:

- ZIP / Zip64
- 7z
- RAR v4/v5
- TAR
- GZIP
- BZIP2
- XZ
- Zstandard where supported by bundled libarchive
- TAR.GZ
- TAR.BZ2
- TAR.XZ
- CPIO/libarchive-compatible input

Creation/output coverage includes:

- ZIP / Zip64
- password-protected ZIP with AES-256
- 7z
- TAR
- TAR.GZ
- TAR.BZ2
- TAR.XZ

Archive security includes path traversal blocking, expansion-ratio/size guards, entry-count limits, extraction memory budgets, duplicate/case-collision handling, special-entry filtering, and direct raw libarchive worker RPC so hostile paths are validated before JavaScript object materialization.

Any current file selection can be switched to Pack these files. Mixed or otherwise unsupported selections automatically enter archive-building mode.

## Development

Requirements: Node.js 22 or newer.

    npm install
    npm run dev

Checks:

    npm test
    npm run typecheck
    npm run build

## Privacy

Conversion jobs do not upload files. Passwords, archive entry names, extracted files, document resources, fonts, OCR data, and all generated outputs remain local to the browser.

See docs/privacy-model.md, docs/architecture.md, docs/image-engine.md, docs/media-engine.md, docs/pdf-engine.md, docs/document-engine.md, and docs/archive-engine.md.

## Licensing

Dependency/license metadata lives in licenses/dependencies.json. Notable shipped components include GPL-2.0-or-later Pandoc WASM, MPL-2.0 document/media components, BSD-3-Clause zip.js, and the permissively licensed libarchive stack. Preserve all applicable source/binary redistribution notices.

## Roadmap

- Phase 0: foundation — implemented
- Phase 1: production image engine — implemented
- Phase 2: production audio/video engine — implemented
- Phase 3: production PDF engine — implemented
- Phase 4: documents and Office — implemented
- Phase 5: archives and compression — implemented
- Phase 6: spreadsheets, data, and databases
