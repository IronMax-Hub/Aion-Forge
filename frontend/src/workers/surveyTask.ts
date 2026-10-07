// The life survey as a task that can run off the main thread, in pieces.
//
// Why: surveying a universe runs every solid planet's world history and the
// evolution of its life: over a minute on one core. Run on the main thread,
// that would freeze the interface; run on one worker, it leaves the other
// cores idle.
//
// How: every star's planets are independent of every other star's, so the
// stars are cut into chunks of STARS_PER_CHUNK in star order. A worker
// receives a seed, parameters and one chunk's star range, regenerates the stars
// with the same pure simulation modules the main thread uses (once per
// universe, then kept), surveys its chunk and posts the partial survey back,
// moving its index's buffers rather than copying them.
// The pool (surveyPool.ts) merges the chunks in star order, which gives
// exactly the survey of the whole universe in one pass.
//
// Every message carries the generation number of the request it answers, so
// the main thread can ignore answers about a universe it has already left.

import type { UniverseConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { surveyLife } from "../simulation/lifeSurvey";
import type { LifeSurvey } from "../simulation/lifeSurvey";
import { indexBuffers, mergeIndices } from "../simulation/universeIndex";

/** Stars per chunk: small enough to share the work evenly among workers and to report progress often. */
export const STARS_PER_CHUNK = 50;

/** A request for a whole universe's survey, as the client sends it. */
export interface SurveyRequest {
  generation: number;
  seed: number;
  config: UniverseConfig;
}

export type SurveyMessage =
  | { kind: "progress"; generation: number; fraction: number }
  | { kind: "result"; generation: number; survey: LifeSurvey }
  | { kind: "error"; generation: number; message: string };

/** A request for one chunk of a universe's survey: stars [from, to) in star order. */
export interface ChunkRequest {
  generation: number;
  seed: number;
  config: UniverseConfig;
  chunk: number;
  from: number;
  to: number;
}

export type ChunkMessage =
  | { kind: "chunk"; generation: number; chunk: number; survey: LifeSurvey }
  | { kind: "error"; generation: number; message: string };

// The stars of the universe this worker last surveyed: every chunk of a universe needs them
let starsCache: { key: string; stars: Star[] } | null = null;

function starsOf(seed: number, config: UniverseConfig): Star[] {
  const key = JSON.stringify([seed, config]);
  if (starsCache?.key !== key) {
    starsCache = { key, stars: generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars };
  }
  return starsCache.stars;
}

/** Survey one chunk of a universe's stars and post the partial survey, with the buffers it can move. */
export function runSurveyChunk(
  request: ChunkRequest, post: (message: ChunkMessage, transfer?: ArrayBuffer[]) => void,
): void {
  const { generation, seed, config, chunk, from, to } = request;
  try {
    const survey = surveyLife(starsOf(seed, config).slice(from, to), seed, config);
    post({ kind: "chunk", generation, chunk, survey }, indexBuffers(survey.index));
  } catch (err) {
    post({ kind: "error", generation, message: err instanceof Error ? err.message : String(err) });
  }
}

/** The survey of a universe from the surveys of its chunks, given in star order. */
export function mergeSurveys(parts: LifeSurvey[]): LifeSurvey {
  return {
    totalPlanets: parts.reduce((sum, p) => sum + p.totalPlanets, 0),
    lifeBearingPlanets: parts.reduce((sum, p) => sum + p.lifeBearingPlanets, 0),
    everLifePlanets: parts.reduce((sum, p) => sum + p.everLifePlanets, 0),
    civilizationCount: parts.reduce((sum, p) => sum + p.civilizationCount, 0),
    systems: parts.flatMap((p) => p.systems),
    index: mergeIndices(parts.map((p) => p.index)),
  };
}
