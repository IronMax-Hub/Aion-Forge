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

class AmbientLayer {
  private voices:    AmbientVoice[] = [];
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private currentContext = "galaxy";
  private running = false;

  start(): void {
    if (this.running || !audioEngine.isReady) return;
    this.running = true;
    const ctx = audioEngine.context!;
    const layerGain = audioEngine.layerGain("ambient");
    if (!layerGain) return;

    // Route everything through a layer-level gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(layerGain);

    this.applyProfile(PROFILES[this.currentContext], false);

    // Fade in gently
    this.masterGain.gain.setTargetAtTime(1, ctx.currentTime, 2.0);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.masterGain && audioEngine.context) {
      const now = audioEngine.context.currentTime;
      this.masterGain.gain.setTargetAtTime(0, now, 1.5);
      setTimeout(() => this.teardown(), 5000);
    }
  }

  setContext(context: string): void {
    if (context === this.currentContext || !this.running) return;
    this.currentContext = context;
    const profile = PROFILES[context] ?? PROFILES.galaxy;
    this.crossfadeTo(profile);
  }

  private applyProfile(profile: AmbientProfile, fade: boolean): void {
    const ctx = audioEngine.context;
    if (!ctx || !this.masterGain) return;

    // Set master gain for this profile
    const now = ctx.currentTime;
    if (fade) {
      this.masterGain.gain.setTargetAtTime(profile.gain, now, 1.5);
    } else {
      this.masterGain.gain.value = profile.gain;
    }

    // Build drone oscillators
    this.clearVoices();
    for (const freq of profile.drones) {
      const voice = this.buildDrone(ctx, freq, profile.lfoRate, profile.lfoDepth);
      if (voice) this.voices.push(voice);
    }

    // Build filtered noise
    this.buildNoise(ctx, profile.noiseCutoff, profile.noiseGain);
  }

  private crossfadeTo(profile: AmbientProfile): void {
    const ctx = audioEngine.context;
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    // Fade out current
    this.masterGain.gain.setTargetAtTime(0, now, 0.8);

    setTimeout(() => {
      this.clearVoices();
      this.clearNoise();
      this.applyProfile(profile, true);
    }, 1200);
  }

  private buildDrone(
    ctx: AudioContext,
    baseFreq: number,
    lfoRate: number,
    lfoDepth: number,
  ): AmbientVoice | null {
    if (!this.masterGain) return null;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.06 + Math.random() * 0.03;
    gainNode.connect(this.masterGain);

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

  private buildNoise(ctx: AudioContext, cutoff: number, gain: number): void {
    if (!this.masterGain) return;
    this.clearNoise();

    // Generate white noise buffer (4 seconds, looped)
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.5;

    const noiseGainNode = ctx.createGain();
    noiseGainNode.gain.value = gain;

    source.connect(filter);
    filter.connect(noiseGainNode);
    noiseGainNode.connect(this.masterGain);
    source.start();

    this.noiseNode   = source;
    this.noiseGain   = noiseGainNode;
    this.noiseFilter = filter;
  }

  private clearVoices(): void {
    for (const v of this.voices) {
      try { v.osc.stop(); v.gainNode.disconnect(); } catch { /* already stopped */ }
      if (v.lfo) { try { v.lfo.stop(); } catch { /* ignore */ } }
    }
    this.voices = [];
  }

  private clearNoise(): void {
    try { this.noiseNode?.stop(); this.noiseGain?.disconnect(); } catch { /* ignore */ }
    this.noiseNode = null;
    this.noiseGain = null;
    this.noiseFilter = null;
  }

  private teardown(): void {
    this.clearVoices();
    this.clearNoise();
    try { this.masterGain?.disconnect(); } catch { /* ignore */ }
    this.masterGain = null;
  }
}

export const ambientLayer = new AmbientLayer();
