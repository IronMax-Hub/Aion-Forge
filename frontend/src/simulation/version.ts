// Simulation rules version.
//
// Why it exists: a saved universe stores only its seed and parameters, plus the
// counts (life-bearing planets, civilizations, ...) measured when it was saved.
// When the rules change, the same seed produces a different universe, and those
// stored counts no longer describe it. Every saved record carries the version of
// the rules that produced its numbers, so the Library can say so openly and offer
// a recount instead of silently showing numbers the current rules do not produce.
//
// When it changes: once for each build step of the Worlds Up Close plan that
// changes outcomes (see Worlds-Up-Close-Revision-1.md, R10). Presentation-only
// changes never bump it.
//
// Limits: it records which rules made a record, not what those rules were. An
// older version cannot be re-run; a recount always uses the current rules.

export const SIMULATION_RULES_VERSION = 1;

/** Whether a record's numbers were produced by rules older than the current ones. */
export function countedUnderOlderRules(rulesVersion: number): boolean {
  return rulesVersion < SIMULATION_RULES_VERSION;
}
