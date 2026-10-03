// Clouds (PF4): one thin layer at cloudRadius, over the whole screen after the
// ground. Each pixel's view ray meets the layer at most once that counts: from
// below, where it leaves the layer's sphere; from above, where it enters. There
// the cloud map (clouds.ts) gives the margin above the clouds' level, finer
// noise of zero average roughens it, and the result sets the cloud's opacity.
//
// Light: the starlight that gets through the air to the cloud and the sky's
// light (atmosphere.glsl), on clouds of albedo cloudAlbedo. Seen from the
// star's side, a cloud is lit; from the other side, thick cloud is darker
// (UNDERSIDE: little light gets through). Then the haze between the camera
// and the cloud, cheaper than the ground's (it runs for every clouded pixel):
// what gets through, and the sky's light along the ray in the share lost.
// No shadows on the ground (later).
//
// Cost: where the map's margin is too low for the finer noise ever to make
// cloud, the pixel is dropped before the noise is worked out.
//
// Depth: the cloud's depth is written as Three.js's logarithmic depth buffer
// writes it, log2(1 + w)·logDepthBufFC/2 with w the distance along the view,
// so ground in front of the cloud hides it.

uniform sampler2D cloudMap;
uniform float cloudRadius;    // m from the planet's centre
uniform float cloudTurn;      // the clouds' drift about the pole, radians
uniform vec3 cloudOffset;     // the detail noise's offset, from the seed
uniform vec3 cameraForward;
uniform float logDepthBufFC;
uniform float nightLight;    // as the ground's
uniform float cloudAlbedo;   // clouds.ts: CLOUD_ALBEDO

varying vec3 vDirection;

// How strongly the finer noise moves the margin, and over how much margin a cloud thickens to opaque
// (margins run to about ±0.5: thin at the edges, thick in the middle of a system)
const float DETAIL = 0.2;
const float EDGE = 0.3;
// The finer noise's largest wavelength, km; each of DETAIL_LAYERS halves it
const float DETAIL_KM = 64.0;
const int DETAIL_LAYERS = 6;
const float UNDERSIDE = 0.35;
const float MAX_OPACITY = 0.97;

// A hash without sine (Hoskins), and value noise from it: about within [−1, 1]
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z) * 2.0 - 1.0;
}

float detail(vec3 km) {
  float sum = 0.0, amplitude = 0.5, wavelength = DETAIL_KM;
  for (int k = 0; k < DETAIL_LAYERS; k++) {
    sum += amplitude * valueNoise(km / wavelength + cloudOffset);
    amplitude *= 0.5;
    wavelength *= 0.5;
  }
  return sum;
}

void main() {
  vec3 d = normalize(vDirection);
  vec3 c = cameraBody;
  float r = length(c);
  float b = dot(c, d);

  // The layer's sphere: (r − R)(r + R) keeps the small difference precise
  float cc = (r - cloudRadius) * (r + cloudRadius);
  float disc = b * b - cc;
  if (disc < 0.0) discard;
  float root = sqrt(disc);
  float q = -(b + (b >= 0.0 ? root : -root));
  float t0 = min(q, cc / q), t1 = max(q, cc / q);
  float t = cc < 0.0 ? t1 : t0;
  if (t <= 0.0) discard;

  // Not through the planet
  float cg = (r - planetRadius) * (r + planetRadius);
  float dg = b * b - cg;
  if (dg > 0.0 && -b - sqrt(dg) > 0.0 && -b - sqrt(dg) < t) discard;

  vec3 p = c + d * t;
  vec3 up = normalize(p);
  float longitude = atan(-up.z, up.x) - cloudTurn;
  vec2 uv = vec2(longitude / (2.0 * ATMOSPHERE_PI) + 0.5, asin(clamp(up.y, -1.0, 1.0)) / ATMOSPHERE_PI + 0.5);
  float coarse = texture2D(cloudMap, uv).r;
  // detail() stays within about ±1
  if (coarse < -DETAIL) discard;
  float margin = coarse + DETAIL * detail(p * 0.001);
  float opacity = MAX_OPACITY * smoothstep(0.0, EDGE, margin);
  if (opacity <= 0.0) discard;

  float sunCos = dot(up, sunDirection);
  vec3 light = sunIrradiance * sunTransmittance(p) * max(sunCos, 0.0) + skyLightOn(sunCos) + nightLight;
  bool fromStarSide = (r > cloudRadius) == (sunCos > 0.0);
  float shade = fromStarSide ? 1.0 : mix(1.0, UNDERSIDE, opacity);
  vec3 colour = cloudAlbedo * light * shade / ATMOSPHERE_PI;

  vec3 through = transmittanceOf(columnsBetween(c, p));
  gl_FragColor = vec4(colour * through + skyRadiance(d) * (1.0 - through), opacity);
  gl_FragDepth = log2(1.0 + t * dot(d, cameraForward)) * logDepthBufFC * 0.5;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
