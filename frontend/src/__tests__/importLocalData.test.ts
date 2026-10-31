import { afterEach, describe, expect, it, vi } from "vitest";

// The server is never called: importData is replaced by a recorder
const sent = vi.hoisted(() => [] as unknown[]);
vi.mock("../api/client", () => ({ importData: async (payload: unknown) => { sent.push(payload); } }));

import { importLocalDataOnce } from "../api/importLocalData";

/** A stand-in localStorage over `items`; `broken` makes reads, writes or both throw, as blocked storage does. */
function storage(items: Record<string, string>, broken: { read?: boolean; write?: boolean } = {}) {
  return {
    getItem(key: string) {
      if (broken.read) throw new DOMException("blocked", "SecurityError");
      return items[key] ?? null;
    },
    setItem(key: string, value: string) {
      if (broken.write) throw new DOMException("full", "QuotaExceededError");
      items[key] = value;
    },
  };
}

const LEGACY = { "aion-forge-gallery": JSON.stringify([{ seed: 1 }]), "aion-forge-journal": JSON.stringify([{ id: "b" }]) };

describe("one-time import of legacy browser data", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sent.length = 0;
  });

  it("sends the legacy records once, then marks them sent", async () => {
    const items: Record<string, string> = { ...LEGACY };
    vi.stubGlobal("localStorage", storage(items));
    expect(await importLocalDataOnce()).toBe(2);
    expect(await importLocalDataOnce()).toBe(0);
    expect(sent).toHaveLength(1);
    expect(items["aion-forge-imported-to-db"]).toBeTruthy();
  });

  it("does nothing, and does not throw, when storage cannot be read", async () => {
    vi.stubGlobal("localStorage", storage({ ...LEGACY }, { read: true }));
    expect(await importLocalDataOnce()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("still sends, and does not throw, when the sent flag cannot be kept", async () => {
    vi.stubGlobal("localStorage", storage({ ...LEGACY }, { write: true }));
    expect(await importLocalDataOnce()).toBe(2);
    expect(sent).toHaveLength(1);
  });
});
