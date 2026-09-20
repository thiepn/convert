# Changelog

## 1.0.0 — 2026-09-20

First stable release of Thiepn Convert.

### Core platform
- local-only conversion architecture with independent format detection, planning, validation, and resource preflight
- browser workers, WebAssembly, WebCodecs, streams, and OPFS-backed temporary workspaces
- no conversion server and no file-content analytics

### Conversion coverage
- production images, audio/video, PDF, documents/Office, archives, spreadsheets, structured data, SQLite
- bounded advanced/legacy support for PSD, camera RAW previews, fonts, subtitles, legacy media, FB2, triangle meshes, and FITS metadata
- recognition-only safety boundaries for formats without a reliable local converter

### Batch and performance
- mixed-format common-target batches
- failure isolation, cancellation, in-session resume, naming templates, optional ZIP packaging
- device-aware memory/storage budgets and large-file streaming/slice-based paths where engines genuinely support them
- mobile-first density, safe areas, bounded large lists, and adaptive concurrency

### Release hardening
- human-readable error recovery
- keyboard and screen-reader progress/status support
- explicit service-worker update activation
- install manifest, app icon, and supported OS file-open integration
- stricter production CSP/security headers
- reproducible release certification command and build-asset verification
