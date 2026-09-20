# Phase 1 image engine

Phase 1 replaces the Phase 0 canvas proof converter with a worker-isolated libvips/WebAssembly pipeline.

## Routing

- JPEG, PNG, WebP, GIF, TIFF, AVIF, JPEG XL, and SVG rasterization use wasm-vips.
- HEIC/HEIF still images use a separate local HEVC-capable decoder to RGBA, then wasm-vips for transforms and encoding.
- The Phase 0 canvas engine remains a degraded JPEG/PNG/WebP fallback when cross-origin isolation is unavailable.

HEIC is decode-only. The current raw-pixel fallback warns that EXIF/XMP/ICC metadata is not transferred through that boundary.

## Features

- same-format recompression and optimization
- resize by longest edge
- alpha flattening for JPEG with a selected background
- multipage/animation loading where libvips supports it
- preserve, privacy, and strip metadata policies
- lossless preference for supporting codecs
- bounded target-size search for JPEG/WebP/AVIF/JXL
- worker recycling after repeated jobs
- decoded-pixel and frame safety guards
- independent output reprobe/decoding
- batch conversion and bounded batch ZIP output

## Known limits

- HEIC metadata is not preserved through the current HEVC fallback.
- HEIC encoding is not shipped.
- Full HDR-to-SDR tone mapping is not yet claimed as production quality; destructive HDR routes are warned.
- Browser/WASM memory limits apply to extreme images.
- wasm-vips 0.0.18 has a reported Safari 26.5 performance regression on very large photos. Correctness is unaffected, but batch throughput can be poor there.
- Batch ZIP creation is capped at 512 MiB of converted outputs because that final packaging step is currently in-memory.

## Security

Image decoding and conversion run in a dedicated worker. SVG is never injected into the application DOM; it is rasterized in the image engine. Pixel counts and frame counts are bounded before full evaluation.
