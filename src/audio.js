// Audio: tiny procedural sound effects and ambience. No audio files; every sound is synthesised.
// The sample generator below is adapted from ZzFX by Frank Force (MIT License, Copyright 2019),
// https://github.com/KilledByAPixel/ZzFX, changed to return samples so sounds can be cached and
// routed through one master gain that the mute switch controls.

const SAMPLE_RATE = 44100;

// ZzFX sample generator. Parameters, in order: volume, randomness, frequency, attack, sustain,
// release, shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise,
// modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter.
export function zzfxG(
  volume = 1,
  randomness = 0.05,
  frequency = 220,
  attack = 0,
  sustain = 0,
  release = 0.1,
  shape = 0,
  shapeCurve = 1,
  slide = 0,
  deltaSlide = 0,
  pitchJump = 0,
  pitchJumpTime = 0,
  repeatTime = 0,
  noise = 0,
  modulation = 0,
  bitCrush = 0,
  delay = 0,
  sustainVolume = 1,
  decay = 0,
  tremolo = 0,
  filter = 0
) {
  const PI2 = Math.PI * 2;
  const abs = Math.abs;
  const sign = (v) => (v < 0 ? -1 : 1);
  let startSlide = (slide *= (500 * PI2) / SAMPLE_RATE / SAMPLE_RATE);
  let startFrequency = (frequency *= ((1 + randomness * 2 * Math.random() - randomness) * PI2) / SAMPLE_RATE);
  let modOffset = 0;
  let repeat = 0;
  let crush = 0;
  let jump = 1;
  let length;
  const b = [];
  let t = 0;
  let i = 0;
  let s = 0;
  let f;
  const quality = 2;
  const w = (PI2 * abs(filter) * 2) / SAMPLE_RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x2 = 0;
  let x1 = 0;
  let y2 = 0;
  let y1 = 0;

  attack = attack * SAMPLE_RATE || 9;
  decay *= SAMPLE_RATE;
  sustain *= SAMPLE_RATE;
  release *= SAMPLE_RATE;
  delay *= SAMPLE_RATE;
  deltaSlide *= (500 * PI2) / SAMPLE_RATE ** 3;
  modulation *= PI2 / SAMPLE_RATE;
  pitchJump *= PI2 / SAMPLE_RATE;
  pitchJumpTime *= SAMPLE_RATE;
  repeatTime = (repeatTime * SAMPLE_RATE) | 0;

  for (length = (attack + decay + sustain + release + delay) | 0; i < length; b[i++] = s * volume) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? ((t / PI2) % 1 < shapeCurve / 2) * 2 - 1
                : Math.sin(t ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (((2 * t) / PI2) % 2 + 2) % 2
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);
      s =
        (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0);
      s = delay ? s / 2 + (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2 / volume) : s;
      if (filter) s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }
    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * (((i * i * PI2) % 2) - 1);
    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }
    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump ||= 1;
    }
  }
  return b;
}

// Sound presets (ZzFX parameter lists). Kept soft to suit a cozy game.
export const SOUNDS = {
  pop: [0.55, 0.06, 420, 0.005, 0.02, 0.12, 0, 1.4, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0.7],
  popBig: [0.6, 0.05, 230, 0.01, 0.04, 0.22, 1, 1.5, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0.7],
  plant: [0.45, 0.05, 760, 0.005, 0.02, 0.1, 0, 1, 24, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.6],
  road: [0.3, 0.08, 170, 0.002, 0.01, 0.05, 2, 1, 0, 0, 0, 0, 0, 0.4],
  water: [0.3, 0.1, 520, 0.01, 0.05, 0.3, 4, 1, -6, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 1400],
  demolish: [0.6, 0.2, 110, 0.005, 0.07, 0.32, 4, 1.2, -2, 0, 0, 0, 0, 1, 0, 0.1, 0, 0.6, 0, 0, 900],
  nope: [0.35, 0, 140, 0.01, 0.04, 0.1, 2, 1, -3],
  chime: [0.6, 0, 880, 0.01, 0.08, 0.5, 0, 1.8, 0, 0, 440, 0.09, 0, 0, 0, 0, 0.08, 0.5],
  good: [0.4, 0, 660, 0.01, 0.06, 0.28, 0, 1.5, 0, 0, 330, 0.06],
  bad: [0.38, 0, 330, 0.01, 0.06, 0.28, 0, 1.5, 0, 0, -110, 0.07],
  click: [0.2, 0, 1300, 0, 0.004, 0.03],
  grow: [0.3, 0.05, 1100, 0.005, 0.03, 0.15, 0, 1, 0, 0, 500, 0.04],
  undo: [0.35, 0, 560, 0.005, 0.03, 0.1, 0, 1, -14],
  fanfare: [0.45, 0, 523, 0.02, 0.18, 0.5, 0, 1.6, 0, 0, 262, 0.12, 0.24, 0, 0, 0, 0.1, 0.6],
  bird: [0.12, 0.35, 2600, 0.01, 0.03, 0.06, 0, 1.5, 40, -90, 0, 0, 0.05],
  thunder: [0.75, 0.15, 48, 0.03, 0.35, 1.7, 4, 1.6, 0, 0, 0, 0, 0, 2, 0, 0.1, 0, 0.55, 0.25, 0.2, 380],
  warning: [0.32, 0, 640, 0.06, 0.55, 0.3, 0, 1.3, 0, 0, -160, 0.28, 0.28, 0, 0, 0, 0, 0.7],
  cricket: [0.05, 0.1, 4300, 0, 0.012, 0.02, 5, 0.5, 0, 0, 0, 0, 0.026, 0, 0, 0, 0, 1, 0, 0.6],
};

const MUTE_KEY = 'pocket-metropolis:muted';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage may be unavailable */
    }
    this._last = {};
    this.rain = null;
    // Browsers only allow audio after a user gesture, so start on the first touch or key.
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return !!this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  // Play a preset. `gap` stops the same sound stacking up when many fire at once.
  play(name, { delay = 0, gap = 0.04, volume = 1 } = {}) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    if (this._last[name] && now - this._last[name] < gap) return;
    this._last[name] = now;
    const params = SOUNDS[name].slice();
    params[0] *= volume;
    const samples = zzfxG(...params);
    const buffer = this.ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    src.start(now);
  }

  // Background sound: birds by day, crickets at night, rain when it rains.
  ambient(dt, { daylight, rain }) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    if (!rain && daylight > 0.6 && Math.random() < dt * 0.35) {
      this.play('bird', { gap: 0.3 });
      if (Math.random() < 0.5) this.play('bird', { delay: 0.12 + Math.random() * 0.1, gap: 0 });
    }
    if (daylight < 0.25 && !rain && Math.random() < dt * 0.5) this.play('cricket', { gap: 0.4 });
    this.setRain(rain);
  }

  // A looping filtered-noise bed whose loudness follows the rain.
  setRain(amount) {
    if (!this.ctx) return;
    if (!this.rain && amount > 0) {
      const len = SAMPLE_RATE * 2;
      const buf = this.ctx.createBuffer(1, len, SAMPLE_RATE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      this.rain = { gain, level: 0 };
    }
    if (this.rain) {
      const target = Math.max(0, Math.min(1, amount)) * 0.18;
      if (Math.abs(target - this.rain.level) > 0.005) {
        this.rain.level = target;
        this.rain.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8);
      }
    }
  }
}
