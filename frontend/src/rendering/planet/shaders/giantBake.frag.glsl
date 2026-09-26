// Giant bake (Worlds Up Close A7): a giant planet's banded cloud tops, worked
// out once into the cube atlas (cubeFaces.ts), like a solid planet's surface
// (globeBake.frag.glsl), and drawn every frame by globe.frag.glsl. Prefixed with
// simplexNoise.glsl and the cube atlas GLSL; GLSL 3, writing the same two
// textures: albedo (square-rooted colour; no glint) and relief (no tilt, no
// separate clouds, and in alpha the glow of a hot giant).
//
// Bands: zones and belts along latitude, more of them the faster the planet
// spins (bandCount, globe.ts), bent by turbulence and streaked along longitude.
// Palette by cloud-top temperature, after Sudarsky's classes (owner decision):
//   below ~150 K   methane haze, blue (ice-giant look), faint bands
//   ~150–400 K     ammonia clouds: cream zones, brown belts
//   ~400–900 K     no clouds condense: clear, deep azure, faint bands
//   above ~1,000 K alkali-metal absorption: dark, with a glowing night side
// Storms: up to three ovals, placed from the VISUAL stream.

layout(location = 0) out vec4 albedoOut;
layout(location = 1) out vec4 reliefOut;

uniform float temperatureK;     // cloud-top temperature
uniform float bandCount;        // zones and belts, pole to pole
uniform vec3 noiseOffset;       // from the planet's VISUAL stream
uniform vec4 storms[3];         // latitude, longitude (radians), size (radians), 1 if present

const float PI = 3.141592653589793;

// Palettes: zone and belt colours, linear, and how strongly the bands show
const vec3 METHANE_ZONE = vec3(0.30, 0.52, 0.72);
const vec3 METHANE_BELT = vec3(0.20, 0.40, 0.64);
const vec3 AMMONIA_ZONE = vec3(0.76, 0.66, 0.50);
const vec3 AMMONIA_BELT = vec3(0.44, 0.29, 0.17);
const vec3 CLOUDLESS_ZONE = vec3(0.06, 0.30, 0.55);   // greener than it looks: tone mapping pushes saturated blue towards violet
const vec3 CLOUDLESS_BELT = vec3(0.04, 0.21, 0.45);
const vec3 ALKALI_ZONE = vec3(0.075, 0.06, 0.07);
const vec3 ALKALI_BELT = vec3(0.04, 0.035, 0.045);
// Where one palette gives way to the next, K
const vec2 METHANE_TO_AMMONIA = vec2(130.0, 170.0);
const vec2 AMMONIA_TO_CLOUDLESS = vec2(380.0, 450.0);
const vec2 CLOUDLESS_TO_ALKALI = vec2(850.0, 1000.0);
// Storm colours on each palette
const vec3 METHANE_STORM = vec3(0.06, 0.14, 0.34);   // dark spot
const vec3 AMMONIA_STORM = vec3(0.55, 0.22, 0.11);   // red spot
const vec3 CLOUDLESS_STORM = vec3(0.55, 0.62, 0.75); // pale high cloud
const vec3 ALKALI_STORM = vec3(0.14, 0.09, 0.08);

// A hot giant's own light: none below ~900 K, then rising as T⁴, full at GLOW_REFERENCE_K
const vec2 GLOW_ONSET_K = vec2(900.0, 1100.0);
const float GLOW_REFERENCE_K = 2500.0;

const float TURBULENCE = 0.05;        // radians of latitude the bands bend by
const float STREAKS = 0.18;

float fbm3(vec3 p) {
  vec3 unused;
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * snoiseGradient(p, unused);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  vec3 faceU;
  vec3 p = atlasDirection(gl_FragCoord.xy, faceU);
  float latitude = asin(clamp(p.y, -1.0, 1.0));
  float longitude = atan(p.z, p.x);

  // Bands, bent by turbulence and streaked along longitude
  float bent = latitude + TURBULENCE * fbm3(p * 4.0 + noiseOffset);
  float phase = bent * bandCount;
  float band = 0.5 + 0.5 * sin(phase);
  vec3 unused;
  float streak = snoiseGradient(vec3(p.x * 3.0, bent * bandCount * 3.0, p.z * 3.0) + noiseOffset.zxy, unused);
  float bandShade = 0.88 + 0.24 * fract(sin(floor(phase / PI) * 12.9898 + noiseOffset.x) * 43758.5453);

  float toAmmonia = smoothstep(METHANE_TO_AMMONIA.x, METHANE_TO_AMMONIA.y, temperatureK);
  float toCloudless = smoothstep(AMMONIA_TO_CLOUDLESS.x, AMMONIA_TO_CLOUDLESS.y, temperatureK);
  float toAlkali = smoothstep(CLOUDLESS_TO_ALKALI.x, CLOUDLESS_TO_ALKALI.y, temperatureK);
  vec3 zone = mix(mix(mix(METHANE_ZONE, AMMONIA_ZONE, toAmmonia), CLOUDLESS_ZONE, toCloudless), ALKALI_ZONE, toAlkali);
  vec3 belt = mix(mix(mix(METHANE_BELT, AMMONIA_BELT, toAmmonia), CLOUDLESS_BELT, toCloudless), ALKALI_BELT, toAlkali);
  vec3 stormColour = mix(mix(mix(METHANE_STORM, AMMONIA_STORM, toAmmonia), CLOUDLESS_STORM, toCloudless), ALKALI_STORM, toAlkali);

  vec3 albedo = mix(belt, zone, band) * bandShade * (1.0 + STREAKS * streak);

  // Storms: ovals twice as long as they are tall, with a swirl inside
  for (int i = 0; i < 3; i++) {
    vec4 storm = storms[i];
    if (storm.w < 0.5) continue;
    float dLongitude = mod(longitude - storm.y + PI, 2.0 * PI) - PI;
    vec2 offset = vec2(dLongitude * cos(storm.x) / 2.0, latitude - storm.x) / storm.z;
    float distance = length(offset);
    float swirl = 0.5 + 0.5 * sin(distance * 9.0 - atan(offset.y, offset.x) * 2.0);
    float inside = 1.0 - smoothstep(0.75, 1.0, distance);
    albedo = mix(albedo, stormColour * (0.85 + 0.3 * swirl), inside);
  }

  float glow = smoothstep(GLOW_ONSET_K.x, GLOW_ONSET_K.y, temperatureK)
             * clamp(pow(temperatureK / GLOW_REFERENCE_K, 4.0), 0.0, 1.0) * (0.75 + 0.25 * band);

  albedoOut = vec4(sqrt(clamp(albedo, 0.0, 1.0)), 0.0);
  reliefOut = vec4(0.5, 0.5, 0.0, glow);
}
