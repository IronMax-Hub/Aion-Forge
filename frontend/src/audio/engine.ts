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

export type AudioLayer = "ambient" | "discovery" | "interface" | "civilization";

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
  interfaceVolume: 0.3,
  muted:           false,
};

const PREFS_KEY = "aion-forge-audio-prefs";

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
    this.applyPrefs();

    for (const layer of ["ambient", "discovery", "interface", "civilization"] as AudioLayer[]) {
      const g = this.ctx.createGain();
      g.connect(this.masterGain);
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
      civilization: ambientVolume * 0.6,
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
