/**
 * Procedural sound (WebAudio) — zero asset downloads, instant, and licence-free.
 * Foley-style: thumps, paper, cloth, match strikes, a ref's bell. Replace/augment with CC0 samples later.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let droneNodes: { stop: () => void } | null = null;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  ensure();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
}
export const isMuted = () => muted;

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noise(t: number, dur: number, peak: number, filterHz: number, q = 0.8, type: BiquadFilterType = "lowpass") {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterHz;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.005, peak, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.1);
}

function tone(t: number, freq: number, endFreq: number, dur: number, peak: number, type: OscillatorType = "sine") {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
  const g = c.createGain();
  env(g, t, 0.004, peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.1);
}

export const sfx = {
  /** token slapped on the table */
  slam() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 140, 48, 0.28, 0.9, "sine");
    noise(t, 0.12, 0.5, 900);
    noise(t, 0.05, 0.25, 4200, 1, "highpass");
  },
  /** card flip / paper */
  flip() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.16, 0.35, 3200, 0.6, "bandpass");
    noise(t + 0.09, 0.08, 0.3, 5200, 0.9, "highpass");
  },
  hit(power = 1) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 110 + 20 * power, 38, 0.32, 1.0, "sine");
    noise(t, 0.2, 0.9 * Math.min(1.2, power), 1400);
    noise(t, 0.06, 0.4, 6000, 0.8, "highpass");
  },
  brace() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 90, 60, 0.25, 0.5, "triangle");
    noise(t, 0.18, 0.35, 500);
  },
  switchIn() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.28, 0.4, 1800, 0.7, "bandpass");
    tone(t + 0.12, 220, 120, 0.12, 0.25, "triangle");
  },
  match() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.35, 0.28, 3400, 0.5, "bandpass");
    noise(t + 0.2, 0.5, 0.1, 800);
  },
  tick() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 1700, 1500, 0.03, 0.18, "square");
  },
  lock() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 520, 380, 0.09, 0.35, "square");
    noise(t, 0.05, 0.35, 2400, 1, "highpass");
  },
  bell(big = false) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    for (const [m, p] of [[1, 0.6], [2.76, 0.3], [5.4, 0.18]] as const) tone(t, 640 * m, 636 * m, big ? 2.4 : 1.4, p * 0.55, "sine");
  },
  ko() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 70, 24, 1.2, 1.0, "sine");
    noise(t, 0.5, 0.9, 700);
    sfx.bell(true);
  },
  heal() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 330, 440, 0.2, 0.25, "triangle");
    tone(t + 0.1, 440, 660, 0.25, 0.22, "triangle");
  },
  stamp() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 90, 40, 0.18, 0.8, "sine");
    noise(t, 0.1, 0.6, 1100);
  },
  startDrone() {
    const c = ensure();
    if (!c || !master || droneNodes) return;
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 3);
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    o1.type = "sawtooth";
    o2.type = "sawtooth";
    o1.frequency.value = 41.2;
    o2.frequency.value = 41.9;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 180;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = c.createGain();
    lg.gain.value = 60;
    lfo.connect(lg).connect(f.frequency);
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(master);
    o1.start();
    o2.start();
    lfo.start();
    droneNodes = {
      stop() {
        const n = c.currentTime;
        g.gain.setTargetAtTime(0.0001, n, 0.4);
        o1.stop(n + 2);
        o2.stop(n + 2);
        lfo.stop(n + 2);
        droneNodes = null;
      },
    };
  },
  stopDrone() {
    droneNodes?.stop();
  },
};
