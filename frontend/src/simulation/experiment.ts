import type { UniverseConfig } from "./config";
import { CONFIG_LABELS } from "./config";

// ── Universe snapshot (AF-123) ────────────────────────────────────────────────

export interface UniverseSnapshot {
  seed: number;
  config: UniverseConfig;
  starCount: number;
  lifeBearingPlanets: number;
  civilizationCount: number;
  legendaryEvents: number;
  totalPlanets: number;
}

// ── Comparison result (AF-123) ────────────────────────────────────────────────

export interface ComparisonRow {
  label: string;
  baseline: number;
  experiment: number;
  delta: number;        // experiment - baseline
  unit: string;
}

export interface UniverseComparison {
  baseline: UniverseSnapshot;
  experiment: UniverseSnapshot;
  rows: ComparisonRow[];
  summary: string;
  surprises: string[];
}

export function compareUniverses(
  baseline: UniverseSnapshot,
  experiment: UniverseSnapshot
): UniverseComparison {
  const rows: ComparisonRow[] = [
    {
      label: "Stars",
      baseline: baseline.starCount,
      experiment: experiment.starCount,
      delta: experiment.starCount - baseline.starCount,
      unit: "",
    },
    {
      label: "Total Planets",
      baseline: baseline.totalPlanets,
      experiment: experiment.totalPlanets,
      delta: experiment.totalPlanets - baseline.totalPlanets,
      unit: "",
    },
    {
      label: "Life-Bearing Worlds",
      baseline: baseline.lifeBearingPlanets,
      experiment: experiment.lifeBearingPlanets,
      delta: experiment.lifeBearingPlanets - baseline.lifeBearingPlanets,
      unit: "",
    },
    {
      label: "Civilizations",
      baseline: baseline.civilizationCount,
      experiment: experiment.civilizationCount,
      delta: experiment.civilizationCount - baseline.civilizationCount,
      unit: "",
    },
    {
      label: "Legendary Events",
      baseline: baseline.legendaryEvents,
      experiment: experiment.legendaryEvents,
      delta: experiment.legendaryEvents - baseline.legendaryEvents,
      unit: "",
    },
  ];

  const summary = buildComparativeSummary(baseline, experiment, rows);
  const surprises = detectSurprises(baseline, experiment);

  return { baseline, experiment, rows, summary, surprises };
}

// ── AF-124: Comparative prose summary ────────────────────────────────────────

function buildComparativeSummary(
  baseline: UniverseSnapshot,
  experiment: UniverseSnapshot,
  rows: ComparisonRow[]
): string {
  const changes = changedKeys(baseline.config, experiment.config);
  const parts: string[] = [];

  if (changes.length > 0) {
    const changeDesc = changes
      .map((k) => {
        const bVal = baseline.config[k] as number;
        const eVal = experiment.config[k] as number;
        const dir = eVal > bVal ? "higher" : "lower";
        return `${CONFIG_LABELS[k].toLowerCase()} was ${dir}`;
      })
      .join(", ");
    parts.push(`When ${changeDesc}:`);
  }

  const lifeDelta = rows.find((r) => r.label === "Life-Bearing Worlds")!.delta;
  const civDelta  = rows.find((r) => r.label === "Civilizations")!.delta;

  if (lifeDelta > 0)
    parts.push(`${lifeDelta} more world${lifeDelta !== 1 ? "s" : ""} harbored life.`);
  else if (lifeDelta < 0)
    parts.push(`${Math.abs(lifeDelta)} fewer world${Math.abs(lifeDelta) !== 1 ? "s" : ""} harbored life.`);
  else
    parts.push("Life-bearing planets were unchanged.");

  if (civDelta > 0)
    parts.push(`${civDelta} additional civilization${civDelta !== 1 ? "s" : ""} emerged.`);
  else if (civDelta < 0)
    parts.push(`${Math.abs(civDelta)} fewer civilization${Math.abs(civDelta) !== 1 ? "s" : ""} arose.`);

  const starDelta = rows.find((r) => r.label === "Stars")!.delta;
  if (Math.abs(starDelta) > 100)
    parts.push(
      starDelta > 0
        ? "Stellar density increased significantly."
        : "Far fewer stars formed in this reality."
    );

  return parts.join(" ") || "No significant differences detected.";
}

// ── AF-127: Unexpected outcomes registry ─────────────────────────────────────

function detectSurprises(
  baseline: UniverseSnapshot,
  experiment: UniverseSnapshot
): string[] {
  const surprises: string[] = [];

  // Life thriving in harsh conditions
  if (
    experiment.config.emergenceSensitivity < 0.3 &&
    experiment.lifeBearingPlanets > baseline.lifeBearingPlanets
  ) {
    surprises.push("Life emerged more abundantly despite drastically reduced emergence sensitivity.");
  }

  // Civilizations surviving high entropy
  if (
    experiment.config.entropyRate > 1.5 &&
    experiment.civilizationCount > 0
  ) {
    surprises.push("Civilizations arose even as stars burned out rapidly around them.");
  }

  // Intelligence appearing in low-intelligence modifier universe
  if (
    experiment.config.intelligenceModifier < 0.2 &&
    experiment.civilizationCount > 0
  ) {
    surprises.push("Against extraordinary odds, intelligence emerged in a universe that barely permitted it.");
  }

  // Sparse universe producing rich history
  if (
    experiment.legendaryEvents > baseline.legendaryEvents * 1.5 &&
    experiment.starCount < baseline.starCount * 0.6
  ) {
    surprises.push("A sparse universe produced a richer history than its dense counterpart.");
  }

  // No life at all
  if (experiment.lifeBearingPlanets === 0 && baseline.lifeBearingPlanets > 0) {
    surprises.push("Life failed to appear anywhere. The universe remained silent.");
  }

  return surprises;
}

function changedKeys(a: UniverseConfig, b: UniverseConfig): (keyof Omit<UniverseConfig, "seed">)[] {
  const keys: (keyof Omit<UniverseConfig, "seed">)[] = [
    "gravityStrength", "expansionRate", "stellarIgnitionThreshold",
    "entropyRate", "emergenceSensitivity", "intelligenceModifier",
  ];
  return keys.filter((k) => Math.abs((a[k] as number) - (b[k] as number)) > 0.005);
}

// ── Experiment history (AF-126) ───────────────────────────────────────────────

export interface ExperimentRecord {
  id: string;
  timestamp: number;
  baselineSeed: number;
  experimentSeed: number;
  modifiedConstants: string[];
  comparisonSummary: string;
  surprises: string[];
  note: string;
}

const STORAGE_KEY = "aion-forge-experiments";

export function saveExperiment(record: ExperimentRecord): void {
  const existing = loadExperiments();
  existing.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 20)));
}

export function loadExperiments(): ExperimentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ExperimentRecord[]) : [];
  } catch {
    return [];
  }
}

export function makeExperimentRecord(
  cmp: UniverseComparison,
  note = ""
): ExperimentRecord {
  const modifiedConstants = changedKeys(cmp.baseline.config, cmp.experiment.config).map(
    (k) => CONFIG_LABELS[k]
  );
  return {
    id: `EXP-${Date.now().toString(36).toUpperCase()}`,
    timestamp: Date.now(),
    baselineSeed: cmp.baseline.seed,
    experimentSeed: cmp.experiment.seed,
    modifiedConstants,
    comparisonSummary: cmp.summary,
    surprises: cmp.surprises,
    note,
  };
}
