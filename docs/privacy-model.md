# Privacy model

## Invariants

1. Source file contents are never uploaded by a conversion engine.
2. Filenames, extracted text, hashes, previews, and outputs are not sent to analytics or conversion APIs.
3. Runtime converter assets must be served from the application origin in production.
4. Conversion engines may use browser-native APIs, WebAssembly, workers, streams, and OPFS.
5. External resources referenced by future documents must remain blocked unless a future feature explicitly and safely handles them.
6. Temporary job workspaces are removed after the job terminates.

## Network activity

The web application itself must be downloaded like any website. Future engine packs may also be downloaded from the same origin and cached for offline use. This is different from uploading user files.

The job manager snapshots browser resource activity when a conversion begins and rejects a job if a new cross-origin resource request appears during the conversion.

## Offline

The service worker caches same-origin application assets as they are used. After the required app/engine assets have been cached, supported conversions can run without network access.
