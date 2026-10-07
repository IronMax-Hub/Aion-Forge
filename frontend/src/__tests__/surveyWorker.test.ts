import { describe, it, expect } from "vitest";
import { mergeSurveys, runSurveyChunk, STARS_PER_CHUNK } from "../workers/surveyTask";
import type { ChunkMessage, ChunkRequest, SurveyMessage, SurveyRequest } from "../workers/surveyTask";
import { createSurveyClient, surveyCacheKey } from "../workers/surveyClient";
import type { SurveyWorkerLike } from "../workers/surveyClient";
import { createSurveyPool, surveyPoolSize } from "../workers/surveyPool";
import type { ChunkWorkerLike } from "../workers/surveyPool";
import { makeConfig, PRESETS } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, STAR_COUNT, UNIVERSE_AGE_GYR } from "../simulation/star";
import { surveyLife } from "../simulation/lifeSurvey";
import type { LifeSurvey } from "../simulation/lifeSurvey";
import { INDEX_COLUMNS, indexBuffers, packIndex } from "../simulation/universeIndex";
import type { IndexRow } from "../simulation/universeIndex";

function surveyOnMainThread(seed: number, config = makeConfig(seed)): LifeSurvey {
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
  return surveyLife(stars, seed, config);
}

const CHUNKS = STAR_COUNT / STARS_PER_CHUNK;

/**
 * Stand-in chunk workers that hold their requests until the test runs them, in
 * any order it likes; `answer` decides what each chunk replies.
 */
function fakeChunkWorkers(answer: (request: ChunkRequest) => ChunkMessage) {
  const held: { worker: ChunkWorkerLike; request: ChunkRequest }[] = [];
  let created = 0;
  return {
    held,
    created: () => created,
    create(): ChunkWorkerLike {
      created++;
      const worker: ChunkWorkerLike = {
        onmessage: null,
        // structuredClone is what postMessage does to every message
        postMessage(request) { held.push({ worker, request: structuredClone(request) }); },
      };
      return worker;
    },
    /** Runs the held request at `index` (default: the newest) and delivers its reply. */
    run(index = held.length - 1) {
      const [{ worker, request }] = held.splice(index, 1);
      worker.onmessage!({ data: structuredClone(answer(request)) } as MessageEvent<ChunkMessage>);
    },
  };
}

/** Runs a whole request through a pool of stand-in workers that really survey, finishing chunks newest first. */
function surveyThroughPool(request: SurveyRequest, size = 3): SurveyMessage[] {
  const workers = fakeChunkWorkers((r) => {
    let reply: ChunkMessage | undefined;
    runSurveyChunk(r, (m) => { reply = m; });
    return reply!;
  });
  const pool = createSurveyPool(workers.create, size);
  const messages: SurveyMessage[] = [];
  pool.onmessage = ({ data }) => messages.push(data);
  pool.postMessage(request);
  while (workers.held.length > 0) workers.run();
  return messages;
}

// A full survey runs every solid planet's world history and its life's evolution: minutes
const FULL_SURVEY_TIMEOUT_MS = 900_000;

describe("survey worker pool", { timeout: FULL_SURVEY_TIMEOUT_MS }, () => {
  const messages = surveyThroughPool({ generation: 7, seed: 42, config: makeConfig(42) });

  it("returns exactly what surveying on the main thread returns, whatever order the chunks finish in", () => {
    const result = messages.at(-1)!;
    expect(result.kind).toBe("result");
    expect(result.kind === "result" && result.survey).toEqual(surveyOnMainThread(42));
  });

  it("uses the parameters it is given, not the defaults", () => {
    const config = makeConfig(42, PRESETS.find((p) => p.name === "Abundant Life")!.values);
    const result = surveyThroughPool({ generation: 1, seed: 42, config }).at(-1)!;
    expect(result.kind === "result" && result.survey).toEqual(surveyOnMainThread(42, config));
  });

  it("moves each chunk's index buffers to the main thread rather than copying them", () => {
    let posted: { message: ChunkMessage; transfer?: ArrayBuffer[] } | undefined;
    runSurveyChunk({ generation: 1, seed: 42, config: makeConfig(42), chunk: 0, from: 0, to: STARS_PER_CHUNK },
      (message, transfer) => { posted = { message, transfer }; });
    const { message, transfer } = posted!;
    expect(message.kind).toBe("chunk");
    if (message.kind !== "chunk") return;
    expect(message.survey.index.count).toBe(message.survey.totalPlanets);
    expect(transfer).toEqual(indexBuffers(message.survey.index));
    // What postMessage does with a transfer list: the copy keeps the rows, the sender's buffers are emptied
    const moved = structuredClone(message, { transfer });
    expect(moved.survey.index.count).toBe(message.survey.index.count);
    expect(message.survey.index.starId.byteLength).toBe(0);
  });

  it("reports rising progress after each chunk, tagged with the request's generation", () => {
    const progress = messages.filter((m) => m.kind === "progress").map((m) => m.kind === "progress" && m.fraction);
    expect(progress.length).toBe(CHUNKS - 1);
    expect(progress).toEqual([...progress].sort());
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress.at(-1)).toBeLessThan(1);
    expect(messages.every((m) => m.generation === 7)).toBe(true);
  });
});

describe("survey pool", () => {
  // Each chunk answers with its star range in place of a real survey
  const canned = (r: ChunkRequest): ChunkMessage => ({
    kind: "chunk", generation: r.generation, chunk: r.chunk,
    survey: {
      totalPlanets: r.to - r.from, lifeBearingPlanets: r.chunk, everLifePlanets: r.chunk, civilizationCount: r.generation,
      systems: [], index: packIndex([]),
    },
  });

  it("covers every star once, in chunks, with no more workers than its size", () => {
    const workers = fakeChunkWorkers(canned);
    const pool = createSurveyPool(workers.create, 4);
    const results: SurveyMessage[] = [];
    pool.onmessage = ({ data }) => { if (data.kind === "result") results.push(data); };
    pool.postMessage({ generation: 1, seed: 42, config: makeConfig(42) });
    expect(workers.held.length).toBe(4);
    const ranges: [number, number][] = [];
    while (workers.held.length > 0) {
      ranges.push([workers.held[0].request.from, workers.held[0].request.to]);
      workers.run(0);
    }
    expect(workers.created()).toBe(4);
    expect(ranges.sort((a, b) => a[0] - b[0]).flat()).toEqual(
      Array.from({ length: CHUNKS }, (_, i) => [i * STARS_PER_CHUNK, (i + 1) * STARS_PER_CHUNK]).flat());
    expect(results).toHaveLength(1);
    expect(results[0].kind === "result" && results[0].survey.totalPlanets).toBe(STAR_COUNT);
  });

  it("serves requests in the order they arrive", () => {
    const workers = fakeChunkWorkers(canned);
    const pool = createSurveyPool(workers.create, 2);
    const results: number[] = [];
    pool.onmessage = ({ data }) => { if (data.kind === "result") results.push(data.generation); };
    pool.postMessage({ generation: 1, seed: 42, config: makeConfig(42) });
    pool.postMessage({ generation: 2, seed: 43, config: makeConfig(43) });
    while (workers.held.length > 0) workers.run(0);
    expect(results).toEqual([1, 2]);
  });

  it("posts a request's first failure once, drops its other chunks, and goes on to the next request", () => {
    const workers = fakeChunkWorkers((r) => (r.generation === 1 && r.chunk === 1
      ? { kind: "error", generation: 1, message: "boom" } : canned(r)));
    const pool = createSurveyPool(workers.create, 3);
    const seen: SurveyMessage[] = [];
    pool.onmessage = ({ data }) => { if (data.kind !== "progress") seen.push(data); };
    pool.postMessage({ generation: 1, seed: 42, config: makeConfig(42) });
    pool.postMessage({ generation: 2, seed: 43, config: makeConfig(43) });
    while (workers.held.length > 0) workers.run(0);
    expect(seen.map((m) => [m.kind, m.generation])).toEqual([["error", 1], ["result", 2]]);
  });

  it("merges chunks by adding their counts and joining their systems and index rows in star order", () => {
    const system = (starId: number) => ({ starId, mostAdvancedStage: "microbial" as const, lifePlanetCount: 1, civilizationStage: null });
    const row = (starId: number, planetIndex: number): IndexRow => ({
      ...(Object.fromEntries(INDEX_COLUMNS.map((column) => [column, NaN])) as IndexRow), starId, planetIndex, massEarths: starId + planetIndex / 10,
    });
    expect(mergeSurveys([
      { totalPlanets: 3, lifeBearingPlanets: 1, everLifePlanets: 2, civilizationCount: 0, systems: [system(2)],
        index: packIndex([row(2, 0), row(2, 1), row(3, 0)]) },
      { totalPlanets: 4, lifeBearingPlanets: 2, everLifePlanets: 3, civilizationCount: 1, systems: [system(51), system(60)],
        index: packIndex([row(51, 0), row(60, 0), row(60, 2), row(60, 3)]) },
    ])).toEqual({
      totalPlanets: 7, lifeBearingPlanets: 3, everLifePlanets: 5, civilizationCount: 1, systems: [system(2), system(51), system(60)],
      index: packIndex([row(2, 0), row(2, 1), row(3, 0), row(51, 0), row(60, 0), row(60, 2), row(60, 3)]),
    });
  });

  it("uses one worker per core, less one for the interface", () => {
    expect(surveyPoolSize(8)).toBe(7);
    expect(surveyPoolSize(1)).toBe(1);
    expect(surveyPoolSize(undefined)).toBe(1);
  });
});

/**
 * The survey a stand-in worker answers with: small and different for every
 * seed, so the client's plumbing is tested without running real surveys.
 */
function cannedSurvey(seed: number): LifeSurvey {
  return { totalPlanets: seed, lifeBearingPlanets: 1, everLifePlanets: 1, civilizationCount: 0, systems: [], index: packIndex([]) };
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
