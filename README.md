# Thiepn Convert

A local-first universal browser file-conversion platform.

## Current status

Phase 7 — Advanced & Legacy Format Coverage is implemented on top of the image, media, PDF, document, archive, spreadsheet, data, and database engines.

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
- TTF / OTF / WOFF / WOFF2 / EOT font conversion
- SRT / WebVTT / ASS subtitle conversion
- AVI / FLV / ASF / WMV / WMA through a lazy local FFmpeg WASM fallback
- FB2 → semantic HTML → existing document routes
- OBJ / STL / ASCII PLY triangle-mesh conversion
- FITS header metadata → JSON

PSB, Kindle/MOBI, DXF/DWG, glTF/GLB, HDF5, and NetCDF are recognized but intentionally have no conversion route until a browser-local implementation can meet the project's fidelity, security, validation, and licensing gates.

## Development

Requirements: Node.js 22 or newer.

    npm install
    npm run dev

Checks:

    npm test
    npm run typecheck
    npm run build

## Privacy

Conversion jobs do not upload files. Spreadsheet contents, database tables, SQL text, passwords, OCR data, document resources, fonts, archive entries, and generated outputs remain local to the browser.

See docs/privacy-model.md, docs/architecture.md, docs/image-engine.md, docs/media-engine.md, docs/pdf-engine.md, docs/document-engine.md, docs/archive-engine.md, docs/data-engine.md, and docs/specialist-engine.md.

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
