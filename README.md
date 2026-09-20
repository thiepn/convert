# Thiepn Convert

A local-first universal file conversion platform for desktop and mobile browsers.

## Current status

Phase 2 — Production Audio & Video Engine is implemented on top of the Phase 0 core and Phase 1 image subsystem.

### Images

JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIC/HEIF input, JPEG XL, and SVG rasterization.

### Media

MP4/M4A, MOV, MKV, WebM, Ogg, MP3, WAV, FLAC, AAC/ADTS, and MPEG-TS.

Media conversion uses Mediabunny with copy-first routing: compatible tracks are remuxed without quality loss, while incompatible or transformed tracks are transcoded locally through WebCodecs. Local MP3, AAC, and FLAC encoder extensions fill common browser gaps.

Phase 2 includes:
- detailed audio/video track inspection
- remux-vs-transcode route preview
- multi-track preservation
- local audio extraction
- trim, resolution, frame-rate, codec, and bitrate controls
- target-size mode
- metadata policies
- hardware-codec preference
- streaming OPFS output with backpressure
- cancellation and batch processing
- independent media output validation

AVI and FLV are recognized but intentionally have no production conversion route yet; see docs/media-engine.md for the compatibility-engine rationale.

## Development

Requirements: Node.js 22 or newer.

    npm install
    npm run dev

Checks:

    npm test
    npm run typecheck
    npm run build

## Privacy

Conversion jobs do not upload files. Processing happens inside the browser with local workers, WebAssembly, WebCodecs, and OPFS.

See docs/privacy-model.md, docs/architecture.md, docs/image-engine.md, and docs/media-engine.md.

## Roadmap

- Phase 0: foundation — implemented
- Phase 1: production image engine — implemented
- Phase 2: production audio/video engine — implemented
- Phase 3: PDF
- Phase 4: documents and Office
- Phase 5: archives
- Phase 6: spreadsheets, data, and databases
