import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { eccentricAnomaly, INNER_ORBIT_SECONDS, keplerPlace, SystemOrbits, orbitStartAngle, secondsPerOrbit } from "../rendering/systemView";
import type { OrbitPlace } from "../rendering/systemView";
import type { Planet } from "../simulation/planet";

const planet = (id: number, hostStarId = 7): Planet => ({ id, hostStarId } as Planet);

describe("orbital motion in the system view", () => {
  it("keeps Kepler's period ratios: P ∝ a^1.5, the innermost once a minute", () => {
    expect(secondsPerOrbit(1, 1)).toBe(INNER_ORBIT_SECONDS);
    expect(secondsPerOrbit(4, 1)).toBeCloseTo(8 * INNER_ORBIT_SECONDS, 9);
  });

  it("starts each planet at an angle of its own, the same every time", () => {
    const angles = [0, 1, 2, 3].map((id) => orbitStartAngle(planet(id), 12345));
    expect(orbitStartAngle(planet(2), 12345)).toBe(angles[2]);
    for (const a of angles) expect(a >= 0 && a < 2 * Math.PI).toBe(true);
    expect(new Set(angles).size).toBe(4);
  });

  it("moves a planet round its circle and tells its followers where the star is", () => {
    const orbits = new SystemOrbits();
    const parent = new THREE.Group();
    parent.position.set(10, 0, 0);   // the star, where the system is drawn
    const carrier = new THREE.Group();
    parent.add(carrier);
    orbits.add(planet(0), carrier, 2, 2, 1);
    const places: OrbitPlace[] = [];
    orbits.follow(planet(0).key, (p) => places.push({ angle: p.angle, centre: p.centre.clone(), toStar: p.toStar.clone() }));
    orbits.advance(INNER_ORBIT_SECONDS / 4);

    expect(places).toHaveLength(2);
    const [start, later] = places;
    expect(later.angle - start.angle).toBeCloseTo(Math.PI / 2, 9);
    for (const { centre, toStar } of places) {
      const fromStar = centre.clone().sub(parent.position);
      expect(fromStar.length()).toBeCloseTo(2, 9);
      expect(toStar.length()).toBeCloseTo(1, 9);
      expect(toStar.dot(fromStar.normalize())).toBeCloseTo(-1, 9);
    }
    // A whole orbit later it is back where it started
    orbits.advance(INNER_ORBIT_SECONDS * 3 / 4);
    expect(places[2].centre.distanceTo(start.centre)).toBeLessThan(1e-9);
  });
});

describe("a binary's stars on Kepler ellipses (BS4)", () => {
  it("solves Kepler's equation", () => {
    for (const e of [0, 0.3, 0.8, 0.95]) {
      for (const M of [0.1, 1, 2.5, 4, 6]) {
        const E = eccentricAnomaly(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });

  it("is closest at a(1 − e) and farthest at a(1 + e), toward its periapsis", () => {
    const path = { a: 10, e: 0.4, share: 1, periapsis: 0 };
    const [xp, zp] = keplerPlace(path, 0);
    expect(xp).toBeCloseTo(6, 10);
    expect(zp).toBeCloseTo(0, 10);
    const [xa] = keplerPlace(path, Math.PI);
    expect(xa).toBeCloseTo(-14, 10);
  });

  it("keeps the centre of mass still: m₁ r₁ + m₂ r₂ = 0 at every moment", () => {
    const mu = 0.3;   // the companion's share of the mass
    const primary = { a: 5, e: 0.6, share: -mu, periapsis: 1.2 };
    const companion = { ...primary, share: 1 - mu };
    for (const M of [0, 0.7, 2, 3.5, 5.9]) {
      const [x1, z1] = keplerPlace(primary, M);
      const [x2, z2] = keplerPlace(companion, M);
      expect((1 - mu) * x1 + mu * x2).toBeCloseTo(0, 10);
      expect((1 - mu) * z1 + mu * z2).toBeCloseTo(0, 10);
    }
  });
});
