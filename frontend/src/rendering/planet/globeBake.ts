// Globe bake (Worlds Up Close A5, A7): shades a planet once, into the atlas the
// globe is drawn from every frame: a solid planet's surface from its surface map
// (globeBake.frag.glsl), or a giant's cloud bands (giantBake.frag.glsl).
//
// Why it exists: the surface shading (6-octave noise with its gradient, soil,
// ice and ocean colours, relief) cost 30–110 ms per frame over a planet on the
// older GPUs Aion Forge must run on. Baked once, each frame only reads two
// textures. The bake runs a strip of a cube face per frame (24 in the planet view), during
// the glide towards the planet, so it never stalls the browser for long: the
// whole bake took ~0.8 s on a GeForce 210, ~35 ms a strip.
//
// The system view shows many planets at once, each a few dozen pixels across,
// so it bakes them coarser (SYSTEM_DETAIL): 256-texel faces (a quarter of the
// texels), a 256 × 128 surface map (a quarter of the CPU work) and one octave
// of detail noise fewer (the sixth is finer than a 256-texel face can hold).
//
// The atlas: 6 faces of FACE_SIZE² texels plus borders (cubeFaces.ts), in two
// RGBA8 textures: albedo (square-rooted colour, glint share) and relief (tilt
// of the normal, cloud density for the cloud sphere, glow). Both have mipmaps
// for distant views.
//
// Presentation only: it reads what the planet is and never writes to the simulation.

import * as THREE from "three";
import { FREEZING_K } from "../../simulation/climate";
import type { Vegetation } from "./life";
import type { SurfaceMapData } from "./surfaceMap";
import { surfaceMapTexture, SURFACE_MAP_HEIGHT, SURFACE_MAP_WIDTH } from "./surfaceMap";
import { PLANET_ATLAS, cubeAtlas } from "./cubeFaces";
import type { CubeAtlas } from "./cubeFaces";
import simplexNoise from "./shaders/simplexNoise.glsl?raw";
import bakeVertex from "./shaders/globeBake.vert.glsl?raw";
import surfaceFragment from "./shaders/globeBake.frag.glsl?raw";
import giantFragment from "./shaders/giantBake.frag.glsl?raw";

const FACE_COUNT = 6;

/** How finely a globe is baked, and in how many pieces. */
export interface BakeDetail {
  atlas: CubeAtlas;
  /** The surface map's size, texels (surfaceMap.ts). */
  mapWidth: number;
  mapHeight: number;
  /** Octaves of the solid surface's detail noise. */
  detailOctaves: number;
  /** Strips each face is baked in, one per frame: ~17–35 ms each on a GeForce 210. */
  stripsPerFace: number;
}

/** The planet view: one planet filling the screen. */
export const PLANET_DETAIL: BakeDetail = {
  atlas: PLANET_ATLAS, mapWidth: SURFACE_MAP_WIDTH, mapHeight: SURFACE_MAP_HEIGHT, detailOctaves: 6, stripsPerFace: 4,
};

/** The system view: many planets, each small on screen. */
export const SYSTEM_DETAIL: BakeDetail = {
  atlas: cubeAtlas(256), mapWidth: 256, mapHeight: 128, detailOctaves: 5, stripsPerFace: 2,
};

/** What a solid planet's bake draws with, besides the surface map. */
export interface SurfaceBakeInputs {
  /** 0–1: how much of frozen land is snow. */
  wetness: number;
  /** Where the detail noise is sampled from (the planet's VISUAL stream). */
  noiseOffset: THREE.Vector3Tuple;
  /** Relief exaggeration per km of elevation, in planet radii. */
  bumpScale: number;
  /** Where the cloud pattern is sampled from (the planet's VISUAL stream). */
  cloudOffset: THREE.Vector3Tuple;
  /** 0–1: share of the sky thick air clouds over, whatever the moisture (atmosphere.ts). */
  overcast: number;
  /** Water's boiling point under the planet's air, K. */
  boilingK: number;
  /** Life's tint (A9); null on a lifeless planet. */
  vegetation: Vegetation | null;
}

/** A storm on a giant: where it sits and how large it is, radians. */
export interface GiantStorm {
  latitude: number;
  longitude: number;
  size: number;
}

/** What a giant's bake draws with. */
export interface GiantBakeInputs {
  /** Cloud-top temperature, K. */
  temperatureK: number;
  /** Zones and belts, pole to pole. */
  bandCount: number;
  /** Where the turbulence and streaks are sampled from (the planet's VISUAL stream). */
  noiseOffset: THREE.Vector3Tuple;
  storms: GiantStorm[];
}

const MAX_STORMS = 3;

export class GlobeBake {
  /** textures[0]: albedo; textures[1]: relief. */
  readonly target: THREE.WebGLRenderTarget;
  private readonly owned: THREE.Texture[];
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private stripsDone = 0;
  readonly atlas: CubeAtlas;
  private readonly stripsPerFace: number;

  /** A solid planet's surface, from its surface map (built at the detail's map size). */
  static surface(surfaceMap: SurfaceMapData, inputs: SurfaceBakeInputs, detail: BakeDetail = PLANET_DETAIL): GlobeBake {
    const map = surfaceMapTexture(surfaceMap);
    return new GlobeBake(detail, surfaceFragment, {
      surfaceMap: { value: map },
      noiseOffset: { value: new THREE.Vector3(...inputs.noiseOffset) },
      wetness: { value: inputs.wetness },
      freezingK: { value: FREEZING_K },
      bumpScale: { value: inputs.bumpScale },
      cloudOffset: { value: new THREE.Vector3(...inputs.cloudOffset) },
      overcast: { value: inputs.overcast },
      vegetationCover: { value: inputs.vegetation?.cover ?? 0 },
      vegetationColour: { value: inputs.vegetation?.colour.clone() ?? new THREE.Color(0, 0, 0) },
      boilingK: { value: inputs.boilingK },
    }, [map]);
  }

  /** A giant's cloud bands. */
  static giant(inputs: GiantBakeInputs, detail: BakeDetail = PLANET_DETAIL): GlobeBake {
    const storms = Array.from({ length: MAX_STORMS }, (_, i) => {
      const storm = inputs.storms[i];
      return storm ? new THREE.Vector4(storm.latitude, storm.longitude, storm.size, 1) : new THREE.Vector4(0, 0, 0, 0);
    });
    return new GlobeBake(detail, giantFragment, {
      temperatureK: { value: inputs.temperatureK },
      bandCount: { value: inputs.bandCount },
      noiseOffset: { value: new THREE.Vector3(...inputs.noiseOffset) },
      storms: { value: storms },
    }, []);
  }

  /** @param owned textures the bake uses and frees once it is done */
  private constructor(detail: BakeDetail, fragment: string, uniforms: Record<string, THREE.IUniform>, owned: THREE.Texture[]) {
    this.atlas = detail.atlas;
    this.stripsPerFace = detail.stripsPerFace;
    this.target = new THREE.WebGLRenderTarget(detail.atlas.width, detail.atlas.height, {
      count: 2,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      generateMipmaps: true,    // three rebuilds them after each face; cheap next to the shading
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    for (const texture of this.target.textures) texture.colorSpace = THREE.NoColorSpace;
    this.target.scissorTest = true;

    this.owned = owned;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: bakeVertex,
      fragmentShader: simplexNoise + detail.atlas.glsl + fragment,
      defines: { DETAIL_OCTAVES: detail.detailOctaves },
      uniforms,
      depthTest: false,
      depthWrite: false,
    }));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get done(): boolean {
    return this.stripsDone === FACE_COUNT * this.stripsPerFace;
  }

  get albedo(): THREE.Texture {
    return this.target.textures[0];
  }

  get relief(): THREE.Texture {
    return this.target.textures[1];
  }

  /** Bakes the next strip of a face; after the last, frees what the bake used. */
  step(renderer: THREE.WebGLRenderer): void {
    if (this.done) return;
    const [x, y, width, height] = this.atlas.faceTile(Math.floor(this.stripsDone / this.stripsPerFace));
    const strip = this.stripsDone % this.stripsPerFace;
    const top = y + Math.round((strip * height) / this.stripsPerFace);
    const bottom = y + Math.round(((strip + 1) * height) / this.stripsPerFace);
    this.target.scissor.set(x, top, width, bottom - top);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    this.stripsDone++;
    if (this.done) this.releaseBakeResources();
    renderer.setRenderTarget(previous);
  }

  /** Bakes every strip that is left. */
  finish(renderer: THREE.WebGLRenderer): void {
    while (!this.done) this.step(renderer);
  }

  private releaseBakeResources(): void {
    for (const texture of this.owned) texture.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }

  dispose(): void {
    if (!this.done) this.releaseBakeResources();
    this.target.dispose();
  }
}
