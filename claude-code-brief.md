# Project: AUX/KEYS — Real-time keyboard audio analysis & playback

## What this is
A web app that listens to a keyboard's audio signal (via aux/line-in, or mic for testing) in real time, detects what note(s) are being played, and plays them back through a synth voice. Two runtime modes are planned:
- **Mirror mode**: detected note(s) → same instrument sound, played back live
- **One-man-band mode**: detected chord → auto-generated bass line, drums, and harmony pad underneath, so a single keyboardist sounds like a full band

## Who it's for
Built for keyboard players in Pentecostal/modern church worship settings (not orthodox/liturgical church music) — so the accompaniment style, when we get to it, should lean toward gospel/contemporary worship feel (shuffle grooves, straightforward chord progressions), not classical or orthodox chant style.

## Platform decision (already made)
**Web Audio API + JavaScript**, browser-based, targeting eventual PWA packaging so it installs and runs on both desktop and phone from one codebase. No native app store distribution planned. Tone.js is the likely next addition for richer synth/sample voices once we move past raw oscillators.

## Current status: Phases 0–3 complete and verified on real hardware (files: `aux-keys (2).html` + `pitch-processor.js`)
Two-file app (no build step, one external CDN dependency: Tone.js v15.1.22, pinned). Confirmed working end-to-end via `python3 -m http.server` + Chrome desktop, run as a real top-level page.

**Phase 0 — foundation (done):** `getUserMedia` capture, waveform visualizer, YIN monophonic pitch detection moved into an `AudioWorklet` (`pitch-processor.js`) so it runs on the audio rendering thread instead of `requestAnimationFrame`. Stability layer (5-frame median + 4-hop note-lock) — fixed to also gate the *displayed* note letter, not just the played voice, after real-hardware testing caught mid-hold flicker.

**Phase 1 — chroma/chord detection (done):** 12-bin chroma vector, cosine-similarity match against major/minor triad templates. Two real-hardware bugs found and fixed: (1) energy/confidence thresholds guessed too strict at first (silent), then found background noise could false-positive lock a chord — fixed by computing that a flat noise vector scores exactly 0.5 cosine similarity against any 3-note template and setting the confidence floor (0.78) well clear of that baseline, not just above it. (2) chroma needed its own rolling-average smoothing (like the pitch median filter) to stop mid-hold chord flicker.

**Phase 2 — voice, style, tempo (done):** Tone.js voices (Piano/Organ/Strings/Choir/Brass, synthesized not sampled), style selector (Gospel Shuffle/Ballad/Praise & Worship/Up-tempo) with per-style default BPM, tap-tempo + visual metronome, Sustain and Fill controls.

**Phase 3 — auto-band engine (done, the actual differentiator):** look-ahead scheduler (25ms poll / 100ms schedule-ahead — the standard Web Audio precision-timing pattern) driving a 16-step/bar pattern per style: kick/snare/hihat (Tone.MembraneSynth/NoiseSynth), bass alternating root/fifth (Tone.MonoSynth), pad sustaining chord tones (Tone.PolySynth). Sync-start (first real chord starts the band), Sustain toggle controls whether it keeps going through a silence gap, Fill auto-triggers on a chord change (not just the manual button), ±6ms humanized timing on drum/bass hits.

**Since then, also built:** on-screen keyboard visual (highlights by pitch class, any octave); Registrations + Setlist mode (save/recall voice+style+tempo+sustain by name, persisted to `localStorage`, confirmed surviving a reload); session log (timestamped note/chord on/off events, downloadable as text).

**In progress:** multi-track audio recording (input / mirror voice / band as separate downloadable audio files, via `MediaStreamAudioDestinationNode` + `MediaRecorder` per track) — inspired by looking at n-Track Studio's feature set, scoped down from full-DAW territory (no VST hosting, no stem separation, no cloud collaboration — wrong tool for a live performance companion).

## Known constraints / gotchas learned so far
- Claude.ai's artifact preview iframe blocks `getUserMedia` — always develop/test this as a real top-level page (localhost or real host).
- The tester is not a musician — testing stays observational ("did the displayed note/chord stay stable and change appropriately"), not music-theory validation.
- Tone.js v15: `Tone.Destination`/`Tone.Transport`/etc. are the *classes*, not ready instances — use `Tone.getDestination()`/`Tone.getTransport()` etc.
- For any future cosine-similarity/template-matching threshold, compute what a flat/noise vector scores against the template set first and set the floor well clear of that baseline — don't just pick a round number.

## Open decision: song upload + stem separation
Just asked for: upload a music file and separate it into individual instrument components. This is a genuinely different category of feature from everything else here (real-time performance analysis) — real stem separation is a hard ML problem, and the honest options are: (a) a free in-browser ML model (e.g. a TensorFlow.js port of a Spleeter/Demucs-style network) — no cost, private, but a large model download and rougher quality; (b) a third-party cloud API (much better quality/speed, but needs an account/API key, likely costs money per use, and sends the uploaded audio to that service); (c) skip for now — this echoes the vision doc's own "Learn from a recording" stretch goal, already flagged as later-stage. Needs a decision before building, not a guess.

## What to do next (pick up here)
1. Finish multi-track recording (input/mirror/band), verify on real hardware
2. Decide the stem-separation approach above, then scope/build it
3. Remaining backlog from the fuller feature vision (see the expanded brief for the full list): live chord-chart broadcast, auto key/scale detection + auto-transpose, auto-harmony on melody, audio-based register split, playing-intensity-aware band dynamics, one-touch stab pads, vocal-mic auto-ducking, chord looper, scene switching, per-voice effects — prioritize using the automation-scope categorization (fully-automatable vs. smart-default-with-override vs. always-manual) already worked out
4. PWA installability (manifest, service worker) for the phone target — not yet started
