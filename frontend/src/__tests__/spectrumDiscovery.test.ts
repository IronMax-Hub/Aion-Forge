import { describe, it, expect } from "vitest";
import { spectrumDiscovery } from "../ui/spectrumDiscovery";
import type { Detection, Verdict } from "../simulation/detection";
import type { DiscoveryItem } from "../simulation/persistence";
import { planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";

// Worlds Up Close B5/B6: a universe records its first strong biosignature and first technosignature, once each.

const seed = 7777;
const planetAt = (starId: number, index: number): Planet => ({
  id: index, key: planetKey(starId, index), hostStarId: starId, orbitalRadius: 1, orbitalIndex: index, type: "rocky", size: 1,
  mass: 1, temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
  habitabilityScore: 0.8, isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false,
});
const here = planetAt(12, 1);
const detection = (verdict: Verdict): Detection => ({
  verdict, gases: [{ gas: "O2", sigma: 5.24 }, { gas: "CH4", sigma: 3.01 }, { gas: "CO2", sigma: 2.9 }],
});

describe("recording a spectrum discovery", () => {
  it("offers only strong biosignatures and technosignatures", () => {
    for (const verdict of ["none", "atmosphere", "ambiguous", "possible-biosignature"] as Verdict[]) {
      expect(spectrumDiscovery(detection(verdict), 50, here, seed, []).status).toBe("not-recordable");
    }
    expect(spectrumDiscovery(detection("strong-biosignature"), 50, here, seed, []).status).toBe("recordable");
    expect(spectrumDiscovery(detection("technosignature"), 50, here, seed, []).status).toBe("recordable");
  });

  it("files each in its collection, naming the planet and the evidence", () => {
    const strong = spectrumDiscovery(detection("strong-biosignature"), 50, here, seed, []);
    if (strong.status !== "recordable") throw new Error("expected recordable");
    const item = strong.item(1234);
    expect(item).toEqual({
      id: `spectrum-${seed}-strong-biosignature`, category: "remarkable-worlds", universeSeed: seed, subjectId: here.key,
      label: "0012 c", description: "Strong biosignature (chemical disequilibrium) after 50 transits: O₂ 5.2σ, CH₄ 3.0σ", savedAt: 1234,
    });
    const techno = spectrumDiscovery(detection("technosignature"), 50, here, seed, []);
    if (techno.status !== "recordable") throw new Error("expected recordable");
    expect(techno.item(0).category).toBe("extraordinary-civilizations");
  });

  it("records only the universe's first: later planets are told which was", () => {
    const strong = spectrumDiscovery(detection("strong-biosignature"), 50, here, seed, []);
    if (strong.status !== "recordable") throw new Error("expected recordable");
    const saved: DiscoveryItem[] = [strong.item(1)];
    expect(spectrumDiscovery(detection("strong-biosignature"), 80, here, seed, saved)).toEqual({ status: "recorded-here" });
    expect(spectrumDiscovery(detection("strong-biosignature"), 50, planetAt(40, 3), seed, saved))
      .toEqual({ status: "recorded-elsewhere", label: "0012 c" });
    // Another verdict, or another universe, is still open
    expect(spectrumDiscovery(detection("technosignature"), 50, planetAt(40, 3), seed, saved).status).toBe("recordable");
    expect(spectrumDiscovery(detection("strong-biosignature"), 50, here, seed + 1, saved).status).toBe("recordable");
  });
});
