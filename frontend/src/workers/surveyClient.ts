// Main-thread side of the life survey worker.
//
// Each request gets a new generation number. Only the latest request's
// progress and result reach its handlers; answers about a universe the viewer
// has already left are dropped (though still cached, since they are correct).
// Results are cached by rules version, seed and parameters, so returning to a
// universe is instant. The cache lives for the session and holds the most
// recently used surveys only.

import type { UniverseConfig } from "../simulation/config";
import type { LifeSurvey } from "../simulation/lifeSurvey";
import { SIMULATION_RULES_VERSION } from "../simulation/version";
import type { SurveyRequest, SurveyMessage } from "./surveyTask";

/** The part of a Worker the client uses, so tests can supply a stand-in. */
export interface SurveyWorkerLike {
  postMessage(request: SurveyRequest): void;
  onmessage: ((event: MessageEvent<SurveyMessage>) => void) | null;
}

export interface SurveyHandlers {
  onProgress(fraction: number): void;
  onResult(survey: LifeSurvey): void;
  onError(message: string): void;
}

const CACHE_SIZE = 16;

/** Everything that decides a survey's outcome, in a fixed order. */
export function surveyCacheKey(seed: number, config: UniverseConfig): string {
  const parameters = (Object.keys(config) as (keyof UniverseConfig)[]).sort().map((k) => [k, config[k]]);
  return JSON.stringify([SIMULATION_RULES_VERSION, seed, parameters]);
}

export function createSurveyClient(createWorker: () => SurveyWorkerLike) {
  let worker: SurveyWorkerLike | null = null;
  let latest = 0;
  let latestHandlers: SurveyHandlers | null = null;
  const pendingKeys = new Map<number, string>();
  const cache = new Map<string, LifeSurvey>();

  function remember(key: string, survey: LifeSurvey) {
    cache.delete(key);
    cache.set(key, survey);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }

  function receive({ data: message }: MessageEvent<SurveyMessage>) {
    if (message.kind === "result") {
      const key = pendingKeys.get(message.generation);
      if (key) remember(key, message.survey);
    }
    if (message.kind !== "progress") pendingKeys.delete(message.generation);
    if (message.generation !== latest || !latestHandlers) return;

    if (message.kind === "progress") latestHandlers.onProgress(message.fraction);
    else if (message.kind === "result") latestHandlers.onResult(message.survey);
    else latestHandlers.onError(message.message);
  }

  /** Survey a universe. Handlers of any earlier request stop being called. */
  function request(seed: number, config: UniverseConfig, handlers: SurveyHandlers): void {
    latest += 1;
    latestHandlers = handlers;
    const key = surveyCacheKey(seed, config);

    const cached = cache.get(key);
    if (cached) {
      remember(key, cached);
      handlers.onResult(cached);
      return;
    }

    if (!worker) {
      worker = createWorker();
      worker.onmessage = receive;
    }
    pendingKeys.set(latest, key);
    handlers.onProgress(0);
    worker.postMessage({ generation: latest, seed, config });
  }

  return { request };
}
