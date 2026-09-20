# Phase 0 architecture

Thiepn Convert is local-first by construction.

## Layers

UI -> core planner -> engine interface -> disposable worker -> local output.

The UI never talks directly to a codec. Formats are registered independently from conversion engines. Conversion edges form a graph, and the planner chooses the lowest-loss available route.

## Phase 0 proof engine

Phase 0 intentionally ships only a browser image proof engine for JPEG, PNG, and WebP. It uses createImageBitmap and OffscreenCanvas inside a dedicated worker. It proves the complete flow:

inspection -> planning -> resource preflight -> worker conversion -> OPFS staging -> validation -> local save.

This proof engine is not the Phase 1 production image engine and explicitly warns that metadata is stripped.

## Local storage

Temporary job data is staged under the browser Origin Private File System when available. Workspaces are transactional and removed after success, cancellation, or failure.

## Cross-origin isolation

Production hosts should send COOP and COEP headers. The repository includes a static-host _headers file and a same-origin service-worker fallback so GitHub Pages-like static hosting can become isolated after service-worker control and reload.

## Privacy

The conversion path has no upload endpoint. Engines operate on File/Blob objects locally. A network guard records newly initiated external resource loads during a conversion and fails the job if one is detected.

## Future phases

Phase 1 and later add production engines behind the same interfaces. The core planner, job state machine, storage layer, and validation boundary should not need to be rewritten for each format family.
