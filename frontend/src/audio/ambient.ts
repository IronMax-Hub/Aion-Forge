/**
 * Ambient layer — the auditory foundation of Aion Forge.
 *
 * Sounds are entirely procedural: filtered noise for texture,
 * low sine oscillators for cosmic presence, slow LFOs for movement.
 * Nothing here should demand attention.
 */

import { audioEngine } from "./engine";

interface AmbientVoice {
  osc:         OscillatorNode;
  gainNode:    GainNode;
  lfo?:        OscillatorNode;
  lfoGain?:    GainNode;
}

interface AmbientProfile {
  /** Base drone frequencies (Hz) */
  drones:      number[];
  /** Noise filter cutoff (Hz) — shapes the texture */
  noiseCutoff: number;
  /** Noise gain (0–1) */
  noiseGain:   number;
  /** LFO rate (Hz) for slow movement */
  lfoRate:     number;
  /** LFO depth (semitone fraction of base freq) */
  lfoDepth:    number;
  /** Overall layer gain multiplier */
  gain:        number;
}

// Each view context has a distinct atmospheric character
const PROFILES: Record<string, AmbientProfile> = {
  galaxy: {
    drones:      [32, 48, 64],
    noiseCutoff: 180,
    noiseGain:   0.018,
    lfoRate:     0.04,
    lfoDepth:    0.4,
    gain:        0.55,
  },
  system: {
    drones:      [48, 72, 96],
    noiseCutoff: 280,
    noiseGain:   0.012,
    lfoRate:     0.06,
    lfoDepth:    0.3,
    gain:        0.45,
  },
  planet: {
    drones:      [60, 80, 120],
    noiseCutoff: 400,
    noiseGain:   0.010,
    lfoRate:     0.08,
    lfoDepth:    0.25,
    gain:        0.40,
  },
  biosphere: {
    drones:      [55, 82.5, 110],
    noiseCutoff: 600,
    noiseGain:   0.014,
    lfoRate:     0.12,
    lfoDepth:    0.2,
    gain:        0.42,
  },
  civilization: {
    drones:      [64, 96, 128],
    noiseCutoff: 500,
    noiseGain:   0.010,
    lfoRate:     0.10,
    lfoDepth:    0.18,
    gain:        0.38,
  },
  timeline: {
    drones:      [40, 60, 80],
    noiseCutoff: 220,
    noiseGain:   0.016,
    lfoRate:     0.03,
    lfoDepth:    0.5,
    gain:        0.50,
  },
  laboratory: {
    drones:      [55, 110, 165],
    noiseCutoff: 350,
    noiseGain:   0.009,
    lfoRate:     0.07,
    lfoDepth:    0.22,
    gain:        0.35,
  },
};

/** One view's sound: drones and noise sharing a gain, built and retired together. */
interface Bed {
  gain:    GainNode;
  voices:  AmbientVoice[];
  noise:   AudioBufferSourceNode | null;
}

const FADE_IN_TAU   = 1.5;  // seconds (time constant) for a new bed to swell in
const FADE_OUT_TAU  = 1.0;  // seconds (time constant) for an old bed to fade away
const RETIRE_AFTER  = 6;    // seconds until a fading bed's sources stop (≈ 6 τ: silent)
const STOP_FADE_TAU = 1.5;  // seconds (time constant) when sound is turned off

class AmbientLayer {
  private bed:          Bed | null = null;
  private noiseBuffer:  AudioBuffer | null = null;
  private currentContext = "galaxy";
  private running = false;

  start(): void {
    if (this.running || !audioEngine.isReady) return;
    this.running = true;
    this.bed = this.buildBed(PROFILES[this.currentContext]);
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
    this.bed = this.buildBed(PROFILES[context] ?? PROFILES.galaxy);
  }

  private buildBed(profile: AmbientProfile): Bed | null {
    const ctx = audioEngine.context;
    const layerGain = audioEngine.layerGain("ambient");
    if (!ctx || !layerGain) return null;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(layerGain);
    gain.gain.setTargetAtTime(profile.gain, ctx.currentTime, FADE_IN_TAU);

    const voices = profile.drones.map((freq) =>
      this.buildDrone(ctx, gain, freq, profile.lfoRate, profile.lfoDepth));
    const noise = this.buildNoise(ctx, gain, profile.noiseCutoff, profile.noiseGain);
    return { gain, voices, noise };
  }

  /** Fade a bed out and stop its sources once it is silent. */
  private retire(bed: Bed, fadeTau: number): void {
    const ctx = audioEngine.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(now);
    bed.gain.gain.setTargetAtTime(0, now, fadeTau);
    const stopAt = now + RETIRE_AFTER * fadeTau;
    for (const v of bed.voices) {
      v.osc.stop(stopAt);
      v.lfo?.stop(stopAt);
    }
    bed.noise?.stop(stopAt);
    const last = bed.noise ?? bed.voices[0]?.osc;
    if (last) last.onended = () => bed.gain.disconnect();
  }

  private buildDrone(
    ctx: AudioContext,
    output: GainNode,
    baseFreq: number,
    lfoRate: number,
    lfoDepth: number,
  ): AmbientVoice {
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.06 + Math.random() * 0.03;
    gainNode.connect(output);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = baseFreq;
    osc.connect(gainNode);

    // LFO for slow frequency drift
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = lfoRate + (Math.random() - 0.5) * lfoRate * 0.3;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = baseFreq * lfoDepth * 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.start();
    lfo.start();

    return { osc, gainNode, lfo, lfoGain };
  }

  private buildNoise(
    ctx: AudioContext,
    output: GainNode,
    cutoff: number,
    gain: number,
  ): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.whiteNoise(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.5;

    const noiseGainNode = ctx.createGain();
    noiseGainNode.gain.value = gain;

    source.connect(filter);
    filter.connect(noiseGainNode);
    noiseGainNode.connect(output);
    source.start();
    return source;
  }

  /** White noise, 4 seconds, made once and looped by every bed. */
  private whiteNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }
}

export const ambientLayer = new AmbientLayer();
