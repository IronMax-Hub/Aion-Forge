// Globe bake (Worlds Up Close A5): works out a solid planet's surface once,
// into an atlas of the six cube faces (cubeFaces.ts), so the globe drawn every
// frame only reads it back (globe.frag.glsl). Prefixed with simplexNoise.glsl
// and the cube atlas GLSL; GLSL 3, writing two textures:
//   albedo  surface colour (square root, so 8 bits keep the dark oceans smooth)
//           and, in alpha, how much of the star's glint open water reflects
//   relief  the surface normal in the planet's own frame, tilted by the relief
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

const float PI = 3.141592653589793;

// Detail noise
const float DETAIL_FREQUENCY = 3.0;   // lowest octave: about three features per radian
const int DETAIL_OCTAVES = 6;
const float DETAIL_CONTRAST = 3.0;    // fBm mostly stays within ±0.3; this stretches it to about ±1
const float COAST_SHIFT = 0.45;       // below 0.5, so no cell centre ever changes side
const float RELIEF_NOISE_KM = 1.2;
const float ICE_EDGE_NOISE_K = 3.0;   // wobble of the freeze line
const float MAX_TILT = 0.6;           // steepest the exaggerated relief may tilt a normal

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

vec2 mapCoordinates(vec3 p) {
  float latitude = asin(clamp(p.y, -1.0, 1.0));
  float longitude = atan(p.z, p.x);
  return vec2(longitude / (2.0 * PI) + 0.5, latitude / PI + 0.5);
}

void main() {
  vec3 p = atlasDirection(gl_FragCoord.xy);
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
  ground *= 0.85 + 0.3 * (0.5 + 0.5 * strong);
  vec3 land = mix(ground, SNOW, frozen * wetness);

  float depthKm = max(0.0, -heightKm);
  vec3 sea = mix(mix(SHALLOW_WATER, DEEP_WATER, smoothstep(0.0, 4.0, depthKm)), SEA_ICE, frozen);

  vec3 albedo = mix(land, sea, water);

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
  vec3 normalLocal = normalize(p - tilt);

  albedoOut = vec4(sqrt(albedo), water * (1.0 - frozen));
  reliefOut = vec4(normalLocal * 0.5 + 0.5, 1.0);
}
