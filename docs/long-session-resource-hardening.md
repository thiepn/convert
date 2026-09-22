# Long-Session, Concurrency & Resource-Leak Hardening

Maintenance Pass 5 defines how Thiepn Convert behaves after many conversions in one tab, during cancellation, when a selection is replaced, and when the page is hidden or destroyed.

## Goals

Long sessions must remain bounded in four areas:

1. worker / WASM runtime lifetime
2. OPFS temporary workspace lifetime
3. object URL lifetime
4. asynchronous UI ownership

Successful outputs may remain available while visible to the user, but they must become releasable and must not survive Start over, a new selection, or page shutdown accidentally.

## Runtime recycling policy

| Runtime | Recycling policy |
| --- | --- |
| DuckDB-Wasm | recycle after 20 completed exclusive operations |
| Mediabunny worker | recycle after 24 terminal requests when no request remains pending |
| PDF.js worker | recycle after 24 terminal requests when no request remains pending |
| libvips worker | recycle after 10 terminal uses, including inspections |
| LibreOffice WASM | existing four-use recycle retained; cold initialization is now cancellable |
| Browser image worker | one worker per conversion; always terminated on completion/error/cancel |
| Pandoc / SheetJS / sql.js | operation-scoped workers; terminated at operation completion |

Recycling is deliberately conservative. It trades occasional reinitialization cost for bounded long-session heap growth.

## OPFS ownership

JobManager now tracks retained workspaces centrally.

A workspace is retained only while a visible output still needs it. The release callback is idempotent, and the manager can release every retained workspace during page lifecycle disposal.

Temporary workspace cleanup itself is one-shot, so duplicate ownership paths cannot cause teardown races.

A lifecycle epoch prevents a conversion that ignores an abort briefly from completing after page disposal and registering a new retained workspace after cleanup already ran.

## Result URL ownership

Every result Blob URL is tracked as a lease.

When results are replaced or cleared:

- Blob URLs are revoked synchronously
- OPFS release callbacks run asynchronously but idempotently
- the result generation increments
- asynchronous convenience ZIP work checks that generation before every expensive read and before adding a result

This prevents a package that finishes late from resurrecting a download link after Start over.

zip.js may keep one bounded internal Blob URL for its own runtime. Endurance tests therefore distinguish app download URLs from library-runtime URLs.

## Page lifecycle

On `pagehide` the app now:

- invalidates selection / route generations
- cancels batch work
- aborts active JobManager work
- hard-cancels Mediabunny
- cancels PDF / OCR / qpdf work
- aborts archive work
- revokes visible download URLs immediately
- starts releasing batch and retained OPFS workspaces
- disposes every registered engine independently

Engine disposal is fault-isolated: one engine throwing during teardown cannot stop later engines from being disposed.

## Cancellation hardening

Media cancellation now terminates the worker immediately instead of depending only on a cooperative cancel response.

LibreOffice cancellation now covers both:

- an already-running conversion
- the heavy cold initialization phase

An initialization that finishes after reset/disposal detects its lifecycle epoch, destroys itself, and cannot reattach a stale converter.

DuckDB applies the same principle to in-flight initialization and stale queued work.

## Selection-generation safety

Asynchronous operations capture the active selection generation.

Old work may not mutate a newer selection after Start over or file replacement. This guard now covers:

- batch execution and resume
- result packaging
- archive create/extract
- combined-image PDF creation
- PDF operations

Batch result packaging also receives a real AbortSignal.

Overlapping `resume()` calls are rejected while a batch execution is already active.

## Endurance certification

The Chromium endurance suite performs:

- 30 subtitle convert → result → Start over cycles
- 16 native image conversions with worker creation/termination tracking
- repeated structured-data cycles sufficient to cross DuckDB's recycle boundary
- a deterministic delayed convenience-package race while results are cleared

The suite directly observes:

- created vs revoked Blob URLs
- active download Blob URLs
- active worker count
- total worker creation count
- OPFS job-directory count

Pass criteria require app-owned result URLs and OPFS job directories to return to zero after cleanup, native workers not to accumulate, DuckDB to recycle, and stale packaging not to recreate cleared results.

## Current certification result

Maintenance Pass 5 browser certification:

- 32 Playwright tests passed
- 84 tests intentionally skipped by browser/project scoping
- all four endurance cases passed
- release certification, strict TypeScript, production build and service-worker checks passed
