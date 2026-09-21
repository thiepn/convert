# Reliability & Failure Recovery

Maintenance Pass 3 strengthens failure handling without widening the app's format claims.

## Source integrity warnings

Normal inspection now performs bounded head/tail checks for common formats where a missing terminator or impossible declared size is a useful damage signal.

Covered checks include:

- JPEG end marker
- PNG IEND chunk
- GIF trailer
- RIFF declared size for WebP/WAV
- PDF %%EOF marker
- ZIP central-directory terminator
- SQLite first-page/header consistency

These checks are warnings, not blanket rejection. A damaged PDF, for example, may still be recoverable through Repair mode.

## Direct-engine recovery

A conversion may retry through an alternate engine only when all of these are true:

1. the route is direct (one conversion edge)
2. the alternate route reaches the same requested target
3. the alternate route has the same semantic/fidelity/neutral mode
4. the alternate engine is currently available and certified for that route
5. its independent memory and storage preflight passes
6. the job has not been cancelled

The current important example is JPEG/PNG/WebP: the browser-native engine remains the preferred fast path while libvips stays available as a slower certified recovery path.

The app never silently changes a fidelity conversion into a semantic conversion, or vice versa.

## Output-validation recovery

All accepted outputs still pass the existing independent validator.

For a direct route, if the first engine completes but the produced file fails validation, the app may retry once through another same-mode certified route. The recovered output must pass validation itself before being exposed.

Invalid outputs are never accepted merely because the engine reported success.

## Batch retry policy

Batch failures are now split into two classes.

### Retryable

Examples:

- transient worker crashes
- unexpected engine failures without a known deterministic cause
- cancelled tasks

These may be resumed without re-running successful files.

### Requires changed input/settings

Examples:

- unknown/unsupported format
- no local route
- memory or storage budget violations
- missing/incorrect passwords
- blocked SQL
- unsafe archive/package content
- output validation failure after recovery is exhausted
- missing RAW embedded preview

These are not offered for blind retry because the same inputs and settings would normally fail again.

Successful batch outputs stay preserved while retryable failures are resumed.

## Boundaries

Recovery is intentionally conservative. It does not:

- bypass memory/storage guards
- bypass output validation
- weaken privacy/network guards
- switch route modes silently
- accept partially written invalid files
- claim support for recognition-only formats
