# Privacy model

## Invariants

1. Source file contents are never uploaded by a conversion engine.
2. Filenames, extracted text, hashes, previews, and outputs are not sent to analytics or conversion APIs.
3. Runtime converter assets must be served from the application origin in production.
4. Conversion engines may use browser-native APIs, WebAssembly, workers, streams, and OPFS. Phase 7 FFmpeg and WOFF2 binaries are self-hosted and lazy-loaded from the application origin.
5. External resources referenced by future documents must remain blocked unless a future feature explicitly and safely handles them.
6. Temporary job workspaces are removed after the job terminates.

## Network activity

The web application itself must be downloaded like any website. Future engine packs may also be downloaded from the same origin and cached for offline use. This is different from uploading user files.

The job manager snapshots browser resource activity when a conversion begins and rejects a job if a new cross-origin resource request appears during the conversion.


## Batch state

Phase 8 batch queues, filenames, pipeline settings, progress, errors, and successful outputs stay local to the browser.

Cancellation/resume is intentionally session-scoped. Source File objects are not serialized or uploaded for later recovery, and passwords are not persisted as part of batch configuration.

## Offline

The service worker caches same-origin application assets as they are used. After the required app/engine assets have been cached, supported conversions can run without network access.

## Stable-release network policy

The v1 production Content Security Policy restricts application connections to the same origin. Conversion workers and engine assets are self-hosted. The service worker may fetch and cache those same-origin application assets, but file contents are not sent to a conversion API.

Application updates do not forcibly replace an active converter session. A newly installed service worker waits until the user activates the visible Update app control.

Installed-app file handlers hand local File objects to the same conversion pipeline; they do not introduce an upload path.
