# Phase 4 Documents & Office engine

Phase 4 deliberately separates semantic conversion from visual-layout fidelity.

## Semantic route — Pandoc WASM

Pandoc 3.9 runs in a disposable browser worker and is used when document structure and editability matter more than exact pagination.

Core semantic formats include DOCX/DOCM input, ODT, RTF, HTML, Markdown, plain text, LaTeX, Typst, EPUB, PPTX/PPTM input. Outputs include DOCX, ODT, RTF, HTML, Markdown, plain text, LaTeX, Typst, EPUB, and PPTX.

The browser WASM sandbox cannot fetch URLs or launch system commands. Every resource must be explicitly supplied by the user.

Tracked Word changes can be accepted, rejected, or retained in Pandoc's semantic representation. Reference DOCX/ODT/PPTX files can style compatible generated outputs. Extracted media is returned as local sidecar output.

Pandoc is GPL-2.0-or-later. The app dependency manifest records that distribution constraint explicitly.

## Fidelity route — LibreOffice WASM

Appearance-preserving Office conversion uses @matbee/libreoffice-converter with a self-hosted LibreOffice WebAssembly runtime.

Supported fidelity families include DOC, DOCX, ODT, RTF, HTML, TXT, EPUB to Writer-compatible outputs/PDF, and PPT, PPTX, ODP to presentation-compatible outputs/PDF.

The engine is intentionally lazy. Its large WASM/data runtime is not fetched when the user opens the app or performs image/media/PDF/Pandoc conversions. It initializes only when a selected route actually uses LibreOffice.

The converter runs in its own browser worker and requires cross-origin isolation / SharedArrayBuffer.

User-selected font files can be injected before LibreOffice initializes. Fonts stay local. Changing the font set restarts the fidelity engine so fontconfig can rescan before document layout.

## Route preference

The conversion graph marks document edges as semantic or fidelity.

Structure / editability penalizes fidelity edges when a semantic equivalent exists.

Appearance / layout fidelity penalizes semantic edges when LibreOffice can handle the route directly.

Mixed routes remain valid. Example: Markdown to DOCX through Pandoc, then DOCX to PDF through LibreOffice. This is required because browser Pandoc cannot directly generate PDF.

## Package inspection and security

DOCX, PPTX, ODT, ODP, and EPUB are inspected by reading the ZIP central directory and only decompressing selected small XML/package entries.

Guards include absolute/path-traversal rejection, entry-count limits, central-directory size limits, expanded-size limits, compression-ratio limits, and selective entry inflation limits.

The inspector does not inflate every embedded image merely to count or classify the document.

Macro-enabled OOXML packages are detected through VBA payload entries. They are never sent directly to the LibreOffice fidelity route; semantic conversion reads document structure without executing VBA.

Legacy DOC/PPT receive limited structural inspection. They are processed only inside the isolated LibreOffice browser runtime and receive an explicit warning because macro payloads cannot be reliably ruled out with the lightweight package inspector.

External relationships are counted and warned. Pandoc's WASM sandbox cannot fetch them; the app does not proactively download document resources.

## PDF to editable reconstruction

Phase 4 adds an explicit PDF reconstruction engine.

The route is PDF positioned text, then PDF.js text extraction, then page-separated Markdown text, then Pandoc to DOCX / ODT / HTML / Markdown / LaTeX / Typst / EPUB.

This is deliberately called editable reconstruction. It does not claim to preserve exact PDF layout, fonts, floating objects, headers/footers, forms, or pagination.

## Resource and memory limits

Pandoc WASM:
- source around 64 MiB mobile / 160 MiB desktop
- reference/resources additionally bounded

LibreOffice:
- source around 64 MiB mobile / 256 MiB desktop
- imported fonts bounded separately
- large fixed runtime memory/download footprint

These are conservative application safety gates, not theoretical WebAssembly limits.

## Known limits

- DOCM/PPTM output is not produced; macro payloads are not preserved into newly generated macro-enabled files.
- Advanced Word layout can still differ in LibreOffice from Microsoft Word.
- SmartArt, proprietary Office effects, unsupported fonts, and complex PowerPoint animations may render differently.
- Pandoc semantic output intentionally does not preserve exact pagination.
- LibreOffice is not loaded for lightweight Markdown/HTML conversions.
- PDF-to-DOCX is semantic reconstruction, not layout-perfect reverse engineering.
- No document content is rendered as unsanitized HTML inside the app UI.
