# Project: AUX/KEYS — Real-time keyboard audio analysis & playback

## What this is
A browser app that listens to a keyboard's audio signal (aux/line-in, or a microphone for testing), detects pitch and chords, and plays a synth voice or automatic accompaniment. It targets keyboard players in Pentecostal/contemporary worship settings; grooves should favor gospel and worship styles rather than classical or liturgical music.

## Platform and architecture
Web Audio API + JavaScript, no build step. The app is served from `index.html`; `pitch-processor.js` runs YIN pitch detection in an AudioWorklet. Tone.js v15.1.22 is pinned from jsDelivr for synthesized voices. `server.py` serves the app and the same-WiFi chord-chart endpoints; `chart.html` is the bandmate display. PWA manifest and service worker are present. The service worker precaches the app/chart shell and caches the pinned Tone.js script after its first successful network load; first install therefore needs a network connection.

## Current implementation status (2026-10-25)
Phases 0–3 are implemented. Earlier project notes record successful real-hardware verification of pitch and chord stability, but the fixes made in this maintenance pass have only had automated/mock testing; verify audio behavior again on real hardware.

- **Capture and pitch:** `getUserMedia`, waveform view, YIN pitch detection on an AudioWorklet, five-frame median smoothing, and four-hop note lock. Main input reconnection now tears down prior streams, recorders, audio context, and animation loop instead of accumulating duplicate sessions.
- **Chord and key:** 12-bin chroma with major/minor triad matching, smoothing/locking, and a heuristic key estimate from accumulated chord durations. Key estimate and harmony are suggestions; correctness across a whole song still needs musician-led validation.
- **Voices and performance:** quick-select synthesized Piano, Electric Piano, Organ, Strings, Guitar, Pick Bass, Ocarina, Synth Lead, Choir, and Brass, plus a categorized selector for all 128 standard GM program names (16 families × 8). GM entries use family-specific oscillator synthesis with selected patches mapped to the app's shaped voices; these are approximations, not actual GM SoundFont samples or Yamaha XG bank variations. Mirror, one-man-band, and frequency-band Register Split modes; transpose, diatonic third/fifth harmony, touch curve, and per-voice reverb.
- **Auto-band:** look-ahead 16-step style patterns (Gospel Shuffle, Ballad, Praise & Worship, Up-tempo), kick/snare/hi-hat, root/fifth bass, chord pad, sustain, fills, intensity-aware levels, and Intro/Main/Ending section controls. Fill consumption and ending-fill timing were corrected and regression-tested in this pass.
- **Session tools:** chord looper, two scenes, named registrations and setlist, note/chord log download, and separate input/mirror/band audio recordings where `MediaRecorder` is supported. Stopping a looper now returns control to the live chord or stops the band as appropriate. Recording controls report unsupported browser capability instead of aborting audio setup.
- **Chord chart and PWA:** same-WiFi chart broadcast via `server.py`; chart URL now uses the current origin (compatible with proxied HTTPS preview hosts). Offline shell includes `chart.html`; server validates update payloads and bounds request size.

## Tests
Run the automated checks from the repository root:
- `node --test tests/app-runtime.test.js`
- `python3 -m unittest discover -s tests -v`
- Syntax checks: `node --check pitch-processor.js`, extract the inline app script from `index.html` and run `node --check`, and `node --check sw.js`.

The runtime test uses a mocked AudioContext; it does not replace browser microphone, audio-quality, timing, mobile install, or real-device testing.

## Known constraints / decisions
- Microphone access requires a secure context (HTTPS or localhost) and user permission. A sandbox/artifact iframe may block `getUserMedia`; test from a top-level page.
- Pitch detection is monophonic. Register Split is a frequency-band approximation, not true polyphonic/multi-note tracking.
- Tone.js instruments are synthesized approximations, not sampled instruments.
- Chord templates currently cover major/minor triads only. Root/quality and key estimates need human musical validation.
- A flat chroma/noise vector scores 0.5 against a triad template; confidence thresholds should remain well above that baseline.
- Tone.js v15 uses getters such as `Tone.getDestination()` rather than treating `Tone.Destination` as an instantiated node.

## Open decision: song upload + stem separation
Real instrument stem separation is a separate ML problem. Before implementing it, decide between an in-browser model (large download, private, lower quality), a cloud service (better quality, account/cost and audio leaves the device), or deferring it. Do not imply the current live performance app already has stem separation.

## Next steps
1. Re-test capture, mode switching, chord stability, split routing, accompaniment timing, recording downloads, vocal ducking, and reconnection on supported desktop/mobile browsers and real keyboard hardware.
2. Make and document the stem-separation decision before scoping that feature.
3. Revisit backlog only after validation: richer chord qualities/voicings, authored Main A/B grooves, effects, and accessibility/mobile refinements.
