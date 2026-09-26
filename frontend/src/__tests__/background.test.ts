import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { starfieldData, distantGalaxyData, SkyBackground, SKY_RADIUS } from "../rendering/background";
import type { PointLayerData } from "../rendering/background";

const backgroundSource = Object.values(
  import.meta.glob("../rendering/background.ts", { query: "?raw", import: "default", eager: true }),
)[0] as string;

/** Each point's brightness: the tints are a colour scaled so its strongest channel is the brightness. */
function brightnesses(data: PointLayerData): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.sizes.length; i++) out.push(Math.max(data.tints[i * 3], data.tints[i * 3 + 1], data.tints[i * 3 + 2]));
  return out;
}

function radii(data: PointLayerData): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.sizes.length; i++) out.push(Math.hypot(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]));
  return out;
}

describe("sky backdrop is separate from the simulation", () => {
  it("imports nothing from simulation/", () => {
    const imports = [...backgroundSource.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["three"]);
  });
});

describe("foreground stars", () => {
  const stars = starfieldData();

  it("are the same in every universe and every session", () => {
    expect(starfieldData()).toEqual(stars);
  });

  it("all lie on the sky sphere", () => {
    for (const r of radii(stars)) expect(r).toBeCloseTo(SKY_RADIUS, 0);
  });

  it("are mostly faint, with only a few bright ones, like real star counts", () => {
    const b = brightnesses(stars).sort((x, y) => x - y);
    const median = b[Math.floor(b.length / 2)];
    const brightShare = b.filter((x) => x > 0.7).length / b.length;
    expect(b[0]).toBeGreaterThanOrEqual(0.3);          // none so faint it vanishes
    expect(median).toBeLessThan(0.45);
    expect(brightShare).toBeGreaterThan(0.002);
    expect(brightShare).toBeLessThan(0.1);
  });

  it("are one pixel when faint and three with a halo when bright", () => {
    const b = brightnesses(stars);
    for (let i = 0; i < b.length; i++) expect(stars.sizes[i]).toBe(b[i] > 0.7 ? 3 : 1);
  });

  it("have natural, unsaturated colours", () => {
    for (let i = 0; i < stars.sizes.length; i++) {
      const [r, g, bl] = [stars.tints[i * 3], stars.tints[i * 3 + 1], stars.tints[i * 3 + 2]];
      expect(Math.min(r, g, bl) / Math.max(r, g, bl)).toBeGreaterThan(0.7);
    }
  });
});

describe("distant galaxies", () => {
  it("are the same every time for the same universe", () => {
    expect(distantGalaxyData(100000)).toEqual(distantGalaxyData(100000));
  });

  it("differ from one universe to the next", () => {
    const a = distantGalaxyData(100000).positions;
    const b = distantGalaxyData(100001).positions;
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    expect(same).toBe(0);
  });

  it("lie on the sky sphere, faint, as small ovals, mostly redshifted to warm colours", () => {
    const g = distantGalaxyData(42);
    for (const r of radii(g)) expect(r).toBeCloseTo(SKY_RADIUS, 0);
    for (const b of brightnesses(g)) expect(b).toBeLessThanOrEqual(0.6);
    for (let i = 0; i < g.sizes.length; i++) {
      expect(g.sizes[i]).toBeGreaterThanOrEqual(5);
      expect(g.sizes[i]).toBeLessThanOrEqual(14);
      expect(g.axisRatios[i]).toBeGreaterThan(0);
      expect(g.axisRatios[i]).toBeLessThanOrEqual(1);
    }
    let warm = 0;
    for (let i = 0; i < g.sizes.length; i++) if (g.tints[i * 3] > g.tints[i * 3 + 2]) warm++;
    expect(warm / g.sizes.length).toBeGreaterThan(0.7);
  });
});

describe("SkyBackground", () => {
  it("keeps the stars and swaps only the distant galaxies when the universe changes", () => {
    const sky = new SkyBackground(1, new THREE.Vector2(800, 600));
    const [stars] = sky.group.children;
    sky.setUniverse(1);
    const first = sky.group.children[1];
    sky.setUniverse(2);
    expect(sky.group.children.length).toBe(2);
    expect(sky.group.children[0]).toBe(stars);
    expect(sky.group.children[1]).not.toBe(first);
    sky.dispose();
  });

  it("stays centred on the camera, so it never comes nearer", () => {
    const sky = new SkyBackground(1, new THREE.Vector2(800, 600));
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(120, -40, 900);
    sky.follow(camera);
    expect(sky.group.position.toArray()).toEqual([120, -40, 900]);
    sky.dispose();
  });
});
