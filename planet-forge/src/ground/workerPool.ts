// Builds patches in a few workers (patch.worker.ts), one at a time each,
// nearest first. The renderer says which patches it still wants each frame;
// queued requests it no longer wants are dropped before they are built.

import type { PlanetSpec } from "../spec/schema";
import type { PatchKey } from "./cubeSphere";
import { keyText } from "./cubeSphere";
import type { PatchData } from "./patchBuilder";
import type { WorkerRequest } from "./patch.worker";

/** At most this many workers, and one core is left for the page. */
const MAX_WORKERS = 4;

export class PatchWorkers {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: PatchKey[] = [];
  private pending = new Set<string>();
  private nextId = 0;
  private onBuilt: (patch: PatchData) => void;

  constructor(spec: PlanetSpec, onBuilt: (patch: PatchData) => void) {
    this.onBuilt = onBuilt;
    const count = Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL("./patch.worker.ts", import.meta.url), { type: "module" });
      worker.postMessage({ type: "planet", spec } satisfies WorkerRequest);
      worker.onmessage = (event: MessageEvent<{ type: "built"; id: number; patch: PatchData }>) => {
        this.pending.delete(keyText(event.data.patch.key));
        this.idle.push(worker);
        this.onBuilt(event.data.patch);
        this.pump();
      };
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  /** Patches being built right now. */
  get busy(): number {
    return this.pending.size;
  }

  /** The patches wanted, nearest first: replaces whatever was queued and not yet started. */
  want(keys: PatchKey[]): void {
    this.queue = keys.filter((k) => !this.pending.has(keyText(k)));
    this.pump();
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const key = this.queue.shift()!;
      const worker = this.idle.pop()!;
      this.pending.add(keyText(key));
      worker.postMessage({ type: "build", id: this.nextId++, key } satisfies WorkerRequest);
    }
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
    this.idle = [];
    this.queue = [];
  }
}
