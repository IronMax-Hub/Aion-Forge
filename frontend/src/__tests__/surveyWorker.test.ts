import { describe, it, expect } from "vitest";
import { runSurvey } from "../workers/surveyTask";
import type { SurveyMessage, SurveyRequest } from "../workers/surveyTask";
import { createSurveyClient, surveyCacheKey } from "../workers/surveyClient";
import type { SurveyWorkerLike } from "../workers/surveyClient";
import { makeConfig, PRESETS } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { surveyLife, SURVEY_PROGRESS_INTERVAL } from "../simulation/lifeSurvey";
import type { LifeSurvey } from "../simulation/lifeSurvey";

function surveyOnMainThread(seed: number, config = makeConfig(seed)): LifeSurvey {
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
  return surveyLife(stars, seed, config);
}

function runInWorker(request: SurveyRequest): SurveyMessage[] {
  const messages: SurveyMessage[] = [];
  // structuredClone is what postMessage does to every message
  runSurvey(structuredClone(request), (m) => messages.push(structuredClone(m)));
  return messages;
}

// A full survey runs every solid planet's world history and its life's evolution: minutes
const FULL_SURVEY_TIMEOUT_MS = 900_000;

describe("survey worker task", { timeout: FULL_SURVEY_TIMEOUT_MS }, () => {
  const messages = runInWorker({ generation: 7, seed: 42, config: makeConfig(42) });

  it("returns exactly what surveying on the main thread returns", () => {
    const result = messages.at(-1)!;
    expect(result.kind).toBe("result");
    expect(result.kind === "result" && result.survey).toEqual(surveyOnMainThread(42));
  });

  it("uses the parameters it is given, not the defaults", () => {
    const config = makeConfig(42, PRESETS.find((p) => p.name === "Abundant Life")!.values);
    const result = runInWorker({ generation: 1, seed: 42, config }).at(-1)!;
    expect(result.kind === "result" && result.survey).toEqual(surveyOnMainThread(42, config));
  });

  it("reports rising progress every 100 stars, tagged with the request's generation", () => {
    const progress = messages.filter((m) => m.kind === "progress").map((m) => m.kind === "progress" && m.fraction);
    expect(progress.length).toBe(2000 / SURVEY_PROGRESS_INTERVAL - 1);
    expect(progress).toEqual([...progress].sort());
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress.at(-1)).toBeLessThan(1);
    expect(messages.every((m) => m.generation === 7)).toBe(true);
  });
});

/**
 * The survey a stand-in worker answers with: small and different for every
 * seed, so the client's plumbing is tested without running real surveys.
 */
function cannedSurvey(seed: number): LifeSurvey {
  return { totalPlanets: seed, lifeBearingPlanets: 1, civilizationCount: 0, systems: [] };
}

/** A stand-in worker that holds requests until the test answers them. */
function fakeWorker() {
  const requests: SurveyRequest[] = [];
  const worker: SurveyWorkerLike & { requests: SurveyRequest[]; answer(i: number): void } = {
    requests,
    onmessage: null,
    postMessage(request) { requests.push(request); },
    answer(i) {
      const { generation, seed } = requests[i];
      for (const message of [
        { kind: "progress", generation, fraction: 0.5 },
        { kind: "result", generation, survey: cannedSurvey(seed) },
      ] as SurveyMessage[]) worker.onmessage!({ data: message } as MessageEvent<SurveyMessage>);
    },
  };
  return worker;
}

function recordingHandlers() {
  const seen = { progress: [] as number[], results: [] as LifeSurvey[], errors: [] as string[] };
  return {
    seen,
    handlers: {
      onProgress: (f: number) => seen.progress.push(f),
      onResult: (s: LifeSurvey) => seen.results.push(s),
      onError: (m: string) => seen.errors.push(m),
    },
  };
}

describe("survey client", () => {
  it("drops the answer about a universe the viewer has already left", () => {
    const worker = fakeWorker();
    const client = createSurveyClient(() => worker);
    const first = recordingHandlers();
    const second = recordingHandlers();

    client.request(100000, makeConfig(100000), first.handlers);
    client.request(42, makeConfig(42), second.handlers);   // switched before the first answer
    worker.answer(0);
    worker.answer(1);

    expect(first.seen.results).toEqual([]);
    expect(first.seen.progress).toEqual([0]);                // only the immediate "started"
    expect(second.seen.results).toEqual([cannedSurvey(42)]);
  });

  it("answers a universe it has surveyed before from its cache, without the worker", () => {
    const worker = fakeWorker();
    const client = createSurveyClient(() => worker);
    client.request(42, makeConfig(42), recordingHandlers().handlers);
    worker.answer(0);

    const again = recordingHandlers();
    client.request(42, makeConfig(42), again.handlers);
    expect(worker.requests.length).toBe(1);
    expect(again.seen.results).toEqual([cannedSurvey(42)]);
    expect(again.seen.progress).toEqual([]);
  });

  it("caches a dropped answer too, since it is still correct for its universe", () => {
    const worker = fakeWorker();
    const client = createSurveyClient(() => worker);
    client.request(100000, makeConfig(100000), recordingHandlers().handlers);
    client.request(42, makeConfig(42), recordingHandlers().handlers);
    worker.answer(0);
    worker.answer(1);

    const back = recordingHandlers();
    client.request(100000, makeConfig(100000), back.handlers);
    expect(worker.requests.length).toBe(2);
    expect(back.seen.results).toEqual([cannedSurvey(100000)]);
  });

  it("answers a one-off survey with a promise, without disturbing the universe on screen", async () => {
    const worker = fakeWorker();
    const client = createSurveyClient(() => worker);
    const onScreen = recordingHandlers();
    client.request(100000, makeConfig(100000), onScreen.handlers);
    const recount = client.survey(42, makeConfig(42));
    worker.answer(1);
    worker.answer(0);

    expect(await recount).toEqual(cannedSurvey(42));
    expect(onScreen.seen.results).toEqual([cannedSurvey(100000)]);
    expect(onScreen.seen.progress).toEqual([0, 0.5]);
    // Both answers are cached
    expect(await client.survey(100000, makeConfig(100000))).toEqual(cannedSurvey(100000));
    expect(worker.requests.length).toBe(2);
  });

  it("rejects a one-off survey that fails", async () => {
    const worker = fakeWorker();
    const client = createSurveyClient(() => worker);
    const recount = client.survey(42, makeConfig(42));
    worker.onmessage!({ data: { kind: "error", generation: worker.requests[0].generation, message: "boom" } } as MessageEvent<SurveyMessage>);
    await expect(recount).rejects.toThrow("boom");
  });

  it("passes a failed survey's message to the current request", () => {
    const worker = fakeWorker();
    const client = createSurveyClient(() => worker);
    const current = recordingHandlers();
    client.request(42, makeConfig(42), current.handlers);
    worker.onmessage!({ data: { kind: "error", generation: 1, message: "boom" } } as MessageEvent<SurveyMessage>);
    expect(current.seen.errors).toEqual(["boom"]);
  });

  it("keys the cache on everything that decides the outcome, whatever the parameter order", () => {
    const config = makeConfig(42);
    const reordered = Object.fromEntries(Object.entries(config).reverse()) as typeof config;
    expect(surveyCacheKey(42, reordered)).toBe(surveyCacheKey(42, config));
    expect(surveyCacheKey(43, config)).not.toBe(surveyCacheKey(42, config));
    expect(surveyCacheKey(42, { ...config, emergenceSensitivity: 1.01 })).not.toBe(surveyCacheKey(42, config));
  });
});
