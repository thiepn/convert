# Changelog

## Unreleased — Maintenance Pass 7

### Cross-browser conversion parity & mobile hardening
- add representative conversion parity tests across Chromium desktop, Chromium mobile, Firefox, and WebKit mobile
- certify common images, subtitles, triangle meshes, SheetJS, DuckDB-Wasm, Pandoc WASM, qpdf, libarchive, and WAV → FLAC in every automated browser project
- fix WebKit FLAC output by registering the bundled FLAC encoder unconditionally and forcing FLAC transcoding
- add machine-readable browser parity reports to CI
- apply top/right/bottom/left mobile safe-area insets
- add short-landscape mobile density and sticky-action hardening
- enforce a 44 px mobile interaction floor for quick targets, downloads, and archive actions
- add touch file selection, mobile conversion, viewport overflow, visual viewport, and portrait/landscape regression coverage
- certify a service-worker-controlled offline shell fetch and local subtitle conversion in Chromium mobile
- certify cached shell assets in WebKit mobile while documenting Playwright WebKit's synthetic-offline limitations
- add Apple touch icon and Home Screen web-app metadata
- add an explicit physical Android/iOS acceptance checklist; CI emulation is not presented as physical-device certification


## Unreleased — Maintenance Pass 6

### Performance regression budgets, cold-start & responsiveness
- add a versioned performance budget source of truth in `config/performance-budgets.json`
- enforce production startup, JavaScript, CSS, worker, lazy-engine, and full-dist byte ceilings during `release:certify`
- emit and retain machine-readable static performance reports in CI
- add runtime-ready and completed-selection Performance marks for deterministic browser timing
- certify DuckDB and PDF.js cold/warm inspection latency
- certify 24-file batch throughput together with main-thread heartbeat responsiveness
- certify renderer V8 heap peak and retained growth with Chromium CDP garbage collection
- retain runtime performance reports in CI
- calibrate static/runtime ceilings against two successful GitHub Actions runs with deliberate regression headroom
- document measured baseline, ceilings, interpretation, and budget-change policy


## Unreleased — Maintenance Pass 5

### Long-session, concurrency & resource hardening
- centrally track retained OPFS workspaces and make release/cleanup idempotent
- prevent disposed jobs from registering retained outputs after lifecycle cleanup
- revoke app-owned Blob URLs synchronously when results are replaced, cleared, or the page is hidden
- invalidate asynchronous convenience packaging by result generation so stale ZIP work cannot resurrect cleared results
- dispose registered engines independently so one teardown failure cannot block later cleanup
- add hard media-worker cancellation and include it in Cancel, Start over, and pagehide flows
- make LibreOffice cold initialization cancellable and prevent superseded converters from resurrecting
- recycle DuckDB after 20 exclusive operations and reject stale queued work after disposal
- recycle Mediabunny and PDF.js workers after 24 terminal requests
- recycle libvips after 10 terminal uses including inspections
- guard worker postMessage failures so pending promises/workers cannot leak
- reject overlapping batch resume executions
- pass AbortSignal into batch-result archive packaging
- gate batch/archive/PDF/combined-image result mutation by selection generation
- add Chromium endurance coverage for 30 subtitle cycles, 16 image cycles, DuckDB recycling, URL revocation, OPFS cleanup, worker counts, and stale-package races


## Unreleased — Maintenance Pass 4

### Real-file compatibility
- add a Chromium adversarial conversion matrix spanning images, CSV/data, workbooks, subtitles, archives, PDFs, and semantic documents
- fix SheetJS CSV Auto mode so it genuinely auto-detects delimiters instead of forcing comma
- add BOM-aware UTF-8/UTF-16LE/UTF-16BE text decoding
- support UTF-16 CSV/TSV in DuckDB routes through guarded local transcoding
- support UTF-16 subtitle files and BOM-prefixed JSON/JSONL
- harden content detection so UTF-16 BOMs cannot false-positive as MP3 and bracketed ASS text cannot false-positive as incomplete JSON
- add bounded metadata/animation trait probing for common images so routing reflects both source content and requested semantics
- extend the certified browser image path with longest-edge resize and JPEG background compositing, avoiding unnecessary libvips cold starts for static metadata-free JPEG/PNG/WebP
- keep libvips for common-image semantics the browser path cannot certify, including present/unknown metadata preservation, target-size search, lossless WebP, and present/unknown animation
- certify quoted multiline semicolon CSV, multilingual data, hidden-sheet sidecars, cached formulas, Unicode archive paths, case collisions, non-canonical WAV chunks, trailing PDF bytes, and permissive HTML
- apply archive preserve/flatten path policy consistently before collision resolution across ZIP, TAR, and libarchive-backed outputs
- document the permanent adversarial compatibility policy and matrix


## Unreleased — Maintenance Pass 3

### Reliability
- detect likely truncation/incompleteness for common image, PDF, ZIP, RIFF, and SQLite inputs during normal inspection
- retain libvips as a slower certified fallback for common JPEG/PNG/WebP direct conversions
- retry eligible direct conversions through same-mode alternate engines after engine failure
- retry eligible direct conversions when the first output fails independent validation
- re-run memory/storage preflight before any alternate engine is used
- never silently cross semantic/fidelity route modes during recovery
- classify batch failures as retryable or deterministic so resume no longer repeats known-bad jobs
- keep successful batch outputs intact while retryable failures are resumed
- surface retryable versus input/settings-required failure counts in the batch UI
- add regression coverage for truncation detection, retry policy, fallback ordering, engine-crash recovery, validation recovery, and route-mode isolation


## Unreleased — Maintenance Pass 2

### Improved
- add one-click quick output targets for the most useful destination formats while keeping the full target selector
- add keyboard workflow: Ctrl/Cmd+Enter runs the current conversion and Esc cancels active work
- collapse runtime diagnostics by default so the primary conversion task remains visually dominant
- tighten the desktop/mobile presentation for quick targets and diagnostics

### Corrected
- mark WOFF2 as recognition-only/experimental instead of advertising it as a production conversion format
- add regression coverage that keeps WOFF2 out of the active conversion graph until a browser-local codec passes the project certification gates


## 1.0.1 — 2026-09-21

Post-v1 production hardening release.

### Fixed
- add an official certified GitHub Pages deployment workflow for the Vite production build
- add real-browser production smoke testing across Chromium, Firefox, WebKit, and mobile emulation
- certify the GitHub Pages service-worker cross-origin-isolation fallback
- avoid first-install service-worker reloads on hosts that are already cross-origin isolated
- preserve the user's selected target while optional deep inspection continues
- use the certified browser-native engine for common JPEG/PNG/WebP conversion instead of blocking on libvips cold startup
- validate media container magic independently so mislabeled outputs cannot pass
- validate JSON/JSONL outputs locally without unnecessarily loading DuckDB
- reject unsafe SQL before starting DuckDB WASM
- add local JSON bridges and deterministic TAR writing where appropriate
- make LibreOffice fidelity initialization fail closed with an actionable semantic fallback instead of extending a broken cold-start timeout
- keep strict CSP intact; downgrade WOFF2 to recognition-only after tested codecs failed browser/CSP certification
- add real-file conversion smoke coverage across major engine families

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
