/**
 * Aion Forge Audio Engine
 *
 * Philosophy: atmosphere over soundtrack, presence over stimulation,
 * subtlety over spectacle. Sound should amplify wonder without demanding
 * attention. Users should occasionally forget the audio exists.
 *
 * All sounds are synthesized via Web Audio API — no audio files.
 * This reflects the emergence philosophy: complexity from simple rules.
 */

import { createRNG } from "../simulation/rng";

export type AudioLayer = "ambient" | "discovery" | "interface";

export interface AudioPreferences {
  masterVolume:    number;  // 0–1
  ambientVolume:   number;
  discoveryVolume: number;
  interfaceVolume: number;
  muted:           boolean;
}

const DEFAULT_PREFS: AudioPreferences = {
  masterVolume:    0.6,
  ambientVolume:   0.7,
  discoveryVolume: 0.5,
  interfaceVolume: 0,      // interface click sounds off by default
  muted:           true,   // silent until the viewer turns sound on
};

const PREFS_KEY = "aion-forge-audio-prefs";

// ── Shared output bus ─────────────────────────────────────────────────────────
//
// Every layer feeds one chain, so all sounds share a room and a safe ceiling:
//
//   layers → bus ─┬──────────────── low cut → glue compressor → makeup → limiter → master
//                 └→ reverb send → room ┘
//
// The low cut removes rumble below what speakers play (it was heard as mud);
// the limiter lets the makeup gain raise the overall level without clipping
// when several sounds overlap.

const LOW_CUT_HZ        = 60;    // 12 dB/octave below this
const REVERB_SEND       = 0.3;   // share of each sound sent into the room
const ROOM_SECONDS      = 3.2;   // reverb tail length
const ROOM_DECAY_PER_S  = 2.2;   // tail falls by e^(−this·t)
const ROOM_SEED         = 0xA0D10;  // fixed: the room sounds the same every session
const MAKEUP_GAIN       = 2.0;   // ≈ +6 dB before the limiter
const LIMIT_THRESHOLD_DB = -3;

/** Build the shared chain into `output`; returns the node layers connect to. */
function buildOutputBus(ctx: AudioContext, output: AudioNode): GainNode {
  const bus = ctx.createGain();

  const lowCut = ctx.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.frequency.value = LOW_CUT_HZ;
  lowCut.Q.value = Math.SQRT1_2;

  const send = ctx.createGain();
  send.gain.value = REVERB_SEND;
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);

  bus.connect(lowCut);
  bus.connect(send);
  send.connect(room);
  room.connect(lowCut);

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -24;
  glue.knee.value = 12;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.03;
  glue.release.value = 0.3;

  const makeup = ctx.createGain();
  makeup.gain.value = MAKEUP_GAIN;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMIT_THRESHOLD_DB;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;

  lowCut.connect(glue);
  glue.connect(makeup);
  makeup.connect(limiter);
  limiter.connect(output);
  return bus;
}

/**
 * A synthetic room: decaying noise, separate for left and right so the tail
 * spreads in stereo, growing darker as it fades the way air absorbs highs.
 */
function roomImpulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * ROOM_SECONDS);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const rng = createRNG(ROOM_SEED);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let smoothed = 0;
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const brightness = 0.9 * Math.exp(-t / 0.8) + 0.08;  // one-pole lowpass coefficient
      smoothed += brightness * ((rng() * 2 - 1) - smoothed);
      data[i] = smoothed * Math.exp(-ROOM_DECAY_PER_S * t);
    }
  }
  return buffer;
}

// ── Singleton audio engine ────────────────────────────────────────────────────

class AionAudioEngine {
  private ctx:         AudioContext | null = null;
  private masterGain:  GainNode | null = null;
  private layerGains:  Map<AudioLayer, GainNode> = new Map();
  private prefs:       AudioPreferences;
  private initialized: boolean = false;

  constructor() {
    this.prefs = this.loadPrefs();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Call on first user gesture — browser requires this. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    const bus = buildOutputBus(this.ctx, this.masterGain);

    for (const layer of ["ambient", "discovery", "interface"] as AudioLayer[]) {
      const g = this.ctx.createGain();
      g.connect(bus);
      this.layerGains.set(layer, g);
    }

    this.applyPrefs();
  }

  get isReady(): boolean {
    return this.initialized && this.ctx !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  layerGain(layer: AudioLayer): GainNode | null {
    return this.layerGains.get(layer) ?? null;
  }

  // ── Preferences ───────────────────────────────────────────────────────────

  getPrefs(): AudioPreferences { return { ...this.prefs }; }

  setPrefs(partial: Partial<AudioPreferences>): void {
    this.prefs = { ...this.prefs, ...partial };
    this.savePrefs();
    this.applyPrefs();
  }

  private applyPrefs(): void {
    if (!this.masterGain || !this.ctx) return;
    const { masterVolume, ambientVolume, discoveryVolume, interfaceVolume, muted } = this.prefs;

    const now = this.ctx.currentTime;
    const master = muted ? 0 : masterVolume;
    this.masterGain.gain.setTargetAtTime(master, now, 0.05);

    const layerVols: Record<AudioLayer, number> = {
      ambient:      ambientVolume,
      discovery:    discoveryVolume,
      interface:    interfaceVolume,
    };
    for (const [layer, gain] of this.layerGains) {
      gain.gain.setTargetAtTime(layerVols[layer], now, 0.05);
    }
  }

  private loadPrefs(): AudioPreferences {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_PREFS };
  }

  private savePrefs(): void {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
  }

  // ── Low-level synthesis helpers ────────────────────────────────────────────

  /** Create an oscillator connected to a layer gain. Caller must start/stop it. */
  createOscillator(
    layer: AudioLayer,
    type: OscillatorType,
    frequency: number,
    gainValue: number,
  ): { osc: OscillatorNode; gain: GainNode } | null {
    if (!this.ctx) return null;
    const layerG = this.layerGains.get(layer);
    if (!layerG) return null;

    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    gain.connect(layerG);

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gain);

    return { osc, gain };
  }

  /** Create a biquad filter connected to a layer. */
  createFilter(
    layer: AudioLayer,
    type: BiquadFilterType,
    frequency: number,
    q = 1,
  ): BiquadFilterNode | null {
    if (!this.ctx) return null;
    const layerG = this.layerGains.get(layer);
    if (!layerG) return null;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    filter.connect(layerG);
    return filter;
  }

  /** Schedule a gain ramp on any gain node. */
  ramp(gain: GainNode, target: number, duration: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(target, now, duration / 3);
  }

  /** Fade a gain node to zero and disconnect after duration. */
  fadeOut(gain: GainNode, duration: number, onDone?: () => void): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0, now, duration / 4);
    setTimeout(onDone ?? (() => {}), duration * 1000 + 50);
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }
}

export const audioEngine = new AionAudioEngine();
