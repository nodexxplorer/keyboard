---
name: project-aux-keys-status
description: "AUX/KEYS project status, architecture, and verification notes"
metadata:
  node_type: memory
  type: project
  originSessionId: 6be2012c-df5c-4655-b410-7889d787e5d0
  modified: 2026-10-25
---

AUX/KEYS is a no-build browser app for contemporary worship keyboardists. Canonical implementation files are `index.html`, `pitch-processor.js`, `server.py`, `chart.html`, and `sw.js`. See `claude-code-brief.md` for the full feature and test status.

**Implemented:** AudioWorklet YIN monophonic pitch detection; chroma major/minor triad detection and heuristic key estimate; quick-select synth voices plus all 128 standard GM program names organized in 16 families (family-specific oscillator approximations, not sampled GM patches/XG banks); Mirror, One-Man-Band, and frequency-band Register Split modes; accompaniment styles, fills, sustain, sections, transpose, harmony, touch curve, reverb, vocal ducking, and manual stab pads; chord looper; registrations, scenes, setlist; session log and per-track audio recording; same-WiFi chord chart; PWA manifest/service worker.

**Maintenance fixes and tests (2026-10-25):** corrected app startup temporal-dead-zone errors around initial Register Split setup; fixed fills repeating every bar and Ending stopping before its fill; corrected diatonic harmony octave placement; limited vocal ducking to the accompaniment bus (not the mirror voice); return control from stopped chord loops to live detection; clean up media/audio resources on reconnect; handle unsupported MediaRecorder without aborting input; preserve/select audio devices; initialize per-GM reverb before capture; recover safely from malformed saved presets; use the current origin for chart links; cache the chart/Tone dependency after an online load; validate and size-limit chart updates; restrict LAN server static paths so project notes and `.git` files are not exposed. Automated Node runtime/regression tests and Python server endpoint tests pass. These mocks do not verify real microphone capture, musical correctness, audio timing, or PWA installation on physical devices.

**Validation caution:** Earlier project notes describe successful hardware tests for pitch/chord stability. Re-run those checks after current code changes. Register Split remains frequency-filtering, not actual polyphonic tracking; key detection is heuristic. Chord templates are major/minor triads only.

**Still open:** choose whether/how to approach uploaded-song stem separation before building it. Real-time performance and source separation are different feature categories; no stem-separation implementation exists yet.
