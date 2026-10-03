// The air in the shaders (PF4): what gets through it, the sky's light from the
// sky table, and the haze between the camera and a point. Prepended to the
// sky, ground and water shaders. chapman() and the table mappings repeat
// scattering.ts; keep them the same. Lengths in m, positions in the body
// frame about the planet's centre (the camera's own position is cameraBody).

uniform float planetRadius;
uniform vec3 rayleighScattering;   // at the ground, per m, red, green, blue
uniform vec3 ozoneAbsorption;      // at the ground, per m; ozone follows the air, so it shares the Rayleigh columns
uniform float rayleighHeight;      // scale height, m
uniform float mieScattering;
uniform float mieHeight;
uniform float mieAsymmetry;
uniform vec3 cameraBody;           // the camera, m from the planet's centre
uniform vec3 cameraUp;
uniform vec3 sunDirection;
uniform vec3 sunIrradiance;        // the star's light at the planet, before the air
uniform sampler2D skyRayleigh;     // the sky table (scattering.ts): Rayleigh and Mie light before phase
uniform sampler2D skyMie;
uniform sampler2D skyMultiple;     // and light scattered more than once, which has no phase
uniform vec2 skySize;              // columns, rows
uniform float skyHorizon;          // the zenith angle the table's rows are packed around
uniform sampler2D skyLight;        // the light table: the sky's light on level ground, by the star's height
uniform float skyLightSize;

const float ATMOSPHERE_PI = 3.141592653589793;

// e^(y²)·erfc(y) for y ≥ 0 (scattering.ts: ERFCX_A, ERFCX_B)
float erfcx(float y) {
  const float a = 0.344;
  const float b = 1.0 / (ATMOSPHERE_PI * a * a);
  return 1.0 / (sqrt(ATMOSPHERE_PI) * ((1.0 - a) * y + a * sqrt(y * y + b)));
}

float chapman(float X, float h, float mu) {
  float x = X + h;
  float up = sqrt(0.5 * ATMOSPHERE_PI * x) * erfcx(sqrt(0.5 * x) * abs(mu)) * exp(-h);
  if (mu >= 0.0) return up;
  float x0 = sqrt(1.0 - mu * mu) * x;
  return 2.0 * sqrt(0.5 * ATMOSPHERE_PI * x0) * exp(X - x0) - up;
}

// Air crossed from point p to space along unit d, as Rayleigh and Mie columns (m at ground density)
vec2 columnsToSpace(vec3 p, vec3 d) {
  float r = length(p);
  float mu = dot(p, d) / r;
  float h = max(r - planetRadius, 0.0);
  return vec2(
    rayleighHeight * chapman(planetRadius / rayleighHeight, h / rayleighHeight, mu),
    mieHeight * chapman(planetRadius / mieHeight, h / mieHeight, mu));
}

vec3 transmittanceOf(vec2 columns) {
  return exp(-((rayleighScattering + ozoneAbsorption) * columns.x + mieScattering * columns.y));
}

// What gets through from p to the star: none where the planet is in the way
vec3 sunTransmittance(vec3 p) {
  float r = length(p);
  float mu = dot(p, sunDirection) / r;
  if (mu < 0.0 && r * sqrt(1.0 - mu * mu) < planetRadius) return vec3(0.0);
  return transmittanceOf(columnsToSpace(p, sunDirection));
}

// Air crossed between a and b. Each half of the segment either side of its
// lowest point is measured upwards (columnsToSpace's first branch), so no
// large columns through the far side of the planet are subtracted.
vec2 columnsBetween(vec3 a, vec3 b) {
  vec3 d = b - a;
  float len = length(d);
  if (len < 1e-3) return vec2(0.0);
  d /= len;
  float lowest = -dot(a, d);
  if (lowest <= 0.0) return max(columnsToSpace(a, d) - columnsToSpace(b, d), 0.0);
  if (lowest >= len) return max(columnsToSpace(b, -d) - columnsToSpace(a, -d), 0.0);
  vec3 p = a + d * lowest;
  return max(columnsToSpace(p, -d) - columnsToSpace(a, -d), 0.0) + max(columnsToSpace(p, d) - columnsToSpace(b, d), 0.0);
}

float rayleighPhase(float c) {
  return 3.0 / (16.0 * ATMOSPHERE_PI) * (1.0 + c * c);
}

float miePhase(float c) {
  float g = mieAsymmetry;
  return (1.0 - g * g) / (4.0 * ATMOSPHERE_PI * pow(1.0 + g * g - 2.0 * g * c, 1.5));
}

// The sky table's coordinates for a direction seen from the camera (scattering.ts: rowOfZenith)
vec2 skyUv(vec3 d) {
  float mu = clamp(dot(d, cameraUp), -1.0, 1.0);
  float zenith = acos(mu);
  float row = zenith < skyHorizon
    ? 0.5 * (1.0 - sqrt(1.0 - zenith / skyHorizon))
    : 0.5 + 0.5 * sqrt((zenith - skyHorizon) / (ATMOSPHERE_PI - skyHorizon));
  vec3 a = d - cameraUp * mu;
  vec3 s = sunDirection - cameraUp * dot(sunDirection, cameraUp);
  float lengths = sqrt(dot(a, a) * dot(s, s));
  float phi = lengths > 1e-9 ? acos(clamp(dot(a, s) / lengths, -1.0, 1.0)) : 0.0;
  float column = phi / ATMOSPHERE_PI;
  return (vec2(column, row) * (skySize - 1.0) + 0.5) / skySize;
}

// The sky's light along a direction from the camera, to space or the sea-level sphere
vec3 skyRadiance(vec3 d) {
  vec2 uv = skyUv(d);
  float c = dot(d, sunDirection);
  return sunIrradiance * (rayleighPhase(c) * texture2D(skyRayleigh, uv).rgb + miePhase(c) * texture2D(skyMie, uv).rgb
    + texture2D(skyMultiple, uv).rgb);
}

// The sky's light on level ground with the star at zenith cosine mu
vec3 skyLightOn(float mu) {
  float u = ((mu * 0.5 + 0.5) * (skyLightSize - 1.0) + 0.5) / skyLightSize;
  return texture2D(skyLight, vec2(u, 0.5)).rgb;
}

// The air between the camera and a point p: what gets through, and the light it adds.
// The light added is the sky's along that direction (which runs to space or the
// sea-level sphere) in the share the stretch to p dims as much as the whole ray.
void hazeTo(vec3 p, out vec3 through, out vec3 added) {
  through = transmittanceOf(columnsBetween(cameraBody, p));
  vec3 d = normalize(p - cameraBody);
  float r = length(cameraBody);
  float b = dot(cameraBody, d);
  float inner = b * b - (r * r - planetRadius * planetRadius);
  vec3 whole = inner > 0.0 && -b - sqrt(inner) > 0.0
    ? transmittanceOf(columnsBetween(cameraBody, cameraBody + d * (-b - sqrt(inner))))
    : transmittanceOf(columnsToSpace(cameraBody, d));
  vec3 share = clamp((1.0 - through) / max(1.0 - whole, vec3(1e-6)), 0.0, 1.0);
  added = skyRadiance(d) * share;
}
