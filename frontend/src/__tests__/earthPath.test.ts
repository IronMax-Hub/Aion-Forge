import { describe, it, expect } from "vitest";
import { EARTH_PATH, firstsOrder } from "../../stats/earthPath";
import type { WorldHistory } from "../simulation/worldHistory";
import type { FirstKind } from "../simulation/evolution/engine";

// Worlds Up Close C2.10: the order of a mind world's firsts.

function history(oxidation: number | null, firsts: Partial<Record<FirstKind, number>>, mind: number | null): WorldHistory {
  return {
    events: oxidation === null ? [] : [{ kind: "oxidation", tGyr: oxidation }],
    life: { firsts: Object.entries(firsts).map(([kind, tGyr]) => ({ kind, tGyr, lineageId: 1 })) },
    phylogeny: { mind: mind === null ? null : { tGyr: mind } },
  } as unknown as WorldHistory;
}

describe("the Earth-path measurement", () => {
  it("is Earth's order when oxygen, land, a kilogram and a mind come in that order, in different steps", () => {
    expect(EARTH_PATH).toBe("oxygen → land → 1 kg → mind");
    expect(firstsOrder(history(1.0, { land: 2.0, kilogram: 3.0, light: 0.5 }, 4.0))).toBe(EARTH_PATH);
  });

  it("joins firsts in the same step, and lists those that never happened", () => {
    expect(firstsOrder(history(1.0, { kilogram: 3.0 }, 3.0))).toBe("oxygen → 1 kg + mind (never: land)");
    expect(firstsOrder(history(null, { land: 1.0, kilogram: 0.8 }, 2.0))).toBe("1 kg → land → mind (never: oxygen)");
  });

  it("has nothing to say about a world without a mind", () => {
    expect(firstsOrder(history(1.0, { land: 2.0 }, null))).toBeNull();
  });
});
