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
// stability limits; v16: minds must eat other life, and a mind's species keeps
// only its consumer descendants — owner decision after plant minds were found;
// v17: a consumer gains from thinking as far as it sees, water life breathes
// dissolved oxygen, and only a mind on land has fire; v18: step 7, rogue planets, from
// RP1's unstable neighbours; v19: the October 2026 audit's corrections, as one
// batch (Documents/Fixing-Plan-2026-11.md, Phase 3): the runaway greenhouse,
// bounded steam worlds and sub-steps across freezing over (A1); the Kroupa IMF,
// a constant star-formation history, bounded giants and cooling white dwarfs
// (A2); pair and remnant masses, sub-Neptunes, orbits scaled with the star and
// hot Jupiters (A3)). Presentation-only changes never bump it.
//
// Limits: it records which rules made a record, not what those rules were. An
// older version cannot be re-run; a recount always uses the current rules.

export const SIMULATION_RULES_VERSION = 19;

/** Whether a record's numbers were produced by rules older than the current ones. */
export function countedUnderOlderRules(rulesVersion: number): boolean {
  return rulesVersion < SIMULATION_RULES_VERSION;
}
