# Performance Regression Budgets & Responsiveness Certification

Maintenance Pass 6 turns performance from an informal expectation into a release contract.

The budgets are deliberately coarse. They are meant to catch meaningful regressions while remaining stable on shared GitHub Actions runners. They are not microbenchmarks and should not be interpreted as end-user hardware guarantees.

## Enforcement layers

### Static production-build budgets

`npm run release:certify` now runs `npm run performance:static` after the production build.

The static certifier reads `config/performance-budgets.json`, inspects the built `dist/` tree, calculates raw and gzip sizes, and fails the release if any ceiling is exceeded.

Current certified build:

| Metric | Measured | Release ceiling |
| --- | ---: | ---: |
| index.html | 26,746 B | 32,768 B |
| startup payload, raw | 1,195,173 B | 1,310,720 B |
| startup payload, gzip | 359,441 B | 409,600 B |
| entry JavaScript, raw | 1,149,047 B | 1,258,291 B |
| entry JavaScript, gzip | 348,366 B | 389,120 B |
| startup CSS | 19,380 B | 24,576 B |
| worker JavaScript total | 5,796,628 B | 6,291,456 B |
| largest worker JavaScript | 2,268,828 B | 2,621,440 B |
| lazy engine assets total | 485,225,825 B | 503,316,480 B |
| full dist | 493,609,727 B | 524,288,000 B |

The large engine total is intentional: OCR languages, LibreOffice, DuckDB, FFmpeg, libvips and other WASM assets are lazy/self-hosted and are not part of startup transfer. Their aggregate still has a hard release ceiling to catch accidental duplication or packaging explosions.

## Runtime budgets

Runtime certification runs only in desktop Chromium to avoid pretending timing numbers are portable across unrelated browser engines.

The second calibrated CI run measured:

| Runtime metric | Measured | Release ceiling |
| --- | ---: | ---: |
| runtime-ready | 250 ms | 2,000 ms |
| DuckDB cold inspection | 1,008 ms | 5,000 ms |
| DuckDB warm inspection | 49 ms | 1,500 ms |
| PDF.js cold inspection | 483 ms | 3,000 ms |
| PDF.js warm inspection | 18 ms | 1,000 ms |
| 24-file subtitle batch | 650 ms | 5,000 ms |
| max UI heartbeat gap during batch | 30.5 ms | 250 ms |
| renderer heap peak growth | 3.0 MB | 48 MiB |
| renderer heap retained growth after GC | 0.94 MB | 16 MiB |

The first calibration run produced similar values, confirming these were not one-run anomalies.

## Startup readiness

The app records a `convert:runtime-ready` Performance mark after:

- service-worker registration handling
- app construction
- engine capability preparation
- runtime capability rendering

The budget therefore measures the point at which the application is genuinely usable, not merely DOMContentLoaded.

## Cold / warm engine latency

DuckDB and PDF.js are used as representative persistent-engine checks.

Each test:

1. opens a fresh application page
2. measures the first fully completed detailed inspection
3. replaces the file without disposing the engine
4. measures the warm inspection
5. checks both absolute budgets and a bounded warm-vs-cold relationship

This catches both regressions in initial WASM/worker startup and regressions that destroy caching/reuse behavior.

## Responsiveness under load

The performance suite converts 24 subtitle files while a 25 ms browser heartbeat runs on the main thread.

The release fails if:

- total batch completion exceeds the throughput budget
- heartbeat ticks stop
- the maximum heartbeat gap exceeds 250 ms

This is intentionally an event-loop responsiveness guard rather than a synthetic FPS score.

## Renderer heap budget

The Chromium CDP HeapProfiler measures main-renderer V8 heap during repeated conversion/result/reset cycles.

The suite records:

- baseline heap after GC
- peak observed heap
- final retained heap after another GC

Peak and retained growth have separate budgets. Worker/WASM memory is covered indirectly by the worker recycling and endurance policies from Maintenance Pass 5.

## Reports

CI retains two machine-readable artifacts for 14 days:

- `static-performance-report`
- `runtime-performance-report`

The static report includes startup files, worker sizes, and per-engine-family totals. The runtime report records every measured timing / heap value and the active budgets.

## Budget-change policy

Budgets should not be raised merely because a PR fails.

A budget increase should require one of:

- an intentional feature that materially increases shipped/runtime cost
- evidence that the previous ceiling is flaky across repeated CI runs
- a documented architectural tradeoff

If a regression is accidental, the code should be fixed instead.

The source of truth is `config/performance-budgets.json`.
