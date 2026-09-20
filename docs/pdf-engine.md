# Phase 3 PDF engine

Phase 3 adds a local PDF subsystem built from specialized engines rather than forcing all operations through one library.

## Architecture

- PDF.js 6.3.289: parse, inspect, text extraction, page rendering.
- pdf-lib 1.17.1: merge, split, reorder, rotate, forms, image-to-PDF, page assembly.
- qpdf via qpdf-run 0.2.1: lossless structural rewrite, linearization, repair, AES-256 encryption, decryption.
- Tesseract.js 7.0.0: local OCR with self-hosted core, worker, and traineddata.

OCR language data is bundled for English, German, French, Turkish, and Korean. Tesseract does not use its default CDN paths.

## PDF inspection

A single PDF is inspected for:
- page count and dimensions
- searchable-text pages versus pages with essentially no text
- metadata
- forms
- annotations
- signature fields
- attachments
- outlines/bookmarks
- embedded JavaScript/action presence
- permissions where PDF.js exposes them

Embedded PDF JavaScript is never executed.

## Operations

Phase 3 exposes:
- lossless optimize
- web linearization
- structural repair/rewrite
- page rendering to PNG/JPEG/WebP
- text extraction
- searchable OCR
- split/extract groups
- merge
- reorder/delete pages
- rotate pages
- flatten AcroForms
- AES-256 encryption
- decryption
- images to PDF

PDF-to-image is intentionally a multi-output PDF workflow rather than a misleading one-output conversion-graph edge.

## OCR

For scan pages, PDF.js renders the page locally and Tesseract creates a searchable PDF page with an invisible text layer. The original PDF is then rebuilt with OCR replacements only for selected scan pages. Native-text pages can remain untouched.

This design is especially appropriate for image-only scans. Selected OCR pages are rasterized during OCR because Tesseract's searchable-PDF output is image-based.

## Large-file limits

PDF.js, pdf-lib, and qpdf-run currently use memory-backed byte arrays for key operations. Phase 3 therefore does not claim unlimited PDF size.

PDF.js/pdf-lib operations are conservatively gated around:
- ~192 MiB on coarse/mobile devices
- ~768 MiB on desktop

qpdf MEMFS operations are more restrictive:
- ~96 MiB on coarse/mobile devices
- ~384 MiB on desktop

These are safety gates, not statements about theoretical browser maxima.

## Known limits

- PDF/A and PDF/X conformance conversion is not claimed.
- Digital signatures are detected, not cryptographically verified.
- Editing a signed PDF warns that signatures may become invalid.
- qpdf operations are memory-backed rather than OPFS-streamed.
- OCR language support is intentionally limited to the locally shipped models until more models are explicitly added.
- High-fidelity PDF-to-DOCX belongs to the document reconstruction/Office phase.
