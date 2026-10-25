const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];

function createElement(id = '') {
  const classes = new Set();
  return {
    id, style: {}, value: '', disabled: false, textContent: '', innerHTML: '',
    children: [], onclick: null,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name); else classes.delete(name);
        return enabled;
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter(item => item !== child); },
    click() {},
    getContext() { return { clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){} }; },
  };
}

class FakeMediaRecorder {
  static instances = [];
  static isTypeSupported() { return true; }
  constructor(stream, options) {
    this.stream = stream; this.mimeType = options?.mimeType || 'audio/webm'; this.state = 'inactive';
    FakeMediaRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}

function bootApp(initialStorage = {}, mediaRecorderClass = undefined) {
  const elements = new Map();
  const storage = new Map(Object.entries(initialStorage));
  class FakeNode {
    constructor() { this.gain = { value: 1, rampTo(){} }; this.frequency = { value: 440, setTargetAtTime(){} }; this.wet = { value: 0 }; }
    connect(destination) { return destination; }
    disconnect() {}
  }
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000; this.currentTime = 0; this.state = 'running';
      this.destination = new FakeNode();
      this.audioWorklet = { addModule: async () => {} };
    }
    createMediaStreamSource() { return new FakeNode(); }
    createAnalyser() {
      return Object.assign(new FakeNode(), {
        fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0,
        getFloatTimeDomainData(data) { data.fill(0); },
        getFloatFrequencyData(data) { data.fill(-Infinity); },
      });
    }
    createGain() { return new FakeNode(); }
    createBiquadFilter() { return new FakeNode(); }
    createMediaStreamDestination() { return Object.assign(new FakeNode(), { stream: { active: true, getTracks: () => [] } }); }
    async close() { this.state = 'closed'; }
  }
  class FakeToneNode extends FakeNode {
    connect() { return this; }
    triggerAttack() {}
    triggerAttackRelease() {}
    triggerRelease() {}
    releaseAll() {}
    start() {}
    dispose() {}
  }
  const workletNodes = [];
  class FakeAudioWorkletNode extends FakeToneNode {
    constructor() { super(); this.port = { onmessage: null }; workletNodes.push(this); }
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    createElement(tag) { return createElement(tag); },
    body: createElement('body'),
  };
  let clock = 1000;
  const context = {
    document,
    window: { AudioContext: FakeAudioContext, MediaRecorder: mediaRecorderClass, location: { href: 'https://example.test/index.html', origin: 'https://example.test', protocol: 'https:', hostname: 'example.test', port: '' } },
    AudioWorkletNode: FakeAudioWorkletNode,
    navigator: {
      mediaDevices: {
        getUserMedia: async () => ({ getTracks: () => [{ stop(){} }], active: true }),
        enumerateDevices: async () => [],
      },
    },
    Tone: {
      setContext(){}, start: async () => {}, getDestination: () => new FakeNode(), now: () => 0,
      Synth: FakeToneNode, MonoSynth: FakeToneNode, Gain: FakeToneNode, Reverb: FakeToneNode,
      Vibrato: FakeToneNode, Filter: FakeToneNode, Chorus: FakeToneNode,
      PolySynth: FakeToneNode, MembraneSynth: FakeToneNode, NoiseSynth: FakeToneNode,
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    performance: { now: () => ++clock },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    console,
    Blob,
    URL,
    Date,
    Math,
    Float32Array,
    Array,
    Object,
    JSON,
    Number,
    String,
    Error,
    isFinite,
  };
  context.window.window = context.window;
  vm.runInNewContext(script, context, { filename: 'index-inline.js' });
  return { elements, storage, workletNodes };
}

test('app script initializes and UI controls run without browser audio hardware', () => {
  const { elements, storage } = bootApp();
  const el = id => elements.get(id);

  el('app-mode-mirror').onclick();
  assert.equal(el('app-mode-mirror').classList.contains('active'), true);
  el('app-mode-band').onclick();
  assert.equal(el('app-mode-band').classList.contains('active'), true);
  assert.equal(el('instr-piano').disabled, true);
  el('app-mode-split').onclick();
  assert.equal(el('instr-piano').disabled, false);
  el('split-up').onclick();
  assert.equal(el('split-display').textContent, 'Split: C#4');

  el('btn-tap').onclick();
  el('btn-tap').onclick();
  assert.equal(el('bpm-display').textContent, '240 BPM (tapped)', 'tap tempo is bounded to keep the scheduler stable');
  el('style-ballad').onclick();
  assert.equal(el('bpm-display').textContent, '68 BPM');
  el('touch-soft').onclick();
  assert.equal(el('touch-soft').classList.contains('active'), true);
  el('harmony-third').onclick();
  assert.match(el('harmony-status').textContent, /select a synth instrument/);
  el('instr-piano').onclick();
  assert.match(el('harmony-status').textContent, /detected key/);
  el('instr-off').onclick();
  assert.match(el('harmony-status').textContent, /select a synth instrument/);
  el('section-ending').onclick();
  assert.equal(el('section-ending').classList.contains('active'), true);
  el('btn-fill').onclick();
  el('btn-sustain').onclick();
  assert.match(el('btn-sustain').textContent, /On/);

  el('reg-name').value = 'Test preset';
  el('btn-save-reg').onclick();
  assert.equal(JSON.parse(storage.get('auxkeys.registrations')).length, 1);
  for(const id of ['instr-epiano','instr-guitar','instr-pickbass','instr-ocarina','instr-synthlead']) el(id).onclick();
  assert.equal(el('instr-synthlead').classList.contains('active'), true);
  assert.equal(el('gm-voice-select').children.length, 16);
  assert.equal(el('gm-voice-select').children.reduce((sum, family) => sum + family.children.length, 0), 128);
  el('gm-voice-select').value = 'gm-79';
  el('gm-voice-select').onchange();
  el('reg-name').value = 'GM Ocarina preset';
  el('btn-save-reg').onclick();
  const saved = JSON.parse(storage.get('auxkeys.registrations'));
  assert.equal(saved[1].settings.instrument, 'gm-79');
  el('registrations-list').children.at(-1).children[1].onclick();
  assert.equal(JSON.parse(storage.get('auxkeys.setlist')).length, 1);
  el('btn-setlist-next').onclick();
  assert.equal(el('gm-voice-select').value, 'gm-79', 'setlist recall restores a GM voice');
  el('scene-save-a').onclick();
  el('scene-recall-a').onclick();
  assert.match(el('scene-status').textContent, /recalled/);
  el('btn-setlist-clear').onclick();
  el('btn-log-clear').onclick();
  el('btn-looper-record').onclick();
  el('btn-looper-record').onclick();
});

test('malformed saved registrations, setlists, and scenes do not break app startup', () => {
  const { elements } = bootApp({
    'auxkeys.registrations': '{"unexpected":true}',
    'auxkeys.setlist': 'null',
    'auxkeys.scenes': '[]',
  });
  assert.match(elements.get('registrations-list').innerHTML, /no registrations saved yet/);
  assert.match(elements.get('setlist-list').innerHTML, /setlist is empty/);
  elements.get('scene-recall-a').onclick();
  assert.match(elements.get('scene-status').textContent, /Scene A is empty/);
});

test('audio input can connect and reconnect cleanly when recording is unsupported', async () => {
  const { elements } = bootApp();
  await elements.get('btn-connect').onclick();
  assert.match(elements.get('input-status').textContent, /signal live/);
  assert.match(elements.get('track-record-status').textContent, /recording unavailable/);
  assert.equal(elements.get('btn-track-input').disabled, true);

  await elements.get('btn-connect').onclick();
  assert.match(elements.get('input-status').textContent, /signal live/);
});

test('supported MediaRecorder starts separate tracks and rotates the downloaded segment', async () => {
  FakeMediaRecorder.instances = [];
  const { elements } = bootApp({}, FakeMediaRecorder);
  await elements.get('btn-connect').onclick();
  assert.match(elements.get('track-record-status').textContent, /recording — input \/ mirror \/ band/);
  assert.equal(FakeMediaRecorder.instances.length, 3);
  assert.equal(elements.get('btn-track-input').disabled, false);
  elements.get('btn-track-input').onclick();
  assert.equal(FakeMediaRecorder.instances.length, 4, 'input recorder resumes as a fresh segment after download');
  assert.equal(FakeMediaRecorder.instances[3].state, 'recording');
});

test('every keyboard voice constructs and follows note attack, glide, and release callbacks', async () => {
  const { elements, workletNodes } = bootApp();
  elements.get('gm-voice-select').value = 'gm-79';
  elements.get('gm-voice-select').onchange();
  assert.equal(elements.get('voice-reverb-value').textContent, '20%');
  await elements.get('btn-connect').onclick();
  const pitchMessage = workletNodes[0].port.onmessage;
  const voiceIds = ['piano','epiano','organ','strings','guitar','pickbass','ocarina','synthlead','choir','brass'];
  for(const key of voiceIds){
    elements.get('instr-' + key).onclick();
    pitchMessage({ data: { level: 0, freq: null } });
    for(let frame = 0; frame < 5; frame++) pitchMessage({ data: { level: 0.1, freq: 440 } });
    assert.equal(elements.get('led-voice').classList.contains('live'), true, key + ' should create an audible voice');
  }
  for(let program = 0; program < 128; program++){
    elements.get('gm-voice-select').value = 'gm-' + program;
    elements.get('gm-voice-select').onchange();
    pitchMessage({ data: { level: 0, freq: null } });
    for(let frame = 0; frame < 5; frame++) pitchMessage({ data: { level: 0.1, freq: 440 } });
    assert.equal(elements.get('led-voice').classList.contains('live'), true, 'GM program ' + (program+1) + ' should create a voice');
  }
});

test('application HTML has unique IDs and all static getElementById targets exist', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
  const refs = [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
  const missing = refs.filter(id => !ids.includes(id) && id !== 'pk-');
  assert.deepEqual(missing, []);
});

test('YIN worklet detects pure tones and emits stable-frame input', () => {
  const processorSource = fs.readFileSync(path.join(root, 'pitch-processor.js'), 'utf8');
  const workletContext = {
    AudioWorkletProcessor: class { constructor(){ this.port = { messages: [], postMessage(data){ this.messages.push(data); } }; } },
    sampleRate: 48000,
    registerProcessor(){},
    Float32Array,
    Math,
    isFinite,
  };
  vm.runInNewContext(processorSource + '\nthis.PitchProcessorForTest = PitchProcessor;', workletContext);
  const processor = new workletContext.PitchProcessorForTest();
  const makeTone = frequency => Float32Array.from({ length: 2048 }, (_, i) => 0.2*Math.sin(2*Math.PI*frequency*i/48000));
  for(const target of [110, 220, 440, 880]){
    const detected = processor.detectPitchYIN(makeTone(target), 48000);
    assert.ok(Math.abs(detected-target) < 2, target + ' Hz should be detected accurately');
  }
  assert.equal(processor.detectPitchYIN(new Float32Array(2048), 48000), null);
  const tone = makeTone(440);
  for(let offset = 0; offset < tone.length; offset += 128){
    processor.process([[tone.slice(offset, offset+128)]]);
  }
  assert.ok(processor.port.messages.length > 0);
  assert.ok(Math.abs(processor.port.messages.at(-1).freq-440) < 2);
});

test('chord templates match major/minor triads and preserve the known flat-noise baseline', () => {
  const start = script.indexOf('  const CHORD_QUALITIES =');
  const end = script.indexOf('  // --- auto key/scale detection', start);
  const block = script.slice(start, end);
  const context = { Math, Object, isFinite, freqToMidi: f => 69 + 12*Math.log2(f/440) };
  vm.runInNewContext(block + '\nthis.chordAPI = { CHORD_QUALITIES, CHORD_TEMPLATES, matchChord, cosineSim, computeChroma, averageChroma };', context);
  const api = context.chordAPI;
  assert.equal(api.CHORD_TEMPLATES.length, 24);
  const cMajor = Array(12).fill(0); [0,4,7].forEach(pc => { cMajor[pc] = 1; });
  const fSharpMinor = Array(12).fill(0); [6,9,1].forEach(pc => { fSharpMinor[pc] = 1; });
  const cMatch = api.matchChord(cMajor);
  assert.equal(cMatch.root, 0);
  assert.equal(cMatch.quality, 'maj');
  assert.ok(Math.abs(cMatch.score-1) < 1e-12);
  const fSharpMatch = api.matchChord(fSharpMinor);
  assert.equal(fSharpMatch.root, 6);
  assert.equal(fSharpMatch.quality, 'min');
  assert.ok(Math.abs(fSharpMatch.score-1) < 1e-12);
  assert.ok(Math.abs(api.matchChord(Array(12).fill(1)).score-0.5) < 1e-12);
});

test('vocal ducking does not reduce the mirror voice level', () => {
  const match = script.match(/function updateBandIntensity\(level\)\s*\{[\s\S]*?\n  \}/)[0];
  const gains = [];
  const context = {
    INTENSITY_REFERENCE_RMS: 0.15, INTENSITY_SMOOTHING: 0.9,
    TOUCH_CURVES: { normal: value => value }, touchCurve: 'normal', bandIntensity: 0,
    MIRROR_GAIN_MIN: 0.15, MIRROR_GAIN_MAX: 0.5, duckFactor: 0.35,
    voiceOutput: { gain: { rampTo(value){ gains.push(value); } } },
  };
  vm.runInNewContext(`${match}; this.updateIntensity = updateBandIntensity;`, context);
  context.updateIntensity(0.15);
  assert.ok(gains[0] > 0.18 && gains[0] < 0.2, 'mirror gain follows touch intensity, not vocal duck factor');
});

test('diatonic harmony computes scale thirds/fifths across octave boundaries', () => {
  const match = script.match(/function diatonicHarmonyMidi\(melodyMidi, key, degreesUp\)\s*\{[\s\S]*?\n  \}/)[0];
  const context = { KEY_SCALE_INTERVALS: { maj:[0,2,4,5,7,9,11], min:[0,2,3,5,7,8,10] } };
  vm.runInNewContext(`${match}; this.getHarmony = diatonicHarmonyMidi;`, context);
  assert.equal(context.getHarmony(60, {root:0,quality:'maj'}, 2), 64); // C4 -> E4
  assert.equal(context.getHarmony(71, {root:0,quality:'maj'}, 2), 74); // B4 -> D5
  assert.equal(context.getHarmony(69, {root:9,quality:'min'}, 4), 76); // A4 -> E5
});

test('band scheduler consumes a fill once and stops after its ending fill bar', () => {
  const scheduleStep = script.match(/function scheduleStep\(step, time\)\s*\{[\s\S]*?\n  \}/)[0];
  const fillHits = [];
  let stopCount = 0;
  const context = {
    STYLE_PATTERNS: { gospel: {
      kick: Array(16).fill(0), snare: Array(16).fill(0), hihat: Array(16).fill(0),
      fillSnare: Array.from({ length: 16 }, (_, i) => i >= 12 ? 1 : 0), bass: Array(16).fill(null),
    } },
    currentStyle: 'gospel', queuedFill: true, endingPending: false, endingFillBarCompleted: false,
    bandChordKey: '0:maj', bandKick: { triggerAttackRelease(){} },
    bandSnare: { triggerAttackRelease(...args) { fillHits.push(args); } },
    bandHihat: { triggerAttackRelease(){} }, bandBass: { triggerAttackRelease(){} },
    bandVelocity: () => 1, effectiveIntensity: () => 1, humanize: value => value,
    INTENSITY_SPARSE_THRESHOLD: 0.25, bassNoteFreq: () => 110,
    updatePadForCurrentChord(){}, stopBandEngine(){ stopCount++; },
  };
  vm.runInNewContext(`${scheduleStep}; this.runScheduleStep = scheduleStep;`, context);

  for (let step = 0; step < 16; step++) context.runScheduleStep(step, step);
  assert.equal(fillHits.length, 4);
  assert.equal(context.queuedFill, false);
  fillHits.length = 0;
  for (let step = 0; step < 16; step++) context.runScheduleStep(step, step + 16);
  assert.equal(fillHits.length, 0, 'fill must not repeat on the following bar');

  context.queuedFill = true;
  context.endingPending = true;
  context.endingFillBarCompleted = false;
  for (let step = 0; step < 16; step++) context.runScheduleStep(step, step + 32);
  assert.equal(stopCount, 0, 'engine must finish the fill bar');
  assert.equal(context.endingFillBarCompleted, true);
  context.runScheduleStep(0, 48);
  assert.equal(stopCount, 1, 'engine stops on the next downbeat');
  assert.equal(context.endingPending, false);
  assert.match(script, /if\(wasPlaying\)[\s\S]*?bandChordKey = lastChordKey/);
});
