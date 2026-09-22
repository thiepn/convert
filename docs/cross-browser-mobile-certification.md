# Cross-Browser Conversion Parity & Mobile Certification

Maintenance Pass 7 expands release certification from browser-shell compatibility to actual representative conversions across the supported browser projects.

## Automated browser projects

CI currently certifies:

- Chromium desktop
- Chromium mobile using the Playwright Pixel 7 profile
- Firefox desktop
- WebKit mobile using the Playwright iPhone 14 profile

These are browser-engine certifications, not claims that a physical Pixel or iPhone was used.

## Representative conversion parity matrix

Each project runs the same representative families:

| Family | Certified route |
| --- | --- |
| common image | PNG → JPEG |
| subtitles | SRT → WebVTT |
| triangle mesh | OBJ → STL |
| spreadsheet | XLSX → CSV with SheetJS |
| structured data | JSON → CSV with DuckDB-Wasm |
| semantic document | HTML → Markdown with Pandoc WASM |
| PDF | qpdf structural optimization |
| archive | ZIP → TAR through libarchive |
| primary audio | PCM WAV → FLAC through Mediabunny + bundled FLAC encoder |

Final automated result: every route above passes in all four browser projects.

The parity report also records relevant capability facts such as OffscreenCanvas, ImageBitmap, WebAssembly, SharedArrayBuffer, WASM threads/SIMD, WebCodecs, and codec support.

## WebKit FLAC correction

The first parity run exposed a real WebKit-specific media defect.

WebKit reported FLAC encoding capability, but WAV → FLAC could finish with zero packets and produce an empty FLAC output. Maintenance Pass 7 no longer trusts that browser capability advertisement for this target.

The media worker now:

- registers the bundled FLAC encoder unconditionally
- explicitly selects FLAC for FLAC output
- forces FLAC transcoding instead of relying on a browser-native path

The corrected route is now certified in Chromium desktop/mobile, Firefox, and WebKit-mobile.

## Mobile automated hardening

Both mobile projects certify:

- touch-driven file chooser flow
- touch-driven quick-target selection
- local subtitle conversion
- Convert button minimum target height of 44 px
- quick-format target minimum height of 44 px
- download action minimum height of 44 px
- 16 px select/input text sizing to avoid mobile zoom behavior
- no horizontal page overflow
- visual viewport remains within the layout viewport
- portrait → landscape viewport rotation
- sticky action controls stay within landscape width
- landscape action bar remains bounded in height
- four-edge CSS safe-area support
- cached PWA shell assets exist in CacheStorage

Chromium-mobile additionally certifies a service-worker-controlled offline shell fetch and SRT → WebVTT conversion while the browser context is offline.

## Safe-area and landscape policy

The mobile shell now includes:

- top safe-area inset
- right safe-area inset
- bottom safe-area inset
- left safe-area inset

A short-landscape media query reduces nonessential vertical density and keeps sticky actions usable when the viewport height is small.

## WebKit offline-emulation boundary

Playwright WebKit has repeatedly failed in its synthetic offline mode in ways unrelated to the conversion code:

- offline reload can terminate internally
- offline network fetches can be rejected before the service worker can answer
- file-input dispatch can stop propagating once the emulated context is offline
- an already-selected local file may not complete UI processing after synthetic offline isolation

Accordingly, the release suite does **not** claim physical iOS offline relaunch certification from Playwright.

For WebKit-mobile CI it certifies:

- service-worker controller presence
- expected shell asset in CacheStorage
- touch/file-picker behavior while online
- all representative local conversion families while online
- rotation, safe-area, viewport, and touch-target behavior

Actual Home Screen cold offline launch and conversion remains a physical-device acceptance item.

## PWA metadata

The HTML now includes explicit iOS Home Screen metadata:

- Apple touch icon
- Apple mobile web app capability metadata
- installed app title

The existing viewport uses `viewport-fit=cover`, and the manifest remains the primary cross-platform install definition.

## CI artifact

Every browser-smoke run retains a machine-readable `browser-parity-report` artifact for 14 days.

The artifact records representative route success and runtime capability facts for each project.

## Certification rule

A browser engine is not considered conversion-parity certified merely because the shell loads.

Representative local output must:

1. be offered by the planner
2. complete without an external conversion service
3. pass existing independent output validation
4. be readable/downloadable by the test harness
5. satisfy the family-specific output invariant

A feature that cannot meet these conditions must be hidden, degraded explicitly, or documented as unverified rather than silently advertised.
