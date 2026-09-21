# Thiepn Convert

A local-first universal browser file-conversion platform.

## Current status

Thiepn Convert v1.0.1 is the post-v1 production-hardened release. Phase 10 completed the Phase 0–10 roadmap; Maintenance Pass 1 adds deployment and real-browser certification.

### Images

JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIC/HEIF input, JPEG XL, SVG rasterization, and image-to-PDF routing.

### Media

MP4/M4A, MOV, MKV, WebM, Ogg, MP3, WAV, FLAC, AAC/ADTS, and MPEG-TS with copy-first remuxing and local WebCodecs transcoding.

### PDF

Inspection, merge/split/reorder/rotate, page rendering, text extraction, searchable OCR, qpdf optimization/repair/encryption, and image-to-PDF.

### Documents & Office

Pandoc WASM provides semantic conversion while a lazy self-hosted LibreOffice WASM worker handles layout-oriented Office fidelity conversion.

### Archives & Compression

ZIP/Zip64/AES-256, 7z, RAR extraction, TAR and compressed TAR families, safe selective extraction, archive creation, and repacking.

### Spreadsheets

Workbook semantic processing uses SheetJS CE 0.20.3. Supported spreadsheet families include:

- XLS / XLSX
- XLSM input with VBA detection/stripping
- XLSB
- ODS / FODS
- CSV / TSV bridges
- JSON / JSONL bridges

Spreadsheet inspection reports worksheets, ranges, formulas, merges, links, named ranges, metadata, hidden sheets, and macros.

The user can choose semantic workbook conversion or the existing lazy LibreOffice Calc fidelity route. SheetJS preserves formula expressions where possible but does not calculate formulas; LibreOffice Calc may recalculate formulas during fidelity conversion.

### Structured data

DuckDB-Wasm 1.32.0 provides local schema inference, preview, restricted SQL transforms, and conversion for:

- CSV / TSV
- JSON / JSON Lines
- Parquet
- Apache Arrow IPC

CSV defaults to dialect auto-detection. Parquet output uses Zstandard compression.

### SQLite

sql.js 1.14.2 provides local SQLite inspection and guarded import/export:

- tables and views
- schema
- row counts
- selected-table preview
- CSV / TSV / JSON / JSONL export
- JSON / JSONL to SQLite

The optional SQL transform is restricted to one read-only SELECT/WITH query. Network URLs, file-reader functions, extensions, attachments, and mutations are blocked.


### Advanced & legacy compatibility

Phase 7 adds deliberately bounded specialist packs:

- PSD → flattened PNG / JPEG / WebP
- Camera RAW families → embedded JPEG preview (not RAW development)
- TTF / WOFF / EOT font conversion plus OTF → TTF; WOFF2 recognition-only after strict-CSP browser certification
- SRT / WebVTT / ASS subtitle conversion
- AVI / FLV / ASF / WMV / WMA through a lazy local FFmpeg WASM fallback
- FB2 → semantic HTML → existing document routes
- OBJ / STL / ASCII PLY triangle-mesh conversion
- FITS header metadata → JSON

PSB, Kindle/MOBI, DXF/DWG, glTF/GLB, HDF5, and NetCDF are recognized but intentionally have no conversion route until a browser-local implementation can meet the project's fidelity, security, validation, and licensing gates.

### Batch conversion & pipelines

Phase 8 adds a first-class batch scheduler over the existing conversion graph:

- shared conversion settings across many files
- mixed recognized-format batches when a common target exists
- capability-aware automatic scheduling or strict sequential execution
- per-file failure isolation
- naming templates and collision handling
- explicit successful-output ZIP packaging
- cancellation with in-session resume/retry
- visible compiled steps for resize, compression, metadata, sheet/table selection, local SQL filtering, conversion, and packaging

See docs/batch-pipelines.md for execution semantics and limits.

### Mobile, performance & large files

Phase 9 adds a centralized device profile and route-aware memory/storage preflight:

- device-scaled RAM, image, archive, and batch budgets
- proper distinction between buffered, streaming, and bounded-slice inputs
- multi-gigabyte primary-media input support when storage/output constraints allow it
- chunked camera-RAW embedded-preview scanning
- OPFS-streamed Phase 8 batch ZIP packaging
- orphaned-workspace cleanup
- device-scaled libvips threads/cache and batch concurrency
- bounded DOM rendering for very large batch/archive lists
- cache-first large WASM engine assets
- safe-area-aware, denser mobile UI with sticky actions

See docs/mobile-performance-large-files.md for exact behavior and remaining memory-backed boundaries.

### Universal UX, hardening & release

Phase 10 turns the Phase 9 engine stack into the stable v1.0 product:

- human-readable error/recovery messages across engines
- keyboard-operable file selection, skip navigation, visible focus, live progress and result semantics
- explicit Start over cleanup and installed-app file-open handling
- safe service-worker updates that wait for user activation
- stricter local-only production CSP and framing protection
- stable PWA identity and install icon
- one reproducible `npm run release:certify` gate
- release-contract tests, critical engine-asset verification, changelog, and certification documentation

See docs/release-certification.md for the stable-release contract.

## Development

Requirements: Node.js 22 or newer.

    npm install
    npm run dev

Checks:

    npm test
    npm run typecheck
    npm run build
    npm run release:certify

## Privacy

Conversion jobs do not upload files. Spreadsheet contents, database tables, SQL text, passwords, OCR data, document resources, fonts, archive entries, and generated outputs remain local to the browser.

See docs/privacy-model.md, docs/architecture.md, docs/image-engine.md, docs/media-engine.md, docs/pdf-engine.md, docs/document-engine.md, docs/archive-engine.md, docs/data-engine.md, docs/specialist-engine.md, docs/batch-pipelines.md, docs/mobile-performance-large-files.md, and docs/release-certification.md.

## Licensing

Dependency/license metadata lives in licenses/dependencies.json. Notable components include Apache-2.0 SheetJS CE, MIT DuckDB-Wasm, Apache-2.0 Arrow JS, MIT sql.js, GPL-2.0-or-later Pandoc WASM, GPL-2.0-or-later FFmpeg WASM core, MPL-2.0 media/document components, and permissive archive/image/specialist dependencies.

## Roadmap

- Phase 0: foundation — implemented
- Phase 1: production image engine — implemented
- Phase 2: production audio/video engine — implemented
- Phase 3: production PDF engine — implemented
- Phase 4: documents and Office — implemented
- Phase 5: archives and compression — implemented
- Phase 6: spreadsheets, data, and databases — implemented
- Phase 7: advanced and legacy format coverage — implemented
- Phase 8: batch conversion and pipelines — implemented
- Phase 9: mobile, performance, and large files — implemented
- Phase 10: universal UX, hardening, and release — implemented
