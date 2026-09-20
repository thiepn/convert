# v1.0 Release Certification

Phase 10 is the final Universal UX, Hardening & Release phase.

## Release policy

No new format family is accepted in Phase 10. Changes are limited to:

- cross-engine UX consistency
- accessibility and keyboard behavior
- recovery/error clarity
- PWA install/update/file-launch behavior
- privacy/security hardening
- regression tests
- production packaging
- release documentation

## Automated certification

Run:

    npm install --no-audit --no-fund
    npm run release:certify

The certification command requires all of the following to pass:

1. Vitest regression suite
2. strict TypeScript check
3. Vite production build
4. service-worker JavaScript syntax check
5. release-contract audit
6. critical copied engine assets present in dist/
7. v1.0 package/manifest/security/privacy metadata consistent

CI runs the same command for pull requests, phase branches, main, and version tags.

## UX acceptance

The stable UI must provide:

- keyboard-accessible file selection
- visible keyboard focus
- skip navigation
- announced progress/status regions
- human-readable recovery instead of raw engine codes
- explicit cancellation and Start over
- result links with descriptive accessible names
- mobile-safe touch targets and safe-area actions
- reduced-motion support

## PWA/update acceptance

- first install may reload once to establish the isolation service worker
- later updates wait instead of forcibly replacing a running converter
- the user can activate an available update explicitly
- same-origin engine assets remain cached locally after first use
- the manifest includes stable identity, icon, and supported file-open handlers

## Security acceptance

- conversion paths remain local
- production CSP allows connections only to the application origin
- framing is denied by production headers
- COOP/COEP/CORP isolation headers remain required
- external resources referenced by user files are not fetched
- unexpected external conversion-time resource activity still invalidates the job

## Known stable-release boundaries

v1.0 intentionally does not claim perfect conversion for every file extension.

Recognition-only formats remain recognition-only where fidelity/security requirements are not met. Memory-backed engines remain device-budgeted. Camera RAW support is embedded-preview extraction, not sensor development. PSD output is flattened. FITS conversion exports header metadata only.

These are product boundaries, not unfinished release blockers.
