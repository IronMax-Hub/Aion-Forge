// A pool of survey workers that looks like one worker to the survey client.
//
// Why: a universe's survey takes over a minute on one core, and this machine
// has eight. The client (surveyClient.ts) talks to one worker; this stands in
// for it, so the client, its cache and its generation rules are unchanged.
//
// How: each request is cut into chunks of stars (surveyTask.ts). An idle
// worker takes the next chunk of the newest unfinished request, so the
// universe the viewer has just opened is surveyed first; requests they have
// left still finish afterwards, and the client caches their answers (AF-003).
// The work spreads evenly however long each chunk takes. Progress is the share of chunks done. When every chunk is in,
// the chunks are merged in star order and the result is posted, exactly as a
// single worker surveying the whole universe would have posted it. The first
// failure of a request is posted as its error and its remaining chunks are
// dropped. A worker that dies (an error the chunk could not catch, or a reply
// that cannot be read) fails the request whose chunk it held, and is replaced
// by a fresh worker when there is work again, so no request waits forever on a
// reply that will never come (AF-001).
//
// Determinism: chunks are independent and merged by star order, never by
// arrival order, so the result does not depend on which worker ran what.

import type { LifeSurvey } from "../simulation/lifeSurvey";
import { STAR_COUNT } from "../simulation/star";
import type { SurveyWorkerLike } from "./surveyClient";
import { mergeSurveys, STARS_PER_CHUNK } from "./surveyTask";
import type { ChunkMessage, ChunkRequest, SurveyMessage, SurveyRequest } from "./surveyTask";

/** The part of a chunk worker the pool uses, so tests can supply a stand-in. */
export interface ChunkWorkerLike {
  postMessage(request: ChunkRequest): void;
  onmessage: ((event: MessageEvent<ChunkMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  terminate(): void;
}

interface Slot {
  worker: ChunkWorkerLike;
  /** The request whose chunk the worker holds; null when idle. */
  generation: number | null;
}

interface Job {
  request: SurveyRequest;
  parts: (LifeSurvey | undefined)[];
  /** Next chunk to hand out. */
  next: number;
  done: number;
}

const CHUNK_COUNT = Math.ceil(STAR_COUNT / STARS_PER_CHUNK);

/** The most workers a pool starts, whatever the core count: each holds its own copy of the simulation (AF-002). */
export const MAX_SURVEY_WORKERS = 8;

/** Workers to use: one per core, less one for the interface, at least one and at most MAX_SURVEY_WORKERS. */
export function surveyPoolSize(hardwareConcurrency: number | undefined): number {
  return Math.min(MAX_SURVEY_WORKERS, Math.max(1, (hardwareConcurrency ?? 2) - 1));
}

export function createSurveyPool(createWorker: () => ChunkWorkerLike, size: number): SurveyWorkerLike {
  const workers: Slot[] = [];
  const jobs: Job[] = [];   // unfinished, oldest first

  const pool: SurveyWorkerLike = {
    onmessage: null,
    postMessage(request) {
      jobs.push({ request, parts: new Array(CHUNK_COUNT), next: 0, done: 0 });
      dispatch();
    },
  };

  function emit(message: SurveyMessage) {
    pool.onmessage?.({ data: message } as MessageEvent<SurveyMessage>);
  }

  /** Hands the next chunks to idle workers, starting workers as needed. */
  function dispatch() {
    while (workers.length < size && workers.length < jobs.length * CHUNK_COUNT) {
      const slot: Slot = { worker: createWorker(), generation: null };
      slot.worker.onmessage = (event) => receive(slot, event.data);
      slot.worker.onerror = (event) => lose(slot, event.message);
      slot.worker.onmessageerror = () => lose(slot, "a reply could not be read");
      workers.push(slot);
    }
    for (const slot of workers) {
      if (slot.generation !== null) continue;
      const job = jobs.findLast((j) => j.next < CHUNK_COUNT);
      if (!job) return;
      const chunk = job.next++;
      const { generation, seed, config } = job.request;
      slot.generation = generation;
      slot.worker.postMessage({
        generation, seed, config, chunk,
        from: chunk * STARS_PER_CHUNK, to: Math.min(STAR_COUNT, (chunk + 1) * STARS_PER_CHUNK),
      });
    }
  }

  /** Ends a request with an error, if it has not already ended; its chunks still out are dropped when they come back. */
  function fail(generation: number, message: string) {
    const index = jobs.findIndex((j) => j.request.generation === generation);
    if (index < 0) return;
    jobs.splice(index, 1);
    emit({ kind: "error", generation, message });
  }

  /** A worker that died: its request fails, and the worker is dropped for a fresh one. */
  function lose(slot: Slot, reason: string | undefined) {
    const at = workers.indexOf(slot);
    if (at < 0) return;   // already lost
    workers.splice(at, 1);
    slot.worker.terminate();
    if (slot.generation !== null) fail(slot.generation, `A survey worker stopped: ${reason || "unknown error"}`);
    dispatch();
  }

  function receive(slot: Slot, message: ChunkMessage) {
    slot.generation = null;
    const index = jobs.findIndex((j) => j.request.generation === message.generation);
    // A request that has already failed: its late chunks are dropped
    if (index >= 0) {
      const job = jobs[index];
      const { generation } = job.request;
      if (message.kind === "error") {
        fail(generation, message.message);
      } else {
        job.parts[message.chunk] = message.survey;
        job.done++;
        if (job.done === CHUNK_COUNT) {
          jobs.splice(index, 1);
          emit({ kind: "result", generation, survey: mergeSurveys(job.parts as LifeSurvey[]) });
        } else {
          emit({ kind: "progress", generation, fraction: job.done / CHUNK_COUNT });
        }
      }
    }
    dispatch();
  }

  return pool;
}
