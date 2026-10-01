// Main-thread side of the life survey worker (a pool of workers since
// 2026-10-02, surveyPool.ts, which answers as one).
//
// Each request gets a new generation number. Only the latest request's
// progress and result reach its handlers; answers about a universe the viewer
// has already left are dropped (though still cached, since they are correct).
// Results are cached by rules version, seed and parameters, so returning to a
// universe is instant. The cache lives for the session and holds the most
// recently used surveys only.
//
// `survey` answers one-off questions (a Library recount) with a promise. It
// shares the worker and the cache, but never takes over or cancels the
// handlers of the universe on screen.

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
  let lastGeneration = 0;
  let latest = 0;
  const waiting = new Map<number, { resolve(survey: LifeSurvey): void; reject(error: Error): void }>();
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
    if (message.kind !== "progress") {
      pendingKeys.delete(message.generation);
      const promise = waiting.get(message.generation);
      waiting.delete(message.generation);
      if (promise && message.kind === "result") promise.resolve(message.survey);
      if (promise && message.kind === "error") promise.reject(new Error(message.message));
    }
    if (message.generation !== latest || !latestHandlers) return;

    if (message.kind === "progress") latestHandlers.onProgress(message.fraction);
    else if (message.kind === "result") latestHandlers.onResult(message.survey);
    else latestHandlers.onError(message.message);
  }

  /** Sends a request to the worker, starting the worker if needed. */
  function post(generation: number, seed: number, config: UniverseConfig, key: string): void {
    if (!worker) {
      worker = createWorker();
      worker.onmessage = receive;
    }
    pendingKeys.set(generation, key);
    worker.postMessage({ generation, seed, config });
  }

  /** Survey a universe. Handlers of any earlier request stop being called. */
  function request(seed: number, config: UniverseConfig, handlers: SurveyHandlers): void {
    latest = ++lastGeneration;
    latestHandlers = handlers;
    const key = surveyCacheKey(seed, config);

    const cached = cache.get(key);
    if (cached) {
      remember(key, cached);
      handlers.onResult(cached);
      return;
    }

    handlers.onProgress(0);
    post(latest, seed, config, key);
  }

  /** Survey a universe off the main thread without touching the universe on screen. */
  function survey(seed: number, config: UniverseConfig): Promise<LifeSurvey> {
    const key = surveyCacheKey(seed, config);
    const cached = cache.get(key);
    if (cached) {
      remember(key, cached);
      return Promise.resolve(cached);
    }
    const generation = ++lastGeneration;
    return new Promise((resolve, reject) => {
      waiting.set(generation, { resolve, reject });
      post(generation, seed, config, key);
    });
  }

  return { request, survey };
}
