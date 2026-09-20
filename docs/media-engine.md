# Phase 2 media engine

Phase 2 adds a local, worker-isolated audio/video subsystem built around Mediabunny 1.58.0 and WebCodecs.

## Routing

The production engine supports MP4/M4A, MOV, Matroska, WebM, Ogg, MP3, WAVE, FLAC, AAC/ADTS, and MPEG transport streams.

For every conversion, Mediabunny is configured with copy-preferred semantics. Compatible encoded tracks are copied directly into the new container. Only tracks that cannot be copied, or tracks affected by requested transforms such as resize, frame-rate changes, explicit codec selection, strict bitrate/target-size settings, or exact media changes, are transcoded.

A copy-only preflight powers the UI route indicator:
- Remux: every selected track can be copied without re-encoding.
- Partial transcode: some selected tracks can be copied.
- Transcode: selected tracks require re-encoding.

## Local codecs

Browser WebCodecs remains the preferred video/audio codec path. Phase 2 adds local Mediabunny extensions for MP3, AAC, and FLAC encoding when the browser does not expose those encoders natively.

No server-side media processing exists.

## Large files

Input uses Mediabunny BlobSource, which performs lazy range reads instead of loading the whole source file into memory.

When OPFS is available, the JobManager provides a FileSystemFileHandle directly to the media worker. Mediabunny writes the result through StreamTarget into OPFS with backpressure. The output workspace remains alive while the UI exposes its Blob URL and is released when that result is replaced.

Without OPFS, the engine falls back to BufferTarget and is therefore subject to browser memory constraints.

## Features

- detailed container and per-track inspection
- multiple audio/video/subtitle track metadata
- copy-first remuxing
- local transcoding via WebCodecs
- MP3/AAC/FLAC encoder fallbacks
- primary-track or all-track policy
- trim start/end
- resolution limiting
- frame-rate conversion
- explicit AVC/HEVC/VP8/VP9/AV1 codec choice
- explicit AAC/Opus/MP3/FLAC/Vorbis/PCM audio choice
- video/audio bitrate controls
- target-size bitrate calculation
- hardware-acceleration preference
- metadata preserve/privacy/strip policies
- audio extraction
- cancellation
- batch conversion
- independent output re-open validation

## Deliberate limitations

AVI and FLV are detected but do not have production conversion routes in Phase 2. The previously planned FFmpeg.wasm compatibility layer is deliberately not bundled yet: the current WebAssembly core is GPL-2.0-or-later, adds a large binary, uses a memory-backed virtual filesystem, and has known large-input limitations. Adding it just to claim more extensions would weaken the local-large-file architecture and licensing clarity. A separately audited legacy compatibility pack can be added in the advanced/legacy phase.

HLS is also not exposed as a single-file drop target because its playlists and segment sets need a multi-file/path-aware source model.

Subtitle preservation depends on target container and Mediabunny's supported subtitle codec set; incompatible tracks are surfaced as discarded-track warnings rather than disappearing silently.
