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
// changes outcomes (see Worlds-Up-Close-Revision-1.md, R10), and of the Galaxy
// Through Time plan (v11: step 3, atmospheric escape, from AE1's activity
// curve on; v12: step 4, metallicity, from MZ3's planet masses; v13: step 5a,
// heat from inside, from IH1's outgassing; v14: step 5, moons, from MO4's moon worlds; v15: step 6, binary stars, from BS2's
// stability limits). Presentation-only changes never bump it.
//
// Limits: it records which rules made a record, not what those rules were. An
// older version cannot be re-run; a recount always uses the current rules.

export const SIMULATION_RULES_VERSION = 15;

/** Whether a record's numbers were produced by rules older than the current ones. */
export function countedUnderOlderRules(rulesVersion: number): boolean {
  return rulesVersion < SIMULATION_RULES_VERSION;
}
