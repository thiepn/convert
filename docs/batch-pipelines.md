# Phase 8 Batch Conversion & Pipelines

Phase 8 turns the existing per-file converters into a first-class batch execution system. It does not add a second set of conversion engines; it compiles one shared pipeline and executes it through the same inspected, planned, validated local routes used by single-file conversions.

## Goals

- one configuration applied consistently across many files
- mixed recognized-format batches when every source has a safe route to the chosen target
- capability-aware scheduling without unsafe memory concurrency
- sequential low-memory mode
- per-file failure isolation
- deterministic output naming templates
- collision-safe generated names
- explicit ZIP packaging of successful outputs
- cancellation that preserves completed work
- in-session resume and retry of cancelled/failed tasks
- visible compiled pipeline stages
- use of existing resize, quality, metadata, sheet/table selection, restricted SQL, and archive-compression controls as composable pipeline stages

## Pipeline model

A batch pipeline contains:

- target format
- conversion quality
- the active engine options
- execution mode
- output naming template
- output packaging policy
- an explicit ordered step summary

Existing controls compile into semantic steps such as:

    Select worksheet
      -> Apply local SQL filter
      -> Resize
      -> Target size / compression
      -> Metadata policy
      -> Quality
      -> Convert
      -> Package successful results

The step list is descriptive and authoritative for the configuration passed to the existing engines. It does not introduce extra lossy re-encodes between UI options.

## Execution modes

### Capability-aware automatic

The scheduler uses conservative parallelism.

Memory-heavy or stateful routes are exclusive, including:

- LibreOffice
- FFmpeg legacy fallback
- Mediabunny
- libvips
- PDF processing and reconstruction
- Pandoc
- archive repacking
- SheetJS
- DuckDB
- sql.js
- PSD parsing
- font conversion
- RAW preview extraction
- mesh conversion

Light/stateless routes can overlap within a hardware-concurrency-derived limit.

This is intentionally conservative. Browser file conversion is usually memory-bound before it is CPU-bound.

### Sequential

Sequential mode runs one task at a time and is the recommended mode for low-memory devices or unusually large files.

## Failure isolation

Planning and execution happen per file.

If one file:

- is malformed
- has no route to the selected target
- exceeds an engine guard
- fails validation
- or encounters an engine error

that task is marked failed while unrelated tasks continue.

Successful outputs remain available.

## Cancellation and resume

Cancelling a Phase 8 batch:

- stops active jobs through the existing JobManager cancellation path
- marks not-yet-started work as cancelled
- retains successful outputs in the current browser session
- keeps task state visible

Resume / retry remaining changes cancelled and failed tasks back to pending and runs only those tasks.

Current limitation: source File objects are browser-session objects. Phase 8 resume therefore survives an in-session cancellation, not a full page reload or browser restart. Cross-reload durable batch recovery belongs to the storage/offline hardening work rather than pretending browser File permissions are permanently available.

## Naming templates

Supported tokens:

- `{name}` — source filename without extension
- `{sourceExt}` — original extension
- `{ext}` — target extension
- `{format}` — target format ID
- `{index}` — 1-based batch position
- `{index:03}` — zero-padded index
- `{total}` — batch size
- `{date}` — local YYYY-MM-DD

Unsafe path characters are removed. Duplicate generated names are resolved case-insensitively using numeric suffixes.

## Mixed-format batches

When multiple recognized files belong to different format families, the app no longer automatically treats them as an archive-building request.

Instead it computes the intersection of targets reachable from every source.

If a common target exists, the selection becomes a mixed batch and each source is independently planned to that target.

If no common target exists, the user can still choose Pack these files to create an archive.

## Packaging

ZIP packaging is explicit rather than automatic.

When enabled, successful outputs are passed to the existing archive engine after conversion and packaged locally. Failed or cancelled source files do not block packaging of successful outputs.

The individual converted files remain available alongside the ZIP.

## Privacy

Batch state is held locally in memory. Files, pipeline options, filenames, progress, failures, and outputs are not sent to a conversion service.

Phase 8 does not persist passwords or browser File objects.

## Validation

Every per-file conversion still goes through the central output validator before it can become a completed batch task.

The batch layer never treats an engine return value alone as success.
