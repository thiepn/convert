# Phase 1 image engine

## Architecture

The image subsystem uses two engines behind the shared Phase 0 engine contract.

### Production — wasm-vips

The preferred path is wasm-vips 0.0.18 in a disposable dedicated worker.

It requires:
- WebAssembly
- WebAssembly SIMD
- WebAssembly exception handling
- SharedArrayBuffer
- cross-origin isolation
- Web Workers

The application lazy-loads the side modules required by the job:
- `vips-heif.wasm` for AVIF
- `vips-jxl.wasm` for JPEG XL
- `vips-resvg.wasm` for SVG input

The worker is terminated after every job so its WASM heap and decoder state cannot accumulate across conversions.

### HEIC / HEIF input

The distributed wasm-vips HEIF module disables the HEVC libde265/x265 backends. It must therefore not be used as evidence of HEIC support.

HEIC/HEIF input uses the pinned `libheif-js` decoder inside the same disposable worker. The decoded RGBA pixels are passed into libvips for the requested transformation/encoding.

Because this route reconstructs pixels, source HEIC metadata cannot currently be preserved. The conversion graph declares that loss before conversion.

HEIC/HEIF output is not exposed in Phase 1.

### Browser fallback

If wasm-vips prerequisites are missing, the application retains a worker-isolated OffscreenCanvas path for JPEG, PNG, and WebP only. This route strips most metadata and is marked as such by the loss analyzer.

## Metadata policies

- **Preserve** — retain compatible metadata through the production libvips saver.
- **Privacy** — retain ICC color information while removing EXIF/XMP/IPTC/GPS metadata.
- **Strip** — remove optional metadata, including ICC.

The HEIC raw-decoder route cannot provide Preserve semantics and is explicitly marked as metadata-lossy.

## Animation and multipage images

GIF/WebP loads all frames only when the selected target can retain animation and the user has not disabled preservation.

TIFF loads all pages for TIFF-to-TIFF processing.

Static targets intentionally load the first frame/page rather than decoding an entire sequence unnecessarily.

## Resource safety

Inspection occurs before full decode for formats whose headers can be parsed cheaply. The application estimates decoded memory from dimensions, bit depth, channel count, and frame count and rejects unsafe workloads before starting whenever enough metadata is available.

The worker performs a second guard after decoder-level dimensions are known.

Batch processing is sequential by default, especially important on mobile.

## Target-size mode

JPEG, WebP, AVIF, and JPEG XL can search encoder quality locally for a requested maximum size. If the lowest acceptable quality still exceeds the target and no explicit resize was chosen, the worker may perform a conservative resolution reduction and retry.

The target is best-effort; image complexity and encoder behavior can make an exact byte target impossible.

## Validation

Generated outputs are re-inspected after encoding.

Validation checks:
- format signature
- non-empty output
- dimensions where known
- frame count where header inspection supports it
- requested metadata stripping/privacy policy
- independent browser decoding for formats the browser can natively decode

Advanced formats can therefore pass structural validation even when the host browser itself has no native decoder.

## Licensing

Pinned runtime components are tracked explicitly:

- `wasm-vips@0.0.18` — MIT wrapper; shipped binary includes third-party components whose notices are copied by the engine-preparation script.
- `libheif-js@1.23.2` — LGPL-3.0 distribution of libheif-related browser code. Its license file is copied into the deployed license directory when available.

The project does not infer the binary licensing solely from the JavaScript wrapper license. Any future codec module must pass the same dependency/licensing gate before being exposed.
