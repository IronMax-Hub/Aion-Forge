/**
 * Ambient layer — the auditory foundation of Aion Forge.
 *
 * A bed is made of two things, both procedural:
 *   - swells: soft voices that rise, hold and fade on notes from a small set,
 *     each followed by a rest, so no tone sits unchanged and the harmony drifts;
 *   - wind: pink noise through a band that slowly wanders, so the air breathes.
 *
 * Each view has its own pitch set, register and colour. Every choice of note,
 * length, rest and pan comes from a seeded stream, so a view always unfolds
 * the same way from the moment it opens. Nothing here should demand attention.
 */

import { audioEngine } from "./engine";
import { createRNG, mixSeed, type RNG } from "../simulation/rng";

interface AmbientProfile {
  /** Lowest note, as a MIDI number (57 = A3 = 220 Hz) */
  rootMidi:     number;
  /** Notes voices may choose, in semitones above the root */
  intervals:    number[];
  /** Voices that may sound at once */
  voices:       number;
  /** Swell length range (seconds, rise + hold + fade) */
  swellSeconds: [number, number];
  /** Rest after a swell (seconds) */
  restSeconds:  [number, number];
  /** Filter opening at a swell's peak, as a multiple of the note's pitch */
  brightness:   number;
  /** Range the wind band wanders through (Hz) */
  windBand:     [number, number];
  /** Wind level relative to the voices */
  windGain:     number;
  /** Overall bed gain */
  gain:         number;
}

// Each view context has a distinct character. Roots sit at or above ~110 Hz
// so the bed is heard on small speakers; the colour comes from the interval set.
const PROFILES: Record<string, AmbientProfile> = {
  galaxy: {        // open fifths and ninths: wide, unresolved
    rootMidi: 50, intervals: [0, 7, 12, 14, 19, 24],
    voices: 3, swellSeconds: [14, 26], restSeconds: [3, 10],
    brightness: 3.0, windBand: [300, 1400], windGain: 0.5, gain: 0.9,
  },
  system: {        // fourths: a little closer, a little brighter
    rootMidi: 52, intervals: [0, 5, 7, 12, 17, 19],
    voices: 3, swellSeconds: [12, 22], restSeconds: [3, 9],
    brightness: 3.5, windBand: [400, 1800], windGain: 0.4, gain: 0.85,
  },
  planet: {
    rootMidi: 53, intervals: [0, 7, 9, 12, 16, 19],
    voices: 3, swellSeconds: [12, 22], restSeconds: [3, 9],
    brightness: 3.5, windBand: [250, 1200], windGain: 0.7, gain: 0.85,
  },
  biosphere: {     // major sixths: warm
    rootMidi: 48, intervals: [0, 4, 7, 9, 12, 16],
    voices: 3, swellSeconds: [10, 20], restSeconds: [2, 8],
    brightness: 4.0, windBand: [500, 2200], windGain: 0.45, gain: 0.85,
  },
  civilization: {  // pentatonic: ordered, human
    rootMidi: 50, intervals: [0, 2, 7, 9, 12, 14],
    voices: 3, swellSeconds: [10, 18], restSeconds: [2, 7],
    brightness: 4.0, windBand: [400, 1600], windGain: 0.35, gain: 0.8,
  },
  timeline: {      // minor, slow: deep time
    rootMidi: 45, intervals: [0, 7, 10, 12, 15, 19],
    voices: 2, swellSeconds: [18, 30], restSeconds: [4, 12],
    brightness: 2.5, windBand: [200, 900], windGain: 0.6, gain: 0.9,
  },
  laboratory: {    // sparse and clear
    rootMidi: 55, intervals: [0, 2, 7, 12, 14],
    voices: 2, swellSeconds: [10, 18], restSeconds: [3, 9],
    brightness: 4.5, windBand: [600, 2400], windGain: 0.3, gain: 0.8,
  },
};

const VIEW_ORDER = Object.keys(PROFILES);

const AMBIENT_SEED  = 0xA3B1E7;  // fixed: a view always opens the same way
const VOICE_PEAK    = 0.06;      // one swell's peak gain
const DETUNE_CENTS  = 6;         // the two oscillators of a voice drift apart by this
const WIND_LEVEL    = 0.06;      // wind gain at windGain = 1
const WIND_MOVE_S   = [4, 9];    // seconds between the wind band's moves
const MAX_PAN       = 0.7;       // voices spread across the stereo field
const FIRST_RISE_S  = 2;         // a new bed's first swells rise this fast, so a view change has no gap

const LOOKAHEAD_S   = 2;         // swells are placed on the audio clock this far ahead
const TICK_MS       = 500;       // how often the scheduler looks ahead

const FADE_IN_TAU   = 1.5;  // seconds (time constant) for a new bed to swell in
const FADE_OUT_TAU  = 2.5;  // seconds (time constant) for an old bed to fade away
const RETIRE_AFTER  = 6;    // seconds until a fading bed's sources stop (≈ 6 τ: silent)
const STOP_FADE_TAU = 1.5;  // seconds (time constant) when sound is turned off

/** One view's sound: swells and wind sharing a gain, built and retired together. */
interface Bed {
  profile:   AmbientProfile;
  rng:       RNG;
  gain:      GainNode;
  /** Audio-clock time each voice slot is free to start its next swell */
  nextStart: number[];
  /** Whether each slot has sounded yet (its first swell rises fast) */
  started:   boolean[];
  windAt:    number;
  windBand:  BiquadFilterNode;
  sources:   Set<AudioScheduledSourceNode>;
  timer?:    ReturnType<typeof setInterval>;
}

const between = (rng: RNG, [lo, hi]: readonly number[]) => lo + rng() * (hi - lo);
const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class AmbientLayer {
  private bed:        Bed | null = null;
  private pinkNoise:  AudioBuffer | null = null;
  private currentContext = "galaxy";
  private running = false;

  start(): void {
    if (this.running || !audioEngine.isReady) return;
    this.running = true;
    this.bed = this.buildBed(this.currentContext);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.bed) this.retire(this.bed, STOP_FADE_TAU);
    this.bed = null;
  }

  setContext(context: string): void {
    if (context === this.currentContext || !this.running) return;
    this.currentContext = context;
    // Crossfade: the new bed swells in while the old one fades, with no gap between.
    if (this.bed) this.retire(this.bed, FADE_OUT_TAU);
    this.bed = this.buildBed(context);
  }

  private buildBed(context: string): Bed | null {
    const ctx = audioEngine.context;
    const layerGain = audioEngine.layerGain("ambient");
    if (!ctx || !layerGain) return null;
    const profile = PROFILES[context] ?? PROFILES.galaxy;
    const rng = createRNG(mixSeed(AMBIENT_SEED, Math.max(0, VIEW_ORDER.indexOf(context))));

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(layerGain);
    gain.gain.setTargetAtTime(profile.gain, ctx.currentTime, FADE_IN_TAU);

    const sources = new Set<AudioScheduledSourceNode>();
    const windBand = this.buildWind(ctx, gain, profile, sources);

    // Stagger the first swells a little so the voices do not enter together.
    const now = ctx.currentTime;
    const nextStart = Array.from({ length: profile.voices }, (_, i) => now + i * between(rng, [0.3, 1.2]));
    const started = nextStart.map(() => false);

    const bed: Bed = { profile, rng, gain, nextStart, started, windAt: now, windBand, sources };
    bed.timer = setInterval(() => this.schedule(bed), TICK_MS);
    this.schedule(bed);
    return bed;
  }

  /** Place every swell and wind move that falls inside the lookahead window. */
  private schedule(bed: Bed): void {
    const ctx = audioEngine.context;
    if (!ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;

    for (let slot = 0; slot < bed.nextStart.length; slot++) {
      while (bed.nextStart[slot] < horizon) {
        const start = Math.max(bed.nextStart[slot], ctx.currentTime);
        const length = between(bed.rng, bed.profile.swellSeconds);
        this.swell(ctx, bed, start, length, bed.started[slot] ? undefined : FIRST_RISE_S);
        bed.started[slot] = true;
        bed.nextStart[slot] = start + length + between(bed.rng, bed.profile.restSeconds);
      }
    }

    while (bed.windAt < horizon) {
      const target = between(bed.rng, bed.profile.windBand);
      bed.windBand.frequency.setTargetAtTime(target, bed.windAt, 2.5);
      bed.windAt += between(bed.rng, WIND_MOVE_S);
    }
  }

  /**
   * One voice: two slightly detuned saw waves through a lowpass that opens as
   * the voice rises and closes as it fades, so it brightens and darkens like a breath.
   */
  private swell(ctx: AudioContext, bed: Bed, start: number, length: number, quickRise?: number): void {
    const { profile, rng } = bed;
    const interval = profile.intervals[Math.floor(rng() * profile.intervals.length)];
    const freq = midiToHz(profile.rootMidi + interval);
    const slowRise = length * between(rng, [0.3, 0.45]);
    const rise = quickRise ?? slowRise;
    const fade = length * between(rng, [0.35, 0.5]);
    const peakAt = start + rise;
    const fadeAt = start + length - fade;
    const end = start + length;

    const pan = ctx.createStereoPanner();
    pan.pan.value = (rng() * 2 - 1) * MAX_PAN;
    pan.connect(bed.gain);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(VOICE_PEAK, peakAt);
    amp.gain.setValueAtTime(VOICE_PEAK, fadeAt);
    amp.gain.linearRampToValueAtTime(0, end);
    amp.connect(pan);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(freq, start);
    filter.frequency.exponentialRampToValueAtTime(freq * profile.brightness, peakAt);
    filter.frequency.setValueAtTime(freq * profile.brightness, fadeAt);
    filter.frequency.exponentialRampToValueAtTime(freq, end);
    filter.connect(amp);

    for (const cents of [-DETUNE_CENTS / 2, DETUNE_CENTS / 2]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      osc.connect(filter);
      this.track(bed, osc, start, end + 0.05, () => pan.disconnect());
    }
  }

  /** Looping pink noise through a wandering band. Returns the band filter. */
  private buildWind(
    ctx: AudioContext,
    output: GainNode,
    profile: AmbientProfile,
    sources: Set<AudioScheduledSourceNode>,
  ): BiquadFilterNode {
    const source = ctx.createBufferSource();
    source.buffer = this.pinkNoiseBuffer(ctx);
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.8;
    band.frequency.value = profile.windBand[0];

    const level = ctx.createGain();
    level.gain.value = WIND_LEVEL * profile.windGain;

    source.connect(band);
    band.connect(level);
    level.connect(output);
    source.start();
    sources.add(source);
    return band;
  }

  /** Start a source at `start`, stop it at `stop`, and forget it once it ends. */
  private track(bed: Bed, node: AudioScheduledSourceNode, start: number, stop: number, onEnd: () => void): void {
    node.start(start);
    node.stop(stop);
    bed.sources.add(node);
    node.onended = () => { bed.sources.delete(node); onEnd(); };
  }

  /** Fade a bed out, stop scheduling, and stop its sources once it is silent. */
  private retire(bed: Bed, fadeTau: number): void {
    clearInterval(bed.timer);
    const ctx = audioEngine.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(now);
    bed.gain.gain.setTargetAtTime(0, now, fadeTau);
    const stopAt = now + RETIRE_AFTER * fadeTau;
    // A later stop() replaces an earlier one; swells already silent by then cost nothing.
    for (const node of bed.sources) node.stop(stopAt);
    setTimeout(() => bed.gain.disconnect(), (stopAt - now) * 1000 + 100);
  }

  /** Pink noise (Kellet's filter on seeded white noise), 6 seconds, made once and shared. */
  private pinkNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.pinkNoise) return this.pinkNoise;
    const length = ctx.sampleRate * 6;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = createRNG(mixSeed(AMBIENT_SEED, 0xFFFF));
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = rng() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
    this.pinkNoise = buffer;
    return buffer;
  }
}

export const ambientLayer = new AmbientLayer();
