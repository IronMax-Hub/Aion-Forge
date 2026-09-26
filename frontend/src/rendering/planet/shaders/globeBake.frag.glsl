// Globe bake (Worlds Up Close A5): works out a solid planet's surface once,
// into an atlas of the six cube faces (cubeFaces.ts), so the globe drawn every
// frame only reads it back (globe.frag.glsl). Prefixed with simplexNoise.glsl
// and the cube atlas GLSL; GLSL 3, writing two textures:
//   albedo  surface colour (square root, so 8 bits keep the dark oceans smooth)
//           and, in alpha, how much of the star's glint open water reflects
//   relief  RG: the relief's tilt of the surface normal (cube atlas GLSL,
//           encodeTilt); B: cloud density (A6), which the cloud sphere reads;
//           A: glow of molten ground (A7), 0–1
//
// Molten ground (A7) follows local temperature, with no special case by planet
// type (owner decision): from ~900 K rock darkens to basalt and cracks open,
// wider and brighter the hotter it is, so a lava world glows all over and a hot
// day side or substellar point can glow on its own. Condensation clouds cannot
// form over ground that hot (owner decision), so they fade out from 900 to 1,100 K.
//
// Vegetation (A9) grows where the simulation counts the surface habitable:
// liquid-water temperatures, on land where it is moist enough, and in shallow seas.
// Its cover and pigment come from the biosphere and the star (life.ts).
//
// The map carries the simulation's present day: R elevation above sea level
// (km), G temperature (K), B moisture (0–1), A submerged (1 under water). The
// detail noise only works within limits on top of it: it moves the coastline by
// a fraction of the way between cells and adds relief of about a kilometre, so
// every continent keeps the shape the simulation gave it.

layout(location = 0) out vec4 albedoOut;
layout(location = 1) out vec4 reliefOut;

uniform sampler2D surfaceMap;
uniform vec3 noiseOffset;       // from the planet's VISUAL stream
uniform float wetness;          // 0–1: how much of frozen land is snow
uniform float freezingK;
uniform float bumpScale;        // relief exaggeration per km of elevation, in planet radii
uniform vec3 cloudOffset;       // from the planet's VISUAL stream
uniform float overcast;         // 0–1: share of the sky a thick atmosphere clouds over (atmosphere.ts)
uniform float vegetationCover;  // 0–1: cover of the most habitable ground; 0 without life (life.ts)
uniform vec3 vegetationColour;  // pigment, linear
uniform float boilingK;         // water's boiling point under the planet's air

const float PI = 3.141592653589793;

// Detail noise
const float DETAIL_FREQUENCY = 3.0;   // lowest octave: about three features per radian
const int DETAIL_OCTAVES = 6;
const float DETAIL_CONTRAST = 3.0;    // fBm mostly stays within ±0.3; this stretches it to about ±1
const float COAST_SHIFT = 0.45;       // below 0.5, so no cell centre ever changes side
const float RELIEF_NOISE_KM = 1.2;
const float ICE_EDGE_NOISE_K = 3.0;   // wobble of the freeze line
const float MAX_TILT = 0.6;           // steepest the exaggerated relief may tilt a normal

// Molten ground (A7)
const float MOLTEN_FROM_K = 900.0;
const float MOLTEN_FULL_K = 1300.0;
const vec3 BASALT = vec3(0.035, 0.03, 0.028);
const float CRACK_FREQUENCY = 9.0;
const vec2 CRACK_WIDTH = vec2(0.03, 0.12);     // share of the ridge that glows, cool to fully molten
const float GLOW_REFERENCE_K = 2000.0;         // glow is 1 here, and falls as T⁴ below it
const vec2 MAGMA_SEA_K = vec2(1500.0, 2200.0); // beyond cracks, the whole ground starts to glow
const float MAGMA_SEA_GLOW = 0.25;             // that glow, against the cracks' 1
const vec2 CLOUDS_GONE_K = vec2(900.0, 1100.0);

// Clouds (A6): cover follows moisture, which already rises with warmth and falls away from open water
const float CLOUD_COVER_PER_MOISTURE = 0.65;   // warm open ocean: about two-thirds cloud, as on Earth
const float CLOUD_FREQUENCY = 2.5;
const vec3 CLOUD_STRETCH = vec3(1.0, 2.5, 1.0); // finer north–south than east–west: clouds streak along latitudes
const int CLOUD_OCTAVES = 4;
const float CLOUD_CONTRAST = 1.8;
const float CLOUD_EDGE = 0.15;                 // softness of cloud edges, in cover

// Vegetation (A9)
// Moisture over land reaches ~0.5 at a coast and halves every cell inland, so cover
// saturates early: bare below the first value, full from the second
const vec2 VEGETATION_MOISTURE = vec2(0.02, 0.25);
const float SHELF_KM = 0.2;         // seas this shallow let light reach the bottom: continental shelves
const float SEA_COVER = 0.5;        // floating and seabed life tints the water at most this much
const float SEA_PIGMENT = 0.35;     // pigment seen through water is darker

// Surface colours, linear
const vec3 DRY_SOIL = vec3(0.42, 0.30, 0.17);
const vec3 MOIST_SOIL = vec3(0.16, 0.11, 0.07);
const vec3 COLD_ROCK = vec3(0.20, 0.19, 0.18);
const vec3 HOT_ROCK = vec3(0.40, 0.17, 0.08);
const vec3 SCORCHED_ROCK = vec3(0.08, 0.065, 0.06);
const vec3 HIGHLAND_ROCK = vec3(0.30, 0.28, 0.26);
const vec3 SHALLOW_WATER = vec3(0.02, 0.10, 0.14);
const vec3 DEEP_WATER = vec3(0.004, 0.018, 0.06);
const vec3 SEA_ICE = vec3(0.70, 0.78, 0.85);
const vec3 SNOW = vec3(0.85, 0.87, 0.90);

// fBm of simplex noise, and its gradient (per unit of p) from the noise's own derivatives
float fbm(vec3 p, out vec3 gradient) {
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  float scale = 1.0;
  gradient = vec3(0.0);
  for (int i = 0; i < DETAIL_OCTAVES; i++) {
    vec3 octaveGradient;
    sum += amplitude * snoiseGradient(p, octaveGradient);
    gradient += amplitude * scale * octaveGradient;
    total += amplitude;
    p *= 2.0;
    scale *= 2.0;
    amplitude *= 0.5;
  }
  gradient /= total;
  return sum / total;
}

float cloudNoise(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  vec3 unused;
  for (int i = 0; i < CLOUD_OCTAVES; i++) {
    sum += amplitude * snoiseGradient(p, unused);
    total += amplitude;
    p *= 2.0;
    amplitude *= 0.5;
  }
  return sum / total;
}

/** Cloud density 0–1: a cloud pattern thresholded so it covers the local cover share. */
float cloudDensity(vec3 p, float moisture) {
  float cover = max(clamp(CLOUD_COVER_PER_MOISTURE * moisture, 0.0, 1.0), overcast);
  float pattern = 0.5 + 0.5 * clamp(CLOUD_CONTRAST * cloudNoise(p * CLOUD_STRETCH * CLOUD_FREQUENCY + cloudOffset), -1.0, 1.0);
  float density = (1.0 - smoothstep(cover - CLOUD_EDGE, cover + CLOUD_EDGE, pattern)) * smoothstep(0.0, 0.05, cover);
  return max(density, overcast);
}

/** Ridges of simplex noise, 0–1, sharpest (1) along thin lines: the crack network. */
float cracks(vec3 p) {
  vec3 unused;
  float coarse = 1.0 - abs(snoiseGradient(p * CRACK_FREQUENCY + noiseOffset.yzx, unused));
  float fine = 1.0 - abs(snoiseGradient(p * CRACK_FREQUENCY * 2.3 + noiseOffset.zxy, unused));
  return max(coarse, 0.85 * fine);
}

vec2 mapCoordinates(vec3 p) {
  float latitude = asin(clamp(p.y, -1.0, 1.0));
  float longitude = atan(p.z, p.x);
  return vec2(longitude / (2.0 * PI) + 0.5, latitude / PI + 0.5);
}

void main() {
  vec3 faceU;
  vec3 p = atlasDirection(gl_FragCoord.xy, faceU);
  // East and north along the map, except at its poles, where any tangent pair does
  vec3 east = normalize(cross(p, abs(p.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));   // longitude rises
  vec3 north = cross(east, p);                                                                        // latitude rises

  vec2 uv = mapCoordinates(p);
  vec4 surface = texture(surfaceMap, uv);
  vec3 detailGradient;
  float detail = fbm(p * DETAIL_FREQUENCY + noiseOffset, detailGradient);
  float heightKm = surface.r + RELIEF_NOISE_KM * detail;
  float strong = clamp(DETAIL_CONTRAST * detail, -1.0, 1.0);

  // Water where the submerged share, nudged by the detail, is past half
  float submerged = surface.a + COAST_SHIFT * strong;
  float edge = fwidth(submerged);
  float water = smoothstep(0.5 - edge, 0.5 + edge, submerged);

  // Frozen below the freeze line: water turns to ice, land to snow as far as the planet is wet
  float temperatureK = surface.g + ICE_EDGE_NOISE_K * strong;
  float frozen = smoothstep(freezingK + 1.5, freezingK - 1.5, temperatureK);

  // Bare ground: soil from dry to moist, grey rock in the cold and on highlands, red and then dark in the heat
  vec3 ground = mix(DRY_SOIL, MOIST_SOIL, surface.b);
  ground = mix(ground, COLD_ROCK, smoothstep(freezingK + 15.0, freezingK - 15.0, surface.g));
  ground = mix(ground, HOT_ROCK, smoothstep(330.0, 500.0, surface.g));
  ground = mix(ground, SCORCHED_ROCK, smoothstep(600.0, 1000.0, surface.g));
  ground = mix(ground, HIGHLAND_ROCK, smoothstep(1.5, 5.0, heightKm));
  float molten = smoothstep(MOLTEN_FROM_K, MOLTEN_FULL_K, surface.g);
  ground = mix(ground, BASALT, smoothstep(MOLTEN_FROM_K - 150.0, MOLTEN_FROM_K + 100.0, surface.g));
  ground *= 0.85 + 0.3 * (0.5 + 0.5 * strong);
  float liquid = smoothstep(freezingK - 1.5, freezingK + 1.5, temperatureK) * (1.0 - smoothstep(boilingK - 5.0, boilingK, temperatureK));
  ground = mix(ground, vegetationColour, vegetationCover * liquid * smoothstep(VEGETATION_MOISTURE.x, VEGETATION_MOISTURE.y, surface.b));
  vec3 land = mix(ground, SNOW, frozen * wetness);

  float depthKm = max(0.0, -heightKm);
  vec3 sea = mix(SHALLOW_WATER, DEEP_WATER, smoothstep(0.0, 4.0, depthKm));
  sea = mix(sea, vegetationColour * SEA_PIGMENT, vegetationCover * SEA_COVER * liquid * (1.0 - smoothstep(0.0, SHELF_KM, depthKm)));
  sea = mix(sea, SEA_ICE, frozen);

  vec3 albedo = mix(land, sea, water);

  // Glow of molten ground: along the cracks, and over all of it once hot enough
  float crack = smoothstep(1.0 - mix(CRACK_WIDTH.x, CRACK_WIDTH.y, molten), 1.0, cracks(p));
  float heat = clamp(pow(surface.g / GLOW_REFERENCE_K, 4.0), 0.0, 1.0);
  float glow = molten * heat * max(crack, MAGMA_SEA_GLOW * smoothstep(MAGMA_SEA_K.x, MAGMA_SEA_K.y, surface.g)) * (1.0 - water);

  // Relief: the slope of the land, km per radian, east and north: the map's from its
  // neighbouring texels (a quarter texel away; slopes between neighbouring pixels
  // would show the steps the GPU filters in), the detail's from the noise's gradient
  vec2 texel = 0.25 / vec2(textureSize(surfaceMap, 0));
  float mapEast = (texture(surfaceMap, uv + vec2(texel.x, 0.0)).r - surface.r) / (texel.x * 2.0 * PI * max(sqrt(1.0 - p.y * p.y), 0.05));
  float mapNorth = (texture(surfaceMap, uv + vec2(0.0, texel.y)).r - surface.r) / (texel.y * PI);
  vec2 slopeKm = vec2(mapEast, mapNorth)
               + RELIEF_NOISE_KM * DETAIL_FREQUENCY * vec2(dot(detailGradient, east), dot(detailGradient, north));
  vec3 slope = slopeKm.x * east + slopeKm.y * north;
  vec3 tilt = bumpScale * (1.0 - water) * (1.0 - frozen * wetness * 0.7) * slope;
  tilt *= min(1.0, MAX_TILT / max(length(tilt), 1e-6));
  float clouds = cloudDensity(p, surface.b) * (1.0 - smoothstep(CLOUDS_GONE_K.x, CLOUDS_GONE_K.y, surface.g));

  albedoOut = vec4(sqrt(albedo), water * (1.0 - frozen));
  reliefOut = vec4(encodeTilt(p, faceU, tilt), clouds, glow);
}
