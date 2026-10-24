// Black hole close-up: traces each pixel's light backwards from the camera
// through the curved space around a non-spinning (Schwarzschild) black hole.
//
// Units: the horizon radius r_s is 1, so the photon sphere is at 1.5 and a thin
// disc's inner edge (the innermost stable circular orbit) at 3.
//
// Light paths: in these units a photon's path obeys, exactly,
//   d²x/dλ² = −(3/2) h² x / r⁵,   h = |x × dx/dλ| (conserved),
// the Newtonian-looking form of the Schwarzschild orbit equation u'' + u = (3/2) u².
// A ray that falls inside the horizon is black (the shadow); one that escapes
// shows the sky in the direction it leaves, so the stars behind are lensed.
//
// What it sees, from the simulation (blackHole.ts):
// - Thin disc: each crossing of the disc plane between its inner edge and its
//   outer fade adds the disc's light there, so the disc's far side shows above
//   and below the shadow and thin rings of higher images hug it. The gas's
//   temperature follows Shakura–Sunyaev, peaking at peakTemperatureK. Its light
//   is shifted by g, the product of gravitational redshift and the Doppler shift
//   of gas in Keplerian orbit: the observed colour is a blackbody at g·T and its
//   brightness scales as g⁴, so the side coming towards the camera is brighter
//   and bluer. (Interstellar's Gargantua left these shifts out for the audience;
//   here they are kept.)
// - Hot flow: a faint, thick, optically thin cloud, summed along the ray. Its
//   light is mostly radio; it is drawn in warm false colour, as the Event
//   Horizon Telescope draws Sagittarius A* and M87*.
// Streaks in the gas come from noise seeded by the galaxy, sheared by the disc's
// own differential rotation (inner gas orbits faster), slowed for display.

precision highp float;

uniform vec3 cameraPosition_;   // camera, in horizon radii from the black hole
uniform mat3 cameraBasis;       // columns: right, up, backward (camera looks along −z)
uniform float tanHalfFov;
uniform float aspect;
uniform float time;             // display seconds, scaled into orbits by orbitRate
uniform float orbitRate;        // turns of the disc's inner edge per display second
uniform float thinDisc;         // 1: thin disc; 0: hot flow
uniform float peakTemperatureK;
uniform vec2 seed;              // the galaxy's, for the gas's streaks and the sky's stars

varying vec2 vUv;

const int MAX_STEPS = 220;
const float STEP_SCALE = 0.07;      // step length per r(r − 0.9): finer where paths bend most
const float MAX_STEP = 1.0;
const float DISC_INNER = 3.0;       // innermost stable circular orbit
const float DISC_OUTER = 16.0;      // the disc fades out towards here
// Beyond this radius light bends so little that the weak-field formula (weakBendTo)
// is exact enough; rays are traced step by step only inside it, where the gas is.
// Tracing the long straight stretches too would let step-count changes between
// neighbouring pixels nudge their directions, and the stars behind would break into rings.
const float TRACE_RADIUS = 24.0;
const float PI = 3.14159265;
const float MAX_GAS_SPEED = 0.7;       // as a share of light's
const float HOT_FLOW_GLOW = 14.0;      // the hot flow's emissivity at one horizon radius, display units
const float HOT_FLOW_THICKNESS = 0.45; // its height, as a share of radius
const float HOT_FLOW_OUTER = 12.0;     // it fades out by here, so it does not haze the whole view
const float DISC_EXPOSURE = 1.8;
const float HOT_FLOW_EXPOSURE = 1.6;

// ── Noise ────────────────────────────────────────────────────────────────────

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

// Streaks: noise stretched along the orbit (φ) and fine across it (log r)
float streaks(float r, float phi) {
  vec2 p = vec2(phi * 3.0 / PI, log(r) * 14.0) + seed * 97.0;
  float n = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    n += amp * valueNoise(p);
    p = p * vec2(2.0, 2.3) + 7.1;
    amp *= 0.5;
  }
  return n;
}

// ── Light ────────────────────────────────────────────────────────────────────

// Approximate sRGB-primaries colour of a blackbody, normalised to its brightest channel
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  // Both sides of each choice are kept finite: some GPUs evaluate both, and a NaN from
  // the unused side (pow or log of a negative) can leak into the result
  float hot = max(t - 60.0, 1.0);
  float r = t <= 66.0 ? 1.0 : clamp(1.293 * pow(hot, -0.1332), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.3901 * log(t) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(hot, -0.0755), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432 * log(max(t - 10.0, 1.0)) - 1.1963, 0.0, 1.0));
  // the approximation is in display (gamma) values; light adds linearly
  return pow(vec3(r, g, b), vec3(2.2));
}

// Shakura–Sunyaev temperature, as a share of its peak (which lies at r = 49/36 of the inner edge)
float discTemperatureShare(float r) {
  float x = r / DISC_INNER;
  float f = pow(x, -3.0) * (1.0 - inversesqrt(x));
  const float F_PEAK = 0.056653;   // f at x = 49/36
  return pow(max(f, 0.0) / F_PEAK, 0.25);
}

// The shift g of light from gas in circular orbit at radius r, leaving in direction `towardCamera`
float shiftFactor(vec3 p, float r, vec3 towardCamera) {
  vec3 orbitDir = normalize(vec3(-p.z, 0.0, p.x) + vec3(1e-6, 0.0, 0.0));   // the gas orbits anticlockwise seen from +y
  // its speed, to a static observer there; inside the last stable orbit gas plunges, held here below light's
  float beta = min(sqrt(0.5 / (r - 1.0)), MAX_GAS_SPEED);
  float doppler = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(orbitDir, towardCamera));
  return sqrt(1.0 - 1.0 / r) * doppler;                    // with gravity's redshift
}

// The gas's rotation angle: each ring turns at its own Keplerian rate, Ω ∝ r^−3/2
float rotatedPhi(vec3 p, float r) {
  float omega = pow(DISC_INNER / r, 1.5);
  return atan(p.z, p.x) - 2.0 * PI * orbitRate * omega * time;
}

// Weak-field bending of a near-straight ray, s along it from its closest point b to the hole:
// the deflection accrued from −∞ to s, integrated from the light-path equation, rising to 2/b.
float weakBendTo(float s, float b) {
  float r2 = s * s + b * b;
  return 1.0 / b + s * (2.0 * s * s + 3.0 * b * b) / (2.0 * b * r2 * sqrt(r2));
}

// A ray's direction, turned towards the hole by `angle`
vec3 bendToward(vec3 pos, vec3 dir, float angle) {
  vec3 offset = pos - dot(pos, dir) * dir;   // from the hole to the ray's closest point
  if (dot(offset, offset) < 1e-12) return dir;
  return normalize(dir * cos(angle) - normalize(offset) * sin(angle));
}

// The sky: a galactic core thick with stars, from the galaxy's seed
vec3 sky(vec3 dir) {
  vec3 colour = vec3(0.0016, 0.0012, 0.0009) * (0.6 + 0.4 * valueNoise(dir.xz * 3.0 + seed));
  for (int layer = 0; layer < 2; layer++) {
    float density = layer == 0 ? 90.0 : 260.0;
    vec3 p = dir * density;
    vec3 cell = floor(p);
    float h = hash13(cell + seed.x * 131.0 + float(layer) * 17.0);
    if (h > 0.88) {
      vec3 star = cell + 0.5 + (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 4.1)) - 0.5) * 0.6;
      float d = length(p - star);
      // Wide enough to cover a pixel of the half-resolution trace, so no star breaks into dots
      float size = layer == 0 ? 0.2 : 0.3;
      float brightness = (h - 0.88) / 0.12 * (layer == 0 ? 0.5 : 0.18);
      vec3 tint = blackbody(3000.0 + 9000.0 * hash13(cell + 9.9));
      colour += tint * brightness * exp(-d * d / (size * size));
    }
  }
  return colour;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dir = normalize(cameraBasis * vec3(ndc.x * tanHalfFov * aspect, ndc.y * tanHalfFov, -1.0));
  vec3 pos = cameraPosition_;
  vec3 vel = dir;
  float exposure = thinDisc > 0.5 ? DISC_EXPOSURE : HOT_FLOW_EXPOSURE;

  // Outside the trace radius, light runs nearly straight: carry it there, or past, with the weak-field bend
  float sNow = dot(pos, dir);                         // along the ray, from its closest point
  float impact = length(pos - sNow * dir);
  if (length(pos) > TRACE_RADIUS) {
    if (impact >= TRACE_RADIUS || sNow > 0.0) {
      // It never comes within the trace radius, or is already leaving: all its remaining bend, then the sky
      vec3 away = bendToward(pos, dir, 1.0 / impact * 2.0 - weakBendTo(sNow, impact));
      gl_FragColor = vec4(vec3(1.0) - exp(-sky(away) * exposure), 1.0);
      return;
    }
    float sEntry = -sqrt(TRACE_RADIUS * TRACE_RADIUS - impact * impact);
    vec3 entryDir = bendToward(pos, dir, weakBendTo(sEntry, impact) - weakBendTo(sNow, impact));
    pos += dir * (sEntry - sNow);
    vel = entryDir;
  }
  float h2 = dot(cross(pos, vel), cross(pos, vel));

  vec3 light = vec3(0.0);
  float covered = 0.0;   // how much of what lies behind is hidden by gas already met
  bool escaped = false;
  bool running = true;

  // The loop never breaks early: a flag stops each ray's work instead. Some GPU
  // drivers miscompile early exits from long loops, writing stray colours.
  for (int i = 0; i < MAX_STEPS; i++) {
    if (running) {
      float r = length(pos);
      if (r < 1.0) running = false;   // inside the horizon: the shadow
      if (r > TRACE_RADIUS && dot(pos, vel) > 0.0) { escaped = true; running = false; }
      if (covered > 0.98) running = false;

      // Smaller steps near the hole, where paths bend most
      float dt = clamp(STEP_SCALE * r * (r - 0.9), 0.015, MAX_STEP);
      // Velocity Verlet: second order, so photon-sphere orbits stay put
      float r2 = r * r;
      vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
      vec3 nextPos = pos + vel * dt + 0.5 * acc * dt * dt;
      float nr = length(nextPos);
      if (nr < 1.0) running = false;   // this step crosses the horizon; its far end would divide by nearly nothing
      if (running) {
        float nr2 = nr * nr;
        vec3 nextAcc = -1.5 * h2 * nextPos / (nr2 * nr2 * nr);
        vec3 nextVel = vel + 0.5 * (acc + nextAcc) * dt;

        if (thinDisc > 0.5) {
          // The disc lies in the plane y = 0: add its light where the ray crosses it
          if (pos.y * nextPos.y < 0.0) {
            vec3 p = mix(pos, nextPos, pos.y / (pos.y - nextPos.y));
            float rp = length(p);
            if (rp > DISC_INNER && rp < DISC_OUTER * 1.3) {
              float g = shiftFactor(p, rp, -normalize(nextVel));
              float tShare = discTemperatureShare(rp);
              float n = streaks(rp, rotatedPhi(p, rp));
              float outerFade = 1.0 - smoothstep(DISC_OUTER * 0.45, DISC_OUTER * 1.3, rp);
              float innerFade = smoothstep(DISC_INNER, DISC_INNER * 1.08, rp);
              float opacity = clamp((0.55 + 0.8 * n) * outerFade * innerFade, 0.0, 1.0);
              // brightness ∝ (g·T)⁴, as a share of the disc's peak
              float brightness = pow(g * tShare, 4.0) * (0.55 + 0.9 * n);
              vec3 emitted = blackbody(g * tShare * peakTemperatureK) * brightness;
              light += (1.0 - covered) * opacity * emitted;
              covered += (1.0 - covered) * opacity;
            }
          }
        } else {
          // Hot flow: a thick, optically thin cloud, bright close in and fading fast outwards
          // (emissivity ∝ r^−3.5), summed along the path. Its light is shifted as the
          // disc's is, and an optically thin glow brightens as g³.
          float rm = 0.5 * (r + nr);
          vec3 pm = 0.5 * (pos + nextPos);
          float height = pm.y / (HOT_FLOW_THICKNESS * rm);
          float density = exp(-height * height) / (rm * rm * rm * sqrt(rm)) * smoothstep(1.05, 1.6, rm) * (1.0 - smoothstep(HOT_FLOW_OUTER * 0.4, HOT_FLOW_OUTER, rm));
          float g = shiftFactor(pm, max(rm, 1.05), -normalize(vel));
          float n = 0.6 + 0.8 * streaks(rm, rotatedPhi(pm, rm));
          light += (1.0 - covered) * HOT_FLOW_GLOW * density * g * g * g * n * dt * vec3(1.0, 0.42, 0.1);
        }

        pos = nextPos;
        vel = nextVel;
      }
    }
  }

  // A ray still circling when the steps run out hugs the photon sphere: nearly captured, so dark
  if (escaped) {
    // Leaving the trace radius: the rest of its bend, from here to infinity
    vec3 v = normalize(vel);
    float sOut = dot(pos, v);
    float bOut = max(length(pos - sOut * v), 1e-3);   // a ray leaving straight outwards bends no more
    light += (1.0 - covered) * sky(bendToward(pos, v, 2.0 / bOut - weakBendTo(sOut, bOut)));
  }

  // Exposure and tone: bright gas saturates gently to white instead of clipping. A thin
  // disc is far brighter than a hot flow; each is exposed as an eye adapted to it would see it.
  vec3 mapped = vec3(1.0) - exp(-light * exposure);
  gl_FragColor = vec4(mapped, 1.0);   // linear; the blit to the screen encodes it
}
