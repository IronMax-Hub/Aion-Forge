// Tree of life (Worlds Up Close, phase C2.9b): the layout of a planet's
// phylogeny on a time axis, as plain functions the chart draws from.
//
// Why it exists: the field guide shows a dozen organisms; the tree shows where
// they came from, which lines died out, and when catastrophes struck, from the
// world history's own record of every lineage.
//
// How:
// - Pruning (owner decision): a planet can have hundreds of lineages. Every
//   living lineage is kept, with all its ancestors, so the tree of the living
//   is whole. Extinct side branches are added, longest-lived first, each with
//   the ancestors that join it to the tree, until about MAX_LINES lines are shown.
// - Rows: depth first from the first lineage, a parent's children in birth
//   order, so each clade sits together. Each lineage is a line from its birth to
//   its death (or today), joined to its parent's row at its birth.
// - Time: Gyr after the star formed, from life's start to today; the axis is
//   labelled in Gyr ago, as the plates are.
// - Mass extinctions: catastrophes that killed at least MASS_EXTINCTION_SHARE of
//   the living lineages (C2.7's grading), drawn as vertical rules.
//
// Presentation only: it reads lineages and never writes them.

import type { CatastropheRecord, Lineage } from "../simulation/evolution/engine";

/** About this many lines are drawn: every living lineage and its ancestors always, then extinct branches. */
export const MAX_LINES = 150;
/** A catastrophe that kills at least this share of living lineages is a mass extinction (C2.7). */
export const MASS_EXTINCTION_SHARE = 0.25;

export interface TreeRow {
  lineage: Lineage;
  row: number;
  /** Gyr after the star formed. */
  fromGyr: number;
  toGyr: number;
  /** The parent's row, if the parent is drawn. */
  parentRow: number | null;
  living: boolean;
}

export interface MassExtinction {
  tGyr: number;
  cause: CatastropheRecord["cause"];
  /** Share of living lineages it killed, 0–1. */
  share: number;
}

export interface TreeOfLife {
  rows: TreeRow[];
  startGyr: number;
  nowGyr: number;
  extinctions: MassExtinction[];
  /** How many lineages ever lived; the tree may show fewer. */
  totalLineages: number;
}

/** The lineages the tree draws: the living and their ancestors, then the longest-lived extinct branches. */
export function pruneLineages(lineages: readonly Lineage[], max = MAX_LINES): Set<number> {
  const byId = new Map(lineages.map((l) => [l.id, l]));
  const kept = new Set<number>();
  const keepWithAncestors = (l: Lineage | undefined) => {
    for (let at = l; at && !kept.has(at.id); at = at.parentId !== null ? byId.get(at.parentId) : undefined) kept.add(at.id);
  };
  for (const l of lineages) if (l.diedGyr === null) keepWithAncestors(l);
  const extinct = lineages
    .filter((l) => !kept.has(l.id))
    .sort((a, b) => (b.diedGyr! - b.bornGyr) - (a.diedGyr! - a.bornGyr) || a.id - b.id);
  for (const l of extinct) {
    if (kept.size >= max) break;
    keepWithAncestors(l);
  }
  return kept;
}

/** The tree's layout: one row per kept lineage, clades together, on the time axis. */
export function layoutTree(
  lineages: readonly Lineage[], catastrophes: readonly CatastropheRecord[], startGyr: number, nowGyr: number, max = MAX_LINES,
): TreeOfLife {
  const kept = pruneLineages(lineages, max);
  const children = new Map<number | null, Lineage[]>();
  for (const l of lineages) {
    if (!kept.has(l.id)) continue;
    // A lineage whose parent is not drawn hangs from the root
    const parent = l.parentId !== null && kept.has(l.parentId) ? l.parentId : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(l);
  }
  for (const list of children.values()) list.sort((a, b) => a.bornGyr - b.bornGyr || a.id - b.id);

  const rows: TreeRow[] = [];
  const rowOf = new Map<number, number>();
  // Depth first, without recursion (lines of descent can be hundreds long)
  const stack: Lineage[] = [...(children.get(null) ?? [])].reverse();
  while (stack.length > 0) {
    const l = stack.pop()!;
    const row = rows.length;
    rowOf.set(l.id, row);
    rows.push({
      lineage: l, row,
      fromGyr: l.bornGyr,
      toGyr: l.diedGyr ?? nowGyr,
      parentRow: l.parentId !== null ? rowOf.get(l.parentId) ?? null : null,
      living: l.diedGyr === null,
    });
    stack.push(...[...(children.get(l.id) ?? [])].reverse());
  }

  const extinctions = catastrophes
    .filter((c) => c.aliveBefore > 0 && c.lineagesLost / c.aliveBefore >= MASS_EXTINCTION_SHARE)
    .map((c) => ({ tGyr: c.tGyr, cause: c.cause, share: c.lineagesLost / c.aliveBefore }));
  return { rows, startGyr, nowGyr, extinctions, totalLineages: lineages.length };
}

/** Ticks for the time axis, in Gyr ago: tidy steps from today back to life's start. */
export function agoTicks(spanGyr: number, maxTicks = 8): number[] {
  const rough = spanGyr / maxTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((s) => s * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const count = Math.floor(spanGyr / step + 1e-9);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}
