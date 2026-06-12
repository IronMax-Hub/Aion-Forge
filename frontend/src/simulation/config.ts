// ── Universe Configuration Data Model (AF-112) ───────────────────────────────
// All values are multipliers: 1.0 = default reality, 0 = minimum, 2 = maximum.

export interface UniverseConfig {
  seed: number;

  // Influences galaxy shape density and stellar mass distribution
  gravityStrength: number;

  // Influences galaxy scale and particle spread
  expansionRate: number;

  // Influences the mass threshold required for star ignition (lower = more stars)
  stellarIgnitionThreshold: number;

  // Influences star lifespan (lower = stars die faster)
  entropyRate: number;

  // Influences life emergence probability and biosphere growth rate
  emergenceSensitivity: number;

  // Influences the probability of intelligence emerging from complex biospheres
  intelligenceModifier: number;
}

// ── Default (familiar) reality ────────────────────────────────────────────────

export const DEFAULT_CONFIG: Omit<UniverseConfig, "seed"> = {
  gravityStrength:          1.0,
  expansionRate:            1.0,
  stellarIgnitionThreshold: 1.0,
  entropyRate:              1.0,
  emergenceSensitivity:     1.0,
  intelligenceModifier:     1.0,
};

export function makeConfig(seed: number, overrides: Partial<Omit<UniverseConfig, "seed">> = {}): UniverseConfig {
  return { seed, ...DEFAULT_CONFIG, ...overrides };
}

// ── Presets (AF-122) ──────────────────────────────────────────────────────────

export interface Preset {
  name: string;
  description: string;
  values: Omit<UniverseConfig, "seed">;
}

export const PRESETS: Preset[] = [
  {
    name: "Familiar Reality",
    description: "Default laws. The universe as we know it.",
    values: { ...DEFAULT_CONFIG },
  },
  {
    name: "Slow Cosmos",
    description: "Weak gravity, low expansion, stars live forever.",
    values: {
      gravityStrength:          0.4,
      expansionRate:            0.3,
      stellarIgnitionThreshold: 1.2,
      entropyRate:              0.2,
      emergenceSensitivity:     1.0,
      intelligenceModifier:     1.0,
    },
  },
  {
    name: "Fragile Life",
    description: "Life barely takes hold. Rare and precious.",
    values: {
      gravityStrength:          1.0,
      expansionRate:            1.0,
      stellarIgnitionThreshold: 1.0,
      entropyRate:              1.4,
      emergenceSensitivity:     0.15,
      intelligenceModifier:     0.3,
    },
  },
  {
    name: "Eternal Stars",
    description: "Stars burn on and on. Time stretches without limit.",
    values: {
      gravityStrength:          1.2,
      expansionRate:            0.8,
      stellarIgnitionThreshold: 0.7,
      entropyRate:              0.1,
      emergenceSensitivity:     1.0,
      intelligenceModifier:     1.0,
    },
  },
  {
    name: "Rare Intelligence",
    description: "Life is common. Minds are almost impossible.",
    values: {
      gravityStrength:          1.0,
      expansionRate:            1.0,
      stellarIgnitionThreshold: 1.0,
      entropyRate:              1.0,
      emergenceSensitivity:     1.4,
      intelligenceModifier:     0.05,
    },
  },
  {
    name: "Abundant Life",
    description: "Life erupts everywhere. The cosmos teems.",
    values: {
      gravityStrength:          1.0,
      expansionRate:            1.0,
      stellarIgnitionThreshold: 0.8,
      entropyRate:              0.9,
      emergenceSensitivity:     2.0,
      intelligenceModifier:     1.5,
    },
  },
];

// ── Validation (AF-121) ───────────────────────────────────────────────────────

export interface ConfigWarning {
  field: keyof Omit<UniverseConfig, "seed">;
  message: string;
}

export function validateConfig(cfg: UniverseConfig): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  if (cfg.gravityStrength < 0.1)
    warnings.push({ field: "gravityStrength", message: "Gravity too weak — galaxy formation may fail." });

  if (cfg.expansionRate > 1.8)
    warnings.push({ field: "expansionRate", message: "Extreme expansion may scatter matter before stars form." });

  if (cfg.stellarIgnitionThreshold > 1.8 && cfg.gravityStrength < 0.5)
    warnings.push({ field: "stellarIgnitionThreshold", message: "High ignition threshold + weak gravity: almost no stars possible." });

  if (cfg.entropyRate > 1.8)
    warnings.push({ field: "entropyRate", message: "Stars burn out quickly — little time for life to emerge." });

  if (cfg.emergenceSensitivity < 0.05)
    warnings.push({ field: "emergenceSensitivity", message: "Life emergence nearly impossible in this universe." });

  if (cfg.intelligenceModifier > 1.9 && cfg.emergenceSensitivity > 1.8)
    warnings.push({ field: "intelligenceModifier", message: "Exceptionally high emergence — universe may be saturated with civilizations." });

  return warnings;
}

// ── Config label helpers ──────────────────────────────────────────────────────

export const CONFIG_LABELS: Record<keyof Omit<UniverseConfig, "seed">, string> = {
  gravityStrength:          "Gravity",
  expansionRate:            "Expansion Rate",
  stellarIgnitionThreshold: "Stellar Ignition",
  entropyRate:              "Entropy Rate",
  emergenceSensitivity:     "Life Sensitivity",
  intelligenceModifier:     "Intelligence",
};

export const CONFIG_DESCRIPTIONS: Record<keyof Omit<UniverseConfig, "seed">, string> = {
  gravityStrength:          "Strength of gravitational attraction",
  expansionRate:            "Rate of cosmic expansion",
  stellarIgnitionThreshold: "Mass required for star ignition",
  entropyRate:              "Rate of stellar decay",
  emergenceSensitivity:     "Probability of life emerging",
  intelligenceModifier:     "Likelihood of intelligence arising",
};
