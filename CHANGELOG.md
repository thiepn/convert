# Changelog

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
