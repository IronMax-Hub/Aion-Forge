// The life survey as a task that can run off the main thread.
//
// Why: surveying every planet in a universe takes ~15 ms today and will grow
// by an order of magnitude once each planet runs a climate history and an
// evolution model. Run on the main thread, that would freeze the interface.
//
// How: the worker receives only a seed and parameters, regenerates the stars
// with the same pure simulation modules the main thread uses, surveys them and
// posts progress and the result back. Tests call runSurvey directly.
//
// Every message carries the generation number of the request it answers, so
// the main thread can ignore answers about a universe it has already left.

import type { UniverseConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { surveyLife } from "../simulation/lifeSurvey";
import type { LifeSurvey } from "../simulation/lifeSurvey";

export interface SurveyRequest {
  generation: number;
  seed: number;
  config: UniverseConfig;
}

export type SurveyMessage =
  | { kind: "progress"; generation: number; fraction: number }
  | { kind: "result"; generation: number; survey: LifeSurvey }
  | { kind: "error"; generation: number; message: string };

/** Survey one universe, posting progress as it goes and the survey at the end. */
export function runSurvey(request: SurveyRequest, post: (message: SurveyMessage) => void): void {
  const { generation, seed, config } = request;
  try {
    const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
    const survey = surveyLife(stars, seed, config, (done, total) =>
      post({ kind: "progress", generation, fraction: done / total }));
    post({ kind: "result", generation, survey });
  } catch (err) {
    post({ kind: "error", generation, message: err instanceof Error ? err.message : String(err) });
  }
}
