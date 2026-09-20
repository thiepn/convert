# Convert architecture

Thiepn Convert is local-first by construction.

## Layers

```text
UI
  -> format inspection
  -> conversion graph / loss analysis
  -> capability-aware planner
  -> engine registry
  -> disposable worker
  -> OPFS staging
  -> independent validation
  -> local output
```

The UI never talks directly to a codec. Formats are registered independently from conversion engines, and the planner chooses the lowest-loss route that the current runtime can actually execute.

## Phase 1 image subsystem

The production image route is `VipsImageEngine`, backed by wasm-vips in a disposable worker. JPEG, PNG, WebP, GIF, TIFF, BMP, AVIF, JPEG XL, and SVG processing use this path when the browser satisfies wasm-vips requirements.

HEIC/HEIF input uses a dedicated local libheif decoder inside the same worker because the pinned wasm-vips HEIF side module intentionally omits HEVC decode/encode support.

A browser-native OffscreenCanvas engine remains registered as a lower-priority fallback for JPEG/PNG/WebP.

## Local storage

Temporary job data is staged under the browser Origin Private File System when available. Workspaces are transactional and removed after success, cancellation, or failure.

## Cross-origin isolation

Production hosts should send COOP and COEP headers. The repository includes a static-host `_headers` configuration and a same-origin service-worker fallback for static deployments.

Cross-origin isolation is required for the production image engine because wasm-vips uses SharedArrayBuffer-backed threading.

## Privacy

The conversion path has no upload endpoint. Engines operate on local File/Blob objects. A network guard records newly initiated cross-origin resource loads during conversion and rejects the job if one appears.

Same-origin engine-module downloads are allowed and cached for offline use.

## Extension model

Future phases add engines behind the same contracts:
- formats register capabilities and detection
- engines register executable conversion pairs
- graph edges declare loss/cost characteristics
- planner chooses the runtime-valid path
- validators independently inspect the output

The core job, storage, privacy, and validation layers should not be rewritten per format family.
