import type { UniverseConfig } from "./config";
import { CONFIG_LABELS } from "./config";
import type { LifeSurvey } from "./lifeSurvey";
import { SIMULATION_RULES_VERSION } from "./version";
import { funnelOf } from "./greatFilter";
import type { Funnel } from "./greatFilter";

// ── Universe snapshot (AF-123) ────────────────────────────────────────────────

export interface UniverseSnapshot {
  seed: number;
  config: UniverseConfig;
  starCount: number;
  lifeBearingPlanets: number;
  civilizationCount: number;
  legendaryEvents: number;
  totalPlanets: number;
  /** The Great Filter funnel (GF4). Kept in memory only: funnels are not stored (decision 4). */
  funnel: Funnel;
}

/** The counts that describe a universe, from its star count and life survey. */
export function buildSnapshot(seed: number, config: UniverseConfig, starCount: number, survey: LifeSurvey): UniverseSnapshot {
  return {
    seed,
    config,
    starCount,
    lifeBearingPlanets: survey.lifeBearingPlanets,
    civilizationCount: survey.civilizationCount,
    legendaryEvents: 0,   // the timeline is built only on request, so snapshots do not count it
    totalPlanets: survey.totalPlanets,
    funnel: funnelOf(survey.index),
  };
}

// ── Comparison result (AF-123) ────────────────────────────────────────────────

export interface ComparisonRow {
  label: string;
  baseline: number;
  experiment: number;
  delta: number;        // experiment - baseline
  unit: string;
}

/** How one gate of the Great Filter moved between two universes (GF4). */
export interface GateShift {
  label: string;
  baselinePassed: number;
  experimentPassed: number;
  /** Pass shares of the worlds that reached the gate; NaN where none did. */
  baselineShare: number;
  experimentShare: number;
}

export interface UniverseComparison {
  baseline: UniverseSnapshot;
  experiment: UniverseSnapshot;
  rows: ComparisonRow[];
  /** Every gate, in funnel order. */
  gates: GateShift[];
  /** The gates whose pass share moved most, largest first (at most MOVED_GATES_NAMED). */
  movedGates: GateShift[];
  summary: string;
  surprises: string[];
}

/** How many moved gates a comparison names, and the least move (in pass share) that counts. */
const MOVED_GATES_NAMED = 2;
const MIN_GATE_MOVE = 0.01;

function gateShifts(baseline: Funnel, experiment: Funnel): GateShift[] {
  return baseline.steps.map((step, g) => ({
    label: step.gate.label,
    baselinePassed: step.passed,
    experimentPassed: experiment.steps[g].passed,
    baselineShare: step.share,
    experimentShare: experiment.steps[g].share,
  }));
}

/** The gates whose pass share moved by at least MIN_GATE_MOVE, largest move first. */
function movedGatesOf(gates: GateShift[]): GateShift[] {
  const move = (g: GateShift) => Math.abs(g.experimentShare - g.baselineShare);
  return gates
    .filter((g) => !Number.isNaN(g.baselineShare) && !Number.isNaN(g.experimentShare) && move(g) >= MIN_GATE_MOVE)
    .sort((a, b) => move(b) - move(a))
    .slice(0, MOVED_GATES_NAMED);
}

/** "The gate “A mind” passed 6% of the worlds that reached it, against 32%." */
function gateSentence(g: GateShift): string {
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  return `The gate “${g.label}” passed ${pct(g.experimentShare)} of the worlds that reached it, against ${pct(g.baselineShare)}.`;
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

  const gates = gateShifts(baseline.funnel, experiment.funnel);
  const movedGates = movedGatesOf(gates);
  // The saved experiment keeps this text, so it names the gates that moved
  const summary = [buildComparativeSummary(baseline, experiment, rows), ...movedGates.map(gateSentence)].join(" ");
  const surprises = detectSurprises(baseline, experiment);

  return { baseline, experiment, rows, gates, movedGates, summary, surprises };
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
  rulesVersion: number;   // rules that produced both universes; experiments are never recounted
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
    rulesVersion: SIMULATION_RULES_VERSION,
  };
}
