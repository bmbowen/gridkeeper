"use client";
import type { SimEvent } from "@/sim/types";

/**
 * All audio is synthesized at runtime with the Web Audio API — no sample files, no licensing.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let humGain: GainNode | null = null;
let alarmGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

const vol = { master: 0.7, sfx: 0.8, ambience: 0.5, muted: false };

export function initAudio(): void {
  if (ctx || typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }

  // Ambience: mains hum (60 Hz + harmonics) and filtered wind.
  humGain = ctx.createGain();
  humGain.gain.value = 0.0;
  humGain.connect(ambBus);
  for (const [f, g] of [[60, 0.5], [120, 0.28], [180, 0.1]] as const) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = g * 0.22;
    o.connect(og).connect(humGain);
    o.start();
  }
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuf;
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = "bandpass";
  wf.frequency.value = 420;
  wf.Q.value = 0.4;
  const wg = ctx.createGain();
  wg.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.09;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 180;
  lfo.connect(lfoG).connect(wf.frequency);
  lfo.start();
  wind.connect(wf).connect(wg).connect(ambBus);
  wind.start();

  // Alarm loop: gated two-tone klaxon, silent until something is being manipulated.
  alarmGain = ctx.createGain();
  alarmGain.gain.value = 0;
  alarmGain.connect(sfxBus);
  const a = ctx.createOscillator();
  a.type = "square";
  a.frequency.value = 520;
  const alfo = ctx.createOscillator();
  alfo.type = "square";
  alfo.frequency.value = 1.6;
  const alfoG = ctx.createGain();
  alfoG.gain.value = 110;
  alfo.connect(alfoG).connect(a.frequency);
  const af = ctx.createBiquadFilter();
  af.type = "lowpass";
  af.frequency.value = 1400;
  const ag = ctx.createGain();
  ag.gain.value = 0.06;
  a.connect(af).connect(ag).connect(alarmGain);
  a.start();
  alfo.start();

  applyVolume();
}

export function resumeAudio(): void {
  initAudio();
  if (ctx?.state === "suspended") void ctx.resume();
}

function applyVolume() {
  if (!ctx || !master || !sfxBus || !ambBus) return;
  master.gain.setTargetAtTime(vol.muted ? 0 : vol.master, ctx.currentTime, 0.05);
  sfxBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.05);
  ambBus.gain.setTargetAtTime(vol.ambience, ctx.currentTime, 0.05);
}

export function setVolumes(v: Partial<typeof vol>): void {
  Object.assign(vol, v);
  applyVolume();
}

/** Called every UI tick with the state of the world so loops track it. */
export function setAmbience(production: number, alarm: boolean, active: boolean): void {
  if (!ctx || !humGain || !alarmGain) return;
  humGain.gain.setTargetAtTime(active ? 0.25 + production * 0.75 : 0.15, ctx.currentTime, 0.4);
  alarmGain.gain.setTargetAtTime(alarm && active ? 1 : 0, ctx.currentTime, 0.15);
}

interface Tone {
  f: number;
  to?: number;
  t?: number;
  d: number;
  type?: OscillatorType;
  g?: number;
}

function tone({ f, to, t = 0, d, type = "sine", g = 0.2 }: Tone) {
  if (!ctx || !sfxBus) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (to) o.frequency.exponentialRampToValueAtTime(to, now + d);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, now);
  gn.gain.exponentialRampToValueAtTime(g, now + 0.012);
  gn.gain.exponentialRampToValueAtTime(0.0001, now + d);
  o.connect(gn).connect(sfxBus);
  o.start(now);
  o.stop(now + d + 0.05);
}

function noise(d: number, freq: number, g = 0.25, t = 0, q = 0.8) {
  if (!ctx || !sfxBus || !noiseBuf) return;
  const now = ctx.currentTime + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(g, now);
  gn.gain.exponentialRampToValueAtTime(0.0001, now + d);
  src.connect(f).connect(gn).connect(sfxBus);
  src.start(now, (now * 7) % 1.5);
  src.stop(now + d + 0.05);
}

export const sfx = {
  click: () => tone({ f: 880, to: 660, d: 0.06, type: "triangle", g: 0.08 }),
  hover: () => tone({ f: 1320, d: 0.03, type: "sine", g: 0.025 }),
  view: () => {
    tone({ f: 220, to: 880, d: 0.35, type: "sine", g: 0.1 });
    noise(0.35, 2400, 0.04);
  },
  place: () => {
    tone({ f: 520, d: 0.09, type: "triangle", g: 0.14 });
    tone({ f: 780, t: 0.07, d: 0.1, type: "triangle", g: 0.14 });
    tone({ f: 1040, t: 0.14, d: 0.22, type: "sine", g: 0.12 });
  },
  deny: () => {
    tone({ f: 160, d: 0.14, type: "sawtooth", g: 0.09 });
    tone({ f: 120, t: 0.1, d: 0.16, type: "sawtooth", g: 0.09 });
  },
  warn: () => {
    tone({ f: 660, d: 0.12, type: "square", g: 0.06 });
    tone({ f: 880, t: 0.14, d: 0.16, type: "square", g: 0.06 });
  },
  crit: () => {
    for (let i = 0; i < 3; i++) tone({ f: 940, to: 700, t: i * 0.16, d: 0.13, type: "sawtooth", g: 0.08 });
  },
  good: () => {
    tone({ f: 660, d: 0.12, g: 0.12 });
    tone({ f: 990, t: 0.1, d: 0.25, g: 0.12 });
  },
  isolate: () => {
    noise(0.18, 300, 0.4);
    tone({ f: 140, to: 60, d: 0.25, type: "square", g: 0.12 });
  },
  reconnect: () => {
    tone({ f: 300, to: 600, d: 0.2, type: "triangle", g: 0.12 });
    noise(0.08, 1800, 0.1, 0.18);
  },
  trip: () => {
    noise(0.5, 180, 0.6);
    tone({ f: 220, to: 40, d: 0.7, type: "sawtooth", g: 0.16 });
  },
  fire: () => {
    noise(1.2, 500, 0.4, 0, 0.3);
    tone({ f: 90, to: 30, d: 1, type: "sawtooth", g: 0.2 });
  },
  restore: () => {
    noise(0.12, 900, 0.25);
    tone({ f: 80, to: 240, d: 0.5, type: "sawtooth", g: 0.1 });
    tone({ f: 660, t: 0.4, d: 0.2, g: 0.1 });
  },
  eliminated: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * 0.07, d: 0.25, type: "triangle", g: 0.12 }));
  },
  spawn: () => tone({ f: 70, to: 110, d: 0.9, type: "sawtooth", g: 0.05 }),
  wave: () => {
    tone({ f: 196, d: 0.5, type: "sawtooth", g: 0.07 });
    tone({ f: 233, t: 0.25, d: 0.6, type: "sawtooth", g: 0.07 });
  },
  win: () => {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, t: i * 0.13, d: 0.6, type: "triangle", g: 0.14 }));
  },
  lose: () => {
    [392, 330, 262, 196, 131].forEach((f, i) => tone({ f, t: i * 0.22, d: 0.7, type: "sawtooth", g: 0.1 }));
    noise(2, 120, 0.3, 0.3, 0.3);
  },
  star: () => {
    tone({ f: 1320, d: 0.3, g: 0.14 });
    tone({ f: 1760, t: 0.06, d: 0.4, g: 0.1 });
  },
};

export function playEvent(e: SimEvent): void {
  switch (e.type) {
    case "sensor":
    case "harden":
    case "segment":
    case "honeypot":
      return sfx.place();
    case "isolate":
      return sfx.isolate();
    case "reconnect":
    case "unsegment":
      return sfx.reconnect();
    case "denied":
      return sfx.deny();
    case "trip":
      return sfx.trip();
    case "fire":
      return sfx.fire();
    case "restore":
    case "repair":
      return sfx.restore();
    case "eliminated":
      return sfx.eliminated();
    case "remediated":
    case "cleared":
      return sfx.good();
    case "spawn":
      return sfx.spawn();
    case "wave":
      return sfx.wave();
    case "implant":
    case "confirmed":
      return sfx.crit();
    case "suspicious":
    case "blind":
    case "evicted":
      return sfx.warn();
    case "setpoint":
      return sfx.click();
    case "win":
      return sfx.win();
    case "lose":
      return sfx.lose();
    case "start":
      return sfx.restore();
    default:
      return;
  }
}
