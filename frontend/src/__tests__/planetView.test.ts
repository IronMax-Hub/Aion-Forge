import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { PlanetView, EARTH_RADIUS_KM, FADE_IN_MS, ORBIT_DISTANCE } from "../rendering/planet/PlanetView";
import { planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import type { Star } from "../simulation/star";

const star: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};
const planet: Planet = {
  id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "ocean", size: 1.5, mass: 2,
  temperature: 290, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8, isRare: false, surface: null,
};
const towardStar = new THREE.Vector3(-1, 0, 0);

describe("planet view", () => {
  it("measures its scene in planet radii", () => {
    expect(new PlanetView(planet, star, towardStar, false, 0).kmPerUnit).toBe(1.5 * EARTH_RADIUS_KM);
    expect(ORBIT_DISTANCE.min).toBe(1.15);
    expect(ORBIT_DISTANCE.max).toBe(8);
  });

  it("lights the planet from its star's direction", () => {
    const view = new PlanetView(planet, star, new THREE.Vector3(3, 4, 0), false, 0);
    expect(view.towardStar.x).toBeCloseTo(0.6, 12);
    expect(view.towardStar.y).toBeCloseTo(0.8, 12);
    const light = view.scene.children.find((c) => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    // A Sun-like star gives white light
    expect(light.color.r).toBeCloseTo(1, 1);
    expect(light.color.b).toBeGreaterThan(0.8);
  });

  it("fades in over 400 ms", () => {
    const view = new PlanetView(planet, star, towardStar, true, 1000);
    expect(view.opacity).toBe(0);
    view.update(1000 + FADE_IN_MS / 2);
    expect(view.opacity).toBeCloseTo(0.5, 12);
    view.update(1000 + FADE_IN_MS);
    expect(view.opacity).toBe(1);
    view.update(1000 + 10 * FADE_IN_MS);
    expect(view.opacity).toBe(1);
  });

  it("appears at once when the viewer prefers reduced motion", () => {
    const view = new PlanetView(planet, star, towardStar, false, 1000);
    expect(view.opacity).toBe(1);
    view.update(1000);
    expect(view.opacity).toBe(1);
  });

  it("frees its own geometry and material, and leaves objects others added", () => {
    const view = new PlanetView(planet, star, towardStar, false, 0);
    const globe = view.scene.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const freed: string[] = [];
    globe.geometry.addEventListener("dispose", () => freed.push("geometry"));
    (globe.material as THREE.Material).addEventListener("dispose", () => freed.push("material"));

    const borrowed = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    borrowed.geometry.addEventListener("dispose", () => freed.push("borrowed"));
    view.scene.add(borrowed);   // as the renderer lends it the night sky

    view.dispose();
    expect(freed.sort()).toEqual(["geometry", "material"]);
  });
});
