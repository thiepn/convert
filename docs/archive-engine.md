# Phase 5 archive and compression engine

Phase 5 adds local archive inspection, extraction, creation, and repacking.

## Engines

### zip.js 2.16.0

ZIP is handled by zip.js because it provides the strongest browser-native ZIP path:

- ZIP and Zip64
- streaming readers/writers
- AES encryption
- legacy ZipCrypto reading support
- Deflate/Deflate64 support
- incremental output
- browser workers and native CompressionStream integration

ZIP output can write directly to the job OPFS file handle. AES-256 is used when an output password is supplied.

### libarchive.js 2.0.2

libarchive WASM supplies broad archive compatibility for formats such as:

- 7z
- RAR v4/v5 read
- TAR
- GZIP
- BZIP2
- XZ/LZMA families
- Zstandard input where supported by the bundled libarchive
- CPIO and other libarchive-readable containers

Production output routes currently expose:

- 7z
- TAR
- TAR.GZ
- TAR.BZ2
- TAR.XZ

RAR creation is intentionally not advertised.

## Raw libarchive trust boundary

The stock libarchive.js high-level listing API builds nested JavaScript objects from archive path names.

Thiepn Convert does not use that API for untrusted archive listing/extraction.

Instead, it connects directly to the bundled worker through Comlink and calls:

- listFiles
- hasEncryptedData
- usePassword
- extractSingleFile

The returned path is validated as an opaque string before it is used by application code.

This avoids allowing hostile archive names to become JavaScript object-property traversal.

## Path safety

Entry paths are normalized before extraction or repacking.

Blocked paths include:

- absolute Unix paths
- Windows drive-absolute paths
- parent traversal using ..
- NUL-containing names
- excessively long paths
- empty paths

Backslashes are normalized to forward slashes.

Prototype-looking names such as __proto__/file.txt remain opaque filenames rather than becoming object keys. Result ZIP maps use null-prototype objects as a second defense.

## Bomb and resource protection

Before extraction the archive entry list is assessed for:

- entry count
- declared expanded bytes
- compression ratio
- duplicate paths
- case-colliding paths

Default archive inspection limits include:

- up to 100,000 entries
- up to 16 GiB declared expanded content
- suspicious compression ratio blocking above 1000x for significant expanded payloads

Extract-all has a stricter browser materialization budget:

- mobile/coarse device: roughly 192 MiB and 3,000 files
- desktop: roughly 768 MiB and 15,000 files

Archive creation is currently bounded around:

- 256 MiB selected source data on mobile
- 1 GiB selected source data on desktop

These are application safety gates, not format limits.

## Repacking

Archive-to-archive conversion currently performs:

1. inspect
2. validate paths and declared expansion
3. extract entries locally
4. normalize/rename duplicate destination paths
5. write the new archive
6. reopen and validate the output

This means repacking is not a compressed-stream passthrough operation.

ZIP output can stream to OPFS after extraction. Other libarchive output writers are memory-backed by the current libarchive.js wrapper.

## Duplicate entries

Archives may legally contain duplicate paths.

Extraction exposes separate result items rather than silently overwriting an earlier file.

When creating/repacking an archive, case-insensitive duplicate destination paths are renamed deterministically:

- file.txt
- file (2).txt
- file (3).txt

## Special filesystem entries

Symlinks and unsupported special entries returned by libarchive are identified but are not materialized into browser downloads or recreated as real filesystem links.

This prevents an archive from using symlinks to escape a logical extraction root.

## Encryption

Input encrypted ZIP and other libarchive-supported encrypted formats can receive a local password.

Output password protection is currently deliberately limited to ZIP, using AES-256 through zip.js.

Passwords are never uploaded or persisted.

## Archive creation from arbitrary selections

The user can switch any current batch to Pack these files.

Mixed or unrecognized file selections also automatically enter archive-build mode.

Available creation targets:

- ZIP
- 7z
- TAR
- TAR.GZ
- TAR.BZ2
- TAR.XZ

## Known limitations

- split/multipart ZIP sets are not yet modeled as one multi-file archive source
- RAR is read-only
- RAR creation is not exposed
- special Unix permission/owner/ACL/xattr metadata is not preserved universally
- symlinks are deliberately not recreated
- non-ZIP archive writing is memory-backed by libarchive.js
- archive repacking materializes extracted entries before writing the new container
- output encryption is ZIP-only
- extracting hundreds of thousands of tiny files is intentionally blocked
