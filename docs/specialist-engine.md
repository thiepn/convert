# Phase 7 specialist and legacy compatibility

Phase 7 extends Thiepn Convert only where a browser-local implementation has a testable, honest conversion boundary. Recognition is deliberately broader than conversion.

## Supported conversion packs

| Family | Inputs | Outputs | Implementation | Boundary |
| --- | --- | --- | --- | --- |
| Layered graphics | PSD | PNG, JPEG, WebP | ag-psd 31.0.2 | Flattened composite only. Layers and Photoshop editing semantics are not preserved. |
| Camera RAW | CR2, CR3, NEF/NRW, ARW/SR2, DNG, RW2, ORF, RAF, PEF | JPEG | Native embedded-preview extractor | Extracts the largest embedded JPEG. This is not a RAW demosaic/development engine. |
| Fonts | TTF, WOFF, WOFF2, EOT; OTF input | TTF, WOFF, WOFF2, EOT | fonteditor-core 2.6.3 + self-hosted WOFF2 WASM | OTF is read-only and first converts to TTF. Font licensing/embedding rights remain the user's responsibility. |
| Subtitles | SRT, WebVTT, ASS/SSA | SRT, WebVTT, ASS | Native parser/serializer | Cue timing and readable text are preserved. ASS styles/effects and WebVTT style/region metadata can be lost. |
| Legacy media | AVI, FLV, ASF/WMV/WMA | MP4, WebM, MP3, WAV, FLAC, Ogg | lazy @ffmpeg/core 0.12.10 | Full memory-backed transcode; slower and heavier than the primary Mediabunny/WebCodecs engine. |
| FictionBook | FB2 | semantic HTML, then existing document routes | Native XML extraction + Pandoc pipeline | Readable text/structure first; FB2-specific metadata and embedded images can be reduced. |
| Triangle meshes | OBJ, STL, ASCII PLY | OBJ, binary STL, ASCII PLY | Native mesh parser/writer | Triangle positions only. No materials, textures, normals, UVs, colors, scene graph, or animation. |
| Scientific metadata | FITS | JSON | Native FITS header reader | Header cards only. Scientific arrays/tables/payload data are not converted. |

All runtime binaries are served from the application origin. No Phase 7 converter uploads a user file.

## Recognition-only boundaries

The following formats are identified so the application can state a precise boundary instead of pretending a conversion exists:

- PSB (Photoshop Large Document): ag-psd does not support PSB.
- MOBI / AZW / AZW3 / PRC: no local Kindle/Mobipocket conversion pack is enabled; DRM is never bypassed.
- DXF / DWG: recognized, but no CAD-semantic converter is enabled.
- glTF / GLB: recognized, but the triangle-only mesh converter is not used because that would silently discard scene hierarchy, materials, textures, animation, and extensions.
- HDF5 / NetCDF: recognized, but no general scientific-array conversion is enabled.

These formats intentionally produce no destination choices.

## Security and resource controls

- Specialist parsers use explicit file-size or complexity guards.
- RAW extraction scans local bytes only.
- XML parsing does not fetch external resources.
- FFmpeg is loaded lazily and uses the single-thread browser WASM core; its in-memory filesystem is size-gated.
- Output files still pass the central post-conversion validator.
- NetworkGuard remains active for every job.
- Unsupported formats fail closed instead of being routed through unrelated decoders.

## Licensing

The legacy media fallback introduces a GPL-2.0-or-later FFmpeg core. Distribution of the application and bundled FFmpeg core must satisfy the corresponding source and notice obligations. The JavaScript @ffmpeg/ffmpeg wrapper is MIT licensed. ag-psd and fonteditor-core are MIT licensed.

See licenses/dependencies.json for the tracked dependency inventory.
