// A pool of survey workers that looks like one worker to the survey client.
//
// Why: a universe's survey takes over a minute on one core, and this machine
// has eight. The client (surveyClient.ts) talks to one worker; this stands in
// for it, so the client, its cache and its generation rules are unchanged.
//
// How: each request is cut into chunks of stars (surveyTask.ts). Requests are
// served in the order they arrive; an idle worker takes the next chunk of the
// oldest unfinished request, so the work spreads evenly however long each
// chunk takes. Progress is the share of chunks done. When every chunk is in,
// the chunks are merged in star order and the result is posted, exactly as a
// single worker surveying the whole universe would have posted it. The first
// failure of a request is posted as its error and its remaining chunks are
// dropped.
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
}

interface Job {
  request: SurveyRequest;
  parts: (LifeSurvey | undefined)[];
  /** Next chunk to hand out. */
  next: number;
  done: number;
}

const CHUNK_COUNT = Math.ceil(STAR_COUNT / STARS_PER_CHUNK);

/** Workers to use: one per core, less one for the interface, at least one. */
export function surveyPoolSize(hardwareConcurrency: number | undefined): number {
  return Math.max(1, (hardwareConcurrency ?? 2) - 1);
}

export function createSurveyPool(createWorker: () => ChunkWorkerLike, size: number): SurveyWorkerLike {
  const workers: { worker: ChunkWorkerLike; busy: boolean }[] = [];
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
      const slot = { worker: createWorker(), busy: false };
      slot.worker.onmessage = (event) => receive(slot, event.data);
      workers.push(slot);
    }
    for (const slot of workers) {
      if (slot.busy) continue;
      const job = jobs.find((j) => j.next < CHUNK_COUNT);
      if (!job) return;
      const chunk = job.next++;
      slot.busy = true;
      const { generation, seed, config } = job.request;
      slot.worker.postMessage({
        generation, seed, config, chunk,
        from: chunk * STARS_PER_CHUNK, to: Math.min(STAR_COUNT, (chunk + 1) * STARS_PER_CHUNK),
      });
    }
  }

  function receive(slot: { busy: boolean }, message: ChunkMessage) {
    slot.busy = false;
    const index = jobs.findIndex((j) => j.request.generation === message.generation);
    // A request that has already failed: its late chunks are dropped
    if (index >= 0) {
      const job = jobs[index];
      const { generation } = job.request;
      if (message.kind === "error") {
        jobs.splice(index, 1);
        emit({ kind: "error", generation, message: message.message });
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
