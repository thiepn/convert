# Phase 9 Mobile, Performance & Large Files

Phase 9 replaces scattered mobile/desktop constants with one device-aware resource policy and separates source size from actual working-memory requirements.

## Device profile

The browser is classified from available signals:

- hardware concurrency
- Device Memory API when available
- coarse-pointer/touch context
- viewport width
- OPFS availability
- cross-origin isolation

The resulting profile is one of:

- constrained
- mobile
- balanced
- powerful

The profile controls:

- guarded working-set budget
- decoded-image budget
- maximum decoded pixels
- automatic batch parallelism
- preferred chunk size
- storage reserve
- archive extraction budget
- WASM thread count

Unknown Device Memory values are handled conservatively rather than treated as unlimited RAM.

## Memory-backed vs streaming routes

Phase 9 distinguishes three source-access models.

### Buffered

The source must be substantially materialized in JavaScript or WASM memory.

Examples:

- LibreOffice
- Pandoc
- SheetJS
- sql.js
- PDF.js/pdf-lib/qpdf
- FFmpeg legacy fallback
- PSD flattening
- font conversion
- mesh conversion
- libvips encoded input

These routes use device-scaled source limits and fail before expensive parsing when the guarded working-set estimate is unsafe.

### Lazy / streaming

The engine can consume the source without charging the whole source file against RAM.

Examples:

- Mediabunny primary media input
- DuckDB browser file-reader inputs for CSV, TSV, JSON, JSONL, and Parquet

For these routes a multi-gigabyte source can be accepted when working memory and local output workspace remain safe.

A streaming source is not the same as a streaming output. DuckDB currently materializes its exported file before the app can stage it, so large flat-data output is still memory-limited.

### Bounded-slice

Only a small region of a potentially huge source is read.

Examples:

- FITS header metadata
- camera RAW embedded-preview discovery

RAW preview discovery now scans the source in overlapping chunks and slices only the chosen JPEG preview. The full RAW file is no longer copied into memory.

## Job preflight

Before conversion the JobManager now computes separately:

1. guarded working memory
2. temporary/output workspace
3. source access mode
4. output access mode
5. large-file mode

The old calculation that treated the entire source file as mandatory temporary browser storage was removed.

Storage preflight also leaves a device-dependent reserve instead of allowing a job to consume the browser origin's last available bytes.

## OPFS

When Origin Private File System is available:

- job outputs are staged there
- streaming media can write there
- Phase 9 batch ZIP packages stream there
- completed files can stay file-backed rather than being duplicated into JavaScript memory

At application startup, abandoned Phase 8/9 job workspaces left by crashes or forced closes are removed before new conversion work begins.

## Batch scheduling

Automatic batch concurrency now comes from the same device profile.

Typical maximum concurrency:

- constrained: 1
- mobile: 1
- balanced: 2
- powerful: 3

Memory-heavy engines remain exclusive even on powerful devices.

Sequential mode remains available and always runs one task at a time.

## Images

Image resource limits now use:

- total decoded pixels
- frame/page count
- bands
- bit depth
- device decoded-image budget

libvips thread count and cache memory also scale with the device profile.

This prevents a small compressed file containing enormous decoded dimensions from bypassing large-file protections.

## Archives

Archive extraction limits now scale with the device profile.

ZIP creation can use a much larger total input when writing to an OPFS output handle because zip.js can consume Blob inputs incrementally and write the ZIP incrementally.

Memory-backed archive creation and archive repacking remain more restrictive.

Archive-bomb, path traversal, duplicate-path, and expansion-ratio guards are unchanged.

## Mobile UI

Phase 9 tightens the small-screen interface:

- safe-area-aware viewport and bottom spacing
- sticky action controls
- 48 px primary touch targets
- 16 px text/select inputs to avoid automatic iOS form zoom
- denser cards and control sections
- shorter drop area
- bounded archive/data/batch scroll regions
- reduced-motion support
- overscroll containment
- off-screen panel content-visibility
- mobile-specific batch/archive DOM row caps

Large batch and archive lists intentionally render only an initial bounded window. The operation itself is not limited to the rendered rows unless the user explicitly selects only shown archive entries.

## Caching

Large same-origin engine assets such as WASM modules now use cache-first service-worker handling after the first successful load.

Navigation remains network-first with offline shell fallback.

Ordinary static resources use stale-while-revalidate behavior.

This avoids repeatedly fetching large codec runtimes while still allowing the app shell to update.

## Known large-file boundaries

Phase 9 does not claim every format can be arbitrarily large.

Still memory-backed:

- Office fidelity conversion
- Pandoc semantic conversion
- PDF structural editing
- SheetJS workbooks
- sql.js databases
- Arrow IPC input/output
- DuckDB exported result buffers
- legacy FFmpeg
- PSD
- fonts
- meshes
- non-streamed archive results

Large-file support means that streaming/sliced routes no longer inherit irrelevant RAM limits, while buffered routes fail early with device-specific limits.

## Privacy

All profiling is local browser capability detection. No hardware profile, file size, batch state, or performance metric is uploaded to a conversion server.
