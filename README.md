# Thiepn Convert

A local-first universal file conversion platform for desktop and mobile browsers.

## Current status

Phase 0 is implemented. The repository currently focuses on the conversion architecture rather than broad format coverage.

Implemented foundation:

- runtime capability detection
- magic-byte-first format inspection
- format registry
- engine registry
- conversion graph and loss-aware route planner
- cancellable worker-isolated conversion engine contract
- OPFS transactional temporary workspaces
- storage and decoded-image safety preflight
- independent output validation
- external-network conversion guard
- offline service worker
- COOP/COEP deployment configuration
- minimal diagnostics and conversion UI
- real local JPEG / PNG / WebP proof conversions
- automated unit tests and CI

The browser image engine in Phase 0 is intentionally a proof engine. It uses browser canvas APIs and strips metadata. Phase 1 replaces it with the production image architecture.

## Development

Requirements: Node.js 22 or newer.

npm install
npm run dev

Checks:

npm test
npm run typecheck
npm run build

## Privacy

Conversion jobs do not upload files. Processing happens inside the browser. Application and engine assets may be downloaded from this site's own origin and cached for offline use.

See docs/privacy-model.md and docs/architecture.md.

## Roadmap

Phase 1: production image engine
Phase 2: audio and video
Phase 3: PDF
Phase 4: documents and Office
Phase 5: archives
Phase 6: spreadsheets, data, and databases
