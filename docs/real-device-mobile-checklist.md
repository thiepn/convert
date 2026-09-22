# Physical Mobile Device Acceptance Checklist

Automated browser emulation cannot reproduce every installed-PWA behavior. This checklist is the release boundary for claims that require actual Android or iOS hardware.

No item in this document should be marked verified until it has been performed on a physical device.

## Android — Chrome installed PWA

### Installation and launch

- [ ] Install Thiepn Convert from Chrome using the PWA install flow.
- [ ] Confirm icon, name, theme, and standalone window presentation.
- [ ] Cold-launch from the home screen after Chrome has been removed from recents.
- [ ] Confirm no browser toolbar appears in standalone mode.
- [ ] Confirm first-launch/update behavior does not loop or unexpectedly reload.

### Insets, touch and rotation

- [ ] Verify portrait layout on a device with rounded corners or display cutout.
- [ ] Verify landscape layout.
- [ ] Confirm sticky actions do not overlap Android gesture/navigation areas.
- [ ] Confirm no horizontal overflow after repeated portrait/landscape rotation.
- [ ] Confirm all primary actions are comfortable to tap.
- [ ] Confirm long filenames and warnings do not push controls outside the viewport.

### File system flows

- [ ] Pick a file from Android Files.
- [ ] Pick an image through the system photo picker when offered.
- [ ] Convert SRT → WebVTT.
- [ ] Convert PNG → JPEG.
- [ ] Convert WAV → FLAC.
- [ ] Optimize a PDF.
- [ ] Save each result through the Android download/file UI.
- [ ] Verify multi-file selection.
- [ ] Verify a file opened through the PWA file-handler path when the OS/browser exposes that flow.

### Lifecycle and resilience

- [ ] Start a conversion, switch to another app, then return.
- [ ] Lock the phone during an idle/long operation and return.
- [ ] Background the installed PWA long enough for Android to pressure/suspend it.
- [ ] Verify Start over after resume leaves no stale result.
- [ ] Verify cancellation during active work.
- [ ] Run several conversions back-to-back and confirm the app remains responsive.

### Offline

- [ ] Launch online once and allow the shell to cache.
- [ ] Enable airplane mode.
- [ ] Cold-launch the installed PWA from the home screen.
- [ ] Convert SRT → WebVTT entirely offline.
- [ ] Re-open previously cached shell after force-closing the PWA.
- [ ] Verify a route that needs an engine asset gives a clear outcome if that asset was never cached.
- [ ] Return online and confirm normal operation resumes.

## iPhone / iPad — Safari Home Screen web app

### Installation and launch

- [ ] Add Thiepn Convert to the Home Screen from Safari.
- [ ] Confirm the correct icon and app title.
- [ ] Confirm standalone presentation after launch.
- [ ] Cold-launch after terminating Safari/Home Screen app state.
- [ ] Confirm there is no reload loop after an update.

### Insets and device geometry

- [ ] Test an iPhone with a notch/Dynamic Island if available.
- [ ] Verify top content stays outside unsafe sensor regions.
- [ ] Verify bottom sticky actions stay above the Home indicator.
- [ ] Rotate portrait → landscape → portrait.
- [ ] Verify left/right safe areas in landscape.
- [ ] Test iPad portrait and landscape if an iPad is available.
- [ ] Verify split-view/Stage Manager resizing if supported by the device.

### File flows and output

- [ ] Pick a subtitle/document through Files.
- [ ] Pick an image through Photos/Files where offered.
- [ ] Convert SRT → WebVTT.
- [ ] Convert PNG → JPEG.
- [ ] Convert WAV → FLAC.
- [ ] Optimize a PDF.
- [ ] Verify result download/save behavior in the iOS Files/share UI.
- [ ] Verify repeated selections do not retain the prior file unexpectedly.

### Keyboard and form behavior

- [ ] Focus text, numeric, password, and SQL/query controls.
- [ ] Confirm the viewport does not zoom unexpectedly.
- [ ] Confirm the software keyboard does not permanently obscure sticky actions.
- [ ] Dismiss/reopen the keyboard and confirm layout recovers.
- [ ] Test external keyboard navigation on iPad if available.

### Lifecycle

- [ ] Switch apps during an active/idle session and return.
- [ ] Lock/unlock the device.
- [ ] Resume after iOS has reclaimed the web view.
- [ ] Verify stale conversion work does not repaint a new selection.
- [ ] Verify a resumed app does not leak old download links.

### Offline

- [ ] Launch online once to populate the cache.
- [ ] Disable Wi-Fi and cellular data / use airplane mode.
- [ ] Cold-launch the Home Screen app.
- [ ] Confirm the shell renders without a network connection.
- [ ] Convert SRT → WebVTT offline.
- [ ] Terminate and cold-launch again while still offline.
- [ ] Restore connectivity and verify normal operation.

## Accessibility and OS integration

On at least one physical Android device and one physical iOS/iPadOS device:

- [ ] Test TalkBack / VoiceOver navigation through file selection, target selection, Convert, progress, result, and Start over.
- [ ] Confirm status/progress changes are understandable without relying on color alone.
- [ ] Confirm system text scaling does not make primary controls unusable.
- [ ] Confirm reduced-motion preference does not introduce broken transitions.
- [ ] Confirm high-contrast/increased-contrast mode remains readable where the OS/browser exposes it.

## Certification record

When this checklist is actually executed, record:

- device model
- OS version
- browser/WebView version
- installed-PWA versus browser-tab mode
- date
- routes tested
- any failure and reproduction steps
- final pass/fail state

The automated Playwright matrix and this physical-device checklist are complementary. Passing CI does not automatically mark these physical-device items complete.
