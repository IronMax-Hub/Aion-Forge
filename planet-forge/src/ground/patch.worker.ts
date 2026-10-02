// A worker that builds patches of ground (patchBuilder.ts) for one planet, so
// the page never stalls while the ground loads.
//
// Messages in:  { type: "planet", spec }  then  { type: "build", id, key }
// Messages out: { type: "built", id, patch }, its arrays transferred, not copied.

import type { PlanetSpec } from "../spec/schema";
import type { Vec3 } from "../forge/icosphere";
import { createTerrain } from "../terrain/terrain";
import type { Terrain } from "../terrain/terrain";
import { createMaterials } from "../terrain/materials";
import type { PatchKey } from "./cubeSphere";
import { buildPatch } from "./patchBuilder";

export type WorkerRequest = { type: "planet"; spec: PlanetSpec } | { type: "build"; id: number; key: PatchKey };

let planet: { terrain: Terrain; materials: ReturnType<typeof createMaterials>; cover: Vec3 | null } | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "planet") {
    const { spec } = message;
    planet = { terrain: createTerrain(spec), materials: createMaterials(spec), cover: spec.groundCover?.colourLinear ?? null };
    return;
  }
  if (!planet) return;
  const patch = buildPatch(planet.terrain, planet.materials, planet.cover, message.key);
  const transfer: Transferable[] = [patch.positions.buffer, patch.normals.buffer, patch.colours.buffer, patch.glow.buffer];
  if (patch.water) transfer.push(patch.water.positions.buffer, patch.water.depth.buffer, patch.water.seaIce.buffer);
  (self as unknown as Worker).postMessage({ type: "built", id: message.id, patch }, transfer);
};
