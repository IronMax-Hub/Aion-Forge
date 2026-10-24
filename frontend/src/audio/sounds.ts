/**
 * Synthesized sound events for Aion Forge.
 *
 * Every sound here is procedural — no assets, no files.
 * Principle: meaningful without fanfare, tactile without decoration.
 */

import { audioEngine } from "./engine";

// ── Shared synthesis helper ───────────────────────────────────────────────────
//
// Notes are placed on the audio clock (`delay` seconds from now), not with
// timers, so chords and runs land exactly where they are written.

type Layer = Parameters<typeof audioEngine.createOscillator>[0];

interface ToneShape {
  type?:    OscillatorType;
  attack?:  number;   // seconds to reach full gain
  release?: number;   // seconds of fade at the end (default half the duration)
  delay?:   number;   // seconds from now
}

function tone(
  freq:     number,
  gainVal:  number,
  duration: number,
  layer:    Layer,
  { type = "sine", attack = 0.02, release = duration * 0.5, delay = 0 }: ToneShape = {},
): void {
  const ctx = audioEngine.context;
  if (!ctx) return;
  const result = audioEngine.createOscillator(layer, type, freq, 0);
  if (!result) return;

  const { osc, gain } = result;
  const start = ctx.currentTime + delay;

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainVal, start + attack);
  gain.gain.setTargetAtTime(0, start + duration - release, release / 3);

  osc.start(start);
  osc.stop(start + duration + 0.1);
  osc.onended = () => gain.disconnect();
}

function chord(
  freqs:    number[],
  gainVal:  number,
  duration: number,
  layer:    Layer,
  stagger   = 0.06,
  delay     = 0,
): void {
  freqs.forEach((f, i) => tone(f, gainVal, duration, layer, { delay: delay + i * stagger }));
}

// ── Discovery sounds — ENH-104 ────────────────────────────────────────────────

export const discovery = {
  rareStar(): void {
    // A quiet ascending fifth — rare but not spectacular
    chord([220, 330, 440], 0.06, 2.8, "discovery");
  },

  firstLife(): void {
    // Something stirs — a soft, wondering tone cluster
    chord([196, 261.63, 329.63], 0.07, 3.5, "discovery", 0.12);
    tone(523.25, 0.04, 2.0, "discovery", { delay: 0.6 });
  },

  ancientBiosphere(): void {
    // Deep, resonant — life has endured
    tone(65.4, 0.08, 4.0, "discovery");
    tone(130.8, 0.05, 3.0, "discovery", { delay: 0.8 });
  },

  civilizationMilestone(): void {
    // A single clear tone, then harmonic — intelligence observed
    tone(440, 0.05, 1.5, "discovery");
    tone(660, 0.04, 1.8, "discovery", { delay: 0.4 });
  },

  historicRecovery(): void {
    // Collapse survived — rising minor resolution
    tone(293.66, 0.06, 2.0, "discovery");
    tone(369.99, 0.05, 2.2, "discovery", { delay: 0.3 });
    tone(440, 0.06, 2.5, "discovery", { delay: 0.7 });
  },

  extraordinaryExperiment(): void {
    // Something unexpected — a soft dissonance that resolves
    chord([440, 466.16], 0.05, 1.5, "discovery");
    chord([440, 523.25], 0.05, 2.0, "discovery", 0.06, 0.8);
  },

  remarkableCivilization(): void {
    // Four-note chord, unhurried — this is worth noting
    chord([261.63, 329.63, 392, 523.25], 0.05, 3.5, "discovery", 0.15);
  },
};

// ── Interface sounds — ENH-105 ────────────────────────────────────────────────

export const ui = {
  click(): void {
    tone(880, 0.025, 0.12, "interface", { attack: 0.005, release: 0.08 });
  },

  panelOpen(): void {
    tone(660, 0.03, 0.25, "interface", { attack: 0.01, release: 0.15 });
    tone(880, 0.02, 0.2, "interface", { delay: 0.08 });
  },

  panelClose(): void {
    tone(880, 0.025, 0.15, "interface", { attack: 0.005, release: 0.12 });
    tone(660, 0.015, 0.2, "interface", { delay: 0.06 });
  },

  inspect(): void {
    tone(523.25, 0.025, 0.2, "interface", { attack: 0.008, release: 0.14 });
  },

  universeLoad(): void {
    // A gentle descent — reality taking shape
    tone(440, 0.04, 0.8, "interface");
    tone(330, 0.035, 0.8, "interface", { delay: 0.2 });
    tone(261.63, 0.04, 1.2, "interface", { delay: 0.5 });
  },

  save(): void {
    tone(523.25, 0.03, 0.3, "interface", { attack: 0.01, release: 0.2 });
    tone(659.25, 0.025, 0.4, "interface", { delay: 0.15 });
  },

  restore(): void {
    tone(392, 0.03, 0.4, "interface", { attack: 0.01, release: 0.25 });
    tone(523.25, 0.03, 0.5, "interface", { delay: 0.2 });
  },

  back(): void {
    tone(523.25, 0.02, 0.15, "interface", { attack: 0.005, release: 0.1 });
    tone(440, 0.018, 0.15, "interface", { delay: 0.06 });
  },

  baseline(): void {
    tone(349.23, 0.03, 0.5, "interface");
    tone(440, 0.025, 0.5, "interface", { delay: 0.18 });
  },
};

// ── Reality Laboratory sounds — ENH-106 ──────────────────────────────────────

export const lab = {
  sliderMove(normalizedValue: number): void {
    // Pitch reflects where the slider is — subtle mapping of value to sound
    const freq = 220 + normalizedValue * 440;
    tone(freq, 0.018, 0.08, "interface", { attack: 0.003, release: 0.06 });
  },

  presetApply(): void {
    chord([261.63, 329.63, 392], 0.04, 0.8, "interface", 0.08);
  },

  compareBegin(): void {
    tone(220, 0.035, 1.0, "interface");
    tone(277.18, 0.03, 0.8, "interface", { delay: 0.3 });
  },

  compareReveal(): void {
    // Two tones, close together — representing two realities
    chord([440, 466.16], 0.04, 1.5, "discovery");
  },
};

// ── Timeline sounds — ENH-107 ────────────────────────────────────────────────

export const timeline = {
  eventOpen(importance: string): void {
    const freqMap: Record<string, number> = {
      minor:       440,
      significant: 494,
      major:       523.25,
      historic:    587.33,
      legendary:   659.25,
    };
    const gainMap: Record<string, number> = {
      minor: 0.018, significant: 0.022, major: 0.028, historic: 0.035, legendary: 0.045,
    };
    const freq = freqMap[importance] ?? 440;
    const g    = gainMap[importance] ?? 0.02;
    tone(freq, g, 0.4 + (gainMap[importance] ?? 0.02) * 10, "interface");
  },

  legendaryMoment(): void {
    // Rare and resonant — not celebratory, contemplative
    chord([220, 277.18, 329.63, 415.3], 0.05, 3.0, "discovery", 0.2);
  },

  replayTick(): void {
    tone(659.25, 0.012, 0.08, "interface", { attack: 0.003, release: 0.06 });
  },

  replayStart(): void {
    tone(261.63, 0.03, 0.6, "interface");
    tone(329.63, 0.025, 0.5, "interface", { delay: 0.2 });
  },
};

// ── Civilization presence layer — ENH-108 ────────────────────────────────────
// Abstract motifs that evolve with tech stage. Culturally neutral.

const CIV_VOICES: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map();

export const civLayer = {
  activate(techStage: string): void {
    this.deactivate();
    const ctx = audioEngine.context;
    if (!ctx) return;

    // Each stage gets a distinct harmonic texture, rising in complexity
    const stageConfig: Record<string, { freqs: number[]; gain: number }> = {
      primitive:    { freqs: [110],             gain: 0.030 },
      agricultural: { freqs: [110, 165],         gain: 0.028 },
      industrial:   { freqs: [110, 165, 220],    gain: 0.025 },
      information:  { freqs: [220, 330, 440],    gain: 0.022 },
      "space-age":  { freqs: [220, 330, 440, 660], gain: 0.020 },
      collapsed:    { freqs: [98],               gain: 0.018 },
    };

    const cfg = stageConfig[techStage] ?? stageConfig.primitive;

    for (const freq of cfg.freqs) {
      const result = audioEngine.createOscillator("civilization", "sine", freq, 0);
      if (!result) continue;
      const { osc, gain } = result;
      const now = ctx.currentTime;
      gain.gain.setTargetAtTime(cfg.gain / cfg.freqs.length, now, 1.5);
      osc.start();
      CIV_VOICES.set(`${freq}`, { osc, gain });
    }
  },

  deactivate(): void {
    const ctx = audioEngine.context;
    if (!ctx) return;
    for (const { osc, gain } of CIV_VOICES.values()) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      osc.onended = () => gain.disconnect();
      osc.stop(ctx.currentTime + 4);
    }
    CIV_VOICES.clear();
  },
};
