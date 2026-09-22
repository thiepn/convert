# Adversarial Real-File Compatibility Matrix

Maintenance Pass 4 moves compatibility certification beyond happy-path fixtures.

The matrix uses actual valid files produced by the same libraries and container structures encountered by the production engines, then deliberately adds characteristics that frequently break browser converters: BOMs, UTF-16, uncommon delimiters, embedded newlines, Unicode paths, case collisions, formulas, hidden sheets, trailing bytes, malformed-but-browser-tolerated HTML, and option combinations that require the full image engine.

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
| Image | PNG resized while metadata/options require the full engine | output dimensions are exactly the requested bound |
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
- browser-native common-image conversion could be selected even when requested options required resize, metadata preservation, animation preservation, target-size handling, lossless mode, or explicit JPEG alpha compositing
- archive path flattening happened too late: it was ZIP-specific and could create duplicate basenames or ignore the setting for TAR/7z-family output

Each issue now has dedicated regression coverage.

## Text encoding policy

Text-based converters recognize:

- UTF-8, with or without BOM
- UTF-16LE with BOM
- UTF-16BE with BOM

UTF-16 CSV/TSV is decoded to UTF-8 locally before DuckDB ingestion. The conversion is memory-gated because transcoding requires materialization. Ordinary UTF-8 CSV/TSV keeps the existing lazy browser-file-reader path.

## Image route policy

The lightweight browser image engine is used only when its semantics match the request.

The feature-complete libvips route is required when any of the following applies:

- metadata policy is Preserve or Privacy
- resize is requested
- target byte size is requested
- lossless encoding is requested
- animated WebP preservation may be required
- PNG/WebP → JPEG needs the chosen background for alpha flattening

This prevents a fast route from silently ignoring UI settings.

## Future corpus growth

New compatibility regressions should be reduced to the smallest deterministic fixture that preserves the real failure characteristic, then added to this matrix. External copyrighted sample files are not required for the permanent CI corpus when the same container/encoding condition can be reproduced deterministically.
