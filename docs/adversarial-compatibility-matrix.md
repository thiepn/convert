# Adversarial Real-File Compatibility Matrix

Maintenance Pass 4 moves compatibility certification beyond happy-path fixtures.

The matrix uses actual valid files produced by the same libraries and container structures encountered by the production engines, then deliberately adds characteristics that frequently break browser converters: BOMs, UTF-16, uncommon delimiters, embedded newlines, Unicode paths, case collisions, formulas, hidden sheets, trailing bytes, malformed-but-browser-tolerated HTML, and image options that must route to an engine capable of honoring their semantics.

## Certification principles

A matrix case passes only when:

1. the source is identified correctly
2. requested settings are actually honored
3. conversion completes locally
4. the independent target validator accepts the output
5. important content or structural invariants survive
6. expected loss is explicit rather than silent
7. no external network dependency is introduced

The matrix is additive to unit tests and the existing real-conversion smoke suite.

## Current matrix

| Family | Adversarial case | Required invariant |
| --- | --- | --- |
| Image | known-static 192 px PNG → 128 px PNG | native-browser resize honors the requested bound without invoking the heavyweight libvips path |
| Image | stripped simple PNG → WebP | fast browser-native route remains usable |
| CSV / Spreadsheet | UTF-8 BOM + semicolon delimiter + quoted comma + embedded newline | automatic delimiter detection and field boundaries survive XLSX conversion |
| Structured data | UTF-16LE semicolon CSV | DuckDB route decodes without mojibake and preserves rows |
| JSON | UTF-8 BOM + nested values + German/Korean text | JSON bridge and CSV output preserve multilingual values |
| Subtitles | UTF-16LE Windows SRT + CRLF + multilingual text | cue times and Unicode text survive WebVTT conversion |
| Spreadsheet | formulas + cached values + merged cells + hidden sheet + Unicode | main flat export plus hidden-sheet sidecar remain usable |
| Archive | Unicode nested paths + case-colliding names | safety warning appears and repacked TAR retains each distinct path |
| Archive | path flattening with duplicate basenames | flattening applies before collision resolution; exact duplicates receive deterministic suffixes while case-distinct names survive |
| Media | PCM WAV with a leading JUNK chunk and stereo audio | non-canonical but valid RIFF chunk ordering still converts to valid FLAC |
| PDF | valid PDF with ordinary bytes after %%EOF | qpdf optimization still produces a valid PDF |
| Document | permissive/messy HTML + table/list + Unicode | semantic Markdown conversion preserves readable structure/content |

## Compatibility defects found and corrected

Maintenance Pass 4 found several issues that happy-path tests did not expose:

- CSV “Auto” in the SheetJS route was actually forcing comma
- UTF-16 text inputs were not decoded consistently
- BOM-prefixed JSON could fail tabular parsing
- common-image routing did not distinguish source traits from requested semantics: this could either ignore advanced settings or force metadata-free static files through an unnecessary libvips cold start
- archive path flattening happened too late: it was ZIP-specific and could create duplicate basenames or ignore the setting for TAR/7z-family output

The matrix also exposed two format-detection false positives: a UTF-16LE BOM could resemble a permissive MPEG audio sync, and bracketed ASS subtitle text could resemble an incomplete JSON array. MP3 detection now requires a sane MPEG Layer III header and JSON prefix detection is stricter. Each issue now has dedicated regression coverage.

## Text encoding policy

Text-based converters recognize:

- UTF-8, with or without BOM
- UTF-16LE with BOM
- UTF-16BE with BOM

UTF-16 CSV/TSV is decoded to UTF-8 locally before DuckDB ingestion. The conversion is memory-gated because transcoding requires materialization. Ordinary UTF-8 CSV/TSV keeps the existing lazy browser-file-reader path.

## Image route policy

The lightweight browser image engine is used when its semantics match the request. For JPEG/PNG/WebP it now supports:

- normal decode/encode
- longest-edge resize
- quality-controlled encoding where the browser exposes it
- JPEG background compositing for transparent PNG/WebP input
- metadata stripping by virtue of decode/re-encode

A bounded source-trait probe checks whether common images actually contain metadata or animation before route selection. Therefore Preserve/Privacy does not force a metadata-free static image into libvips merely because the policy is selected.

The feature-complete libvips route remains required when the browser path cannot certify the requested semantics, including:

- preserving or privacy-filtering metadata that is present, or whose presence cannot be established safely
- target-byte-size search
- lossless WebP output
- preserving actual or uncertain PNG/WebP animation
- non-common image formats handled by the libvips pipeline

This prevents both classes of failure: silently ignored settings and unnecessary cold-start dependence on the heavyweight engine.

## Future corpus growth

New compatibility regressions should be reduced to the smallest deterministic fixture that preserves the real failure characteristic, then added to this matrix. External copyrighted sample files are not required for the permanent CI corpus when the same container/encoding condition can be reproduced deterministically.
