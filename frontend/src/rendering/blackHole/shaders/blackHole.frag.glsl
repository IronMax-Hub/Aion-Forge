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
// own differential rotation (inner gas orbits faster), slowed for display. In a thin
// disc that shear has wound them into trailing spirals, and rounder clumps make the
// gas uneven: brighter knots, and thin patches the light behind shows through.
// The sky behind is the host galaxy's own starlight seen from its centre (galaxyGlow),
// so lensing bends something at every pixel, not only where a star happens to lie.

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
uniform float galaxyKind;       // the host galaxy, whose stars fill the sky: 0 spiral, 1 elliptical, 2 irregular
uniform mat3 galaxyFrame;       // its axes (columns: longest, middle, pole), at a seeded tilt to the disc's
uniform float pixelAngle;       // radians per traced pixel, so the faintest stars never shrink below one

varying vec2 vUv;

// Set per quality level by BlackHoleView (quality.ts): MAX_STEPS, STEP_SCALE (step length
// per r(r − 0.9): finer where paths bend most), MIN_STEP, MAX_STEP, STREAK_OCTAVES and
// STAR_SIZE (the stars' width as a share of one that covers a half-resolution pixel).
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
// A step whose glow (before its shift and streaks, which multiply it by at most about 19)
// is below this adds less than a millionth of full brightness: its costly shift and streak
// noise are skipped. Most of a ray's steps lie in gas this thin, far from the plane or
// beyond HOT_FLOW_OUTER, and the light lost is far below one step of the screen's brightness.
const float HOT_FLOW_NEGLIGIBLE = 5e-8;
// Thin disc structure: Keplerian shear winds clumps into trailing spirals, φ + k·ln r constant
// (k = 4: a pitch of about 14°); rounder clumps, about as long round the orbit as across it,
// vary the gas's opacity and brightness
const float FILAMENT_WINDING = 4.0;
const float CLUMP_CELLS_PER_TURN = 20.0;
const float CLUMP_OPACITY_LOW = 0.35;    // in the thinnest patches the light behind shows through
const float CLUMP_OPACITY_HIGH = 1.2;
const float CLUMP_BRIGHT_LOW = 0.6;
const float CLUMP_BRIGHT_HIGH = 1.35;
// The host galaxy's starlight, as seen from its centre (linear, before exposure)
const float SPIRAL_GLOW = 0.03;
const float SPIRAL_BAND_WIDTH = 0.16;    // sine of the band's half-height above the galaxy's plane
const float SPIRAL_DUST_WIDTH = 0.035;   // the dark dust lane along its middle
const float SPIRAL_DUST_DEPTH = 0.7;
const float ELLIPTICAL_GLOW = 0.016;
const vec3 ELLIPTICAL_AXES = vec3(1.0, 0.75, 0.55);   // longest, middle, along the pole
const float IRREGULAR_GLOW = 0.026;
// The faintest star layer: many stars, each at least this many traced pixels wide (its light kept the same)
const float FAINT_STAR_MIN_PIXELS = 0.7;
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

// Value noise that repeats every `period` cells along x (a whole number): laid around
// a circle, it closes on itself, so the angle's wrap from +π to −π leaves no seam
float valueNoiseWrapX(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, period);
  float x1 = mod(i.x + 1.0, period);
  return mix(mix(hash12(vec2(x0, i.y)), hash12(vec2(x1, i.y)), u.x),
             mix(hash12(vec2(x0, i.y + 1.0)), hash12(vec2(x1, i.y + 1.0)), u.x), u.y);
}

// Streaks: noise stretched along the orbit (φ) and fine across it (log r). Each octave
// doubles the cells around a turn, and the noise repeats after exactly one turn.
const float STREAK_CELLS_PER_TURN = 6.0;
float streaks(float r, float phi) {
  vec2 p = vec2(phi * STREAK_CELLS_PER_TURN / (2.0 * PI), log(r) * 14.0) + seed * 97.0;
  float cellsPerTurn = STREAK_CELLS_PER_TURN;
  float n = 0.0, amp = 0.5;
  for (int i = 0; i < STREAK_OCTAVES; i++) {
    n += amp * valueNoiseWrapX(p, cellsPerTurn);
    p = p * vec2(2.0, 2.3) + 7.1;
    cellsPerTurn *= 2.0;
    amp *= 0.5;
  }
  return n;
}

// Value noise in three dimensions, for patterns laid over the whole sky
float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x);
  float b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x);
  float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x);
  float d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

// Clouds over the sky, in [0, 1]: star clouds and dust in the host galaxy
float skyClouds(vec3 dir) {
  vec3 p = dir * 4.0 + vec3(seed * 53.0, seed.x * 29.0);
  float n = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++) {
    n += amp * valueNoise3(p);
    p = p * 2.03 + 5.3;
    amp *= 0.5;
  }
  return n / 0.875;
}

// Clumps in a thin disc, in [0, 1]: two octaves of round cells, wound like the filaments
float clumps(float r, float phi) {
  float cellsPerRadian = CLUMP_CELLS_PER_TURN / (2.0 * PI);
  vec2 p = vec2((phi + FILAMENT_WINDING * log(r)) * cellsPerRadian, log(r) * cellsPerRadian) + seed.yx * 61.0;
  float n = 0.65 * valueNoiseWrapX(p, CLUMP_CELLS_PER_TURN)
          + 0.35 * valueNoiseWrapX(p * 2.0 + 3.7, 2.0 * CLUMP_CELLS_PER_TURN);
  return smoothstep(0.25, 0.75, n);
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

// The host galaxy's own starlight, seen from its centre, where the black hole sits
vec3 galaxyGlow(vec3 dir) {
  vec3 local = vec3(dot(dir, galaxyFrame[0]), dot(dir, galaxyFrame[1]), dot(dir, galaxyFrame[2]));
  float clouds = skyClouds(dir);
  if (galaxyKind < 0.5) {
    // Spiral: its disc, seen from inside, is a band round the whole sky, split by a dust lane
    float h = local.z;
    float band = exp(-h * h / (SPIRAL_BAND_WIDTH * SPIRAL_BAND_WIDTH));
    float dust = 1.0 - SPIRAL_DUST_DEPTH * exp(-h * h / (SPIRAL_DUST_WIDTH * SPIRAL_DUST_WIDTH)) * smoothstep(0.3, 0.7, clouds);
    return blackbody(5600.0) * SPIRAL_GLOW * band * dust * (0.6 + 0.8 * clouds);
  }
  if (galaxyKind < 1.5) {
    // Elliptical: a smooth glow, deepest (so brightest) along its longest axis
    float depth = inversesqrt(dot(local / ELLIPTICAL_AXES, local / ELLIPTICAL_AXES));
    return blackbody(4300.0) * ELLIPTICAL_GLOW * depth * depth * depth * (0.85 + 0.3 * clouds);
  }
  // Irregular: patchy clouds of young stars
  return blackbody(7500.0) * IRREGULAR_GLOW * (0.15 + smoothstep(0.45, 0.8, clouds));
}

// The sky: the host galaxy's glow and three layers of stars, from the galaxy's seed
vec3 sky(vec3 dir) {
  vec3 colour = vec3(0.0016, 0.0012, 0.0009) * (0.6 + 0.4 * valueNoise(dir.xz * 3.0 + seed)) + galaxyGlow(dir);
  for (int layer = 0; layer < 3; layer++) {
    // Bright, middle and faint stars: the faint layer is the commonest
    float density = layer == 0 ? 90.0 : (layer == 1 ? 260.0 : 200.0);
    float threshold = layer == 2 ? 0.6 : 0.88;
    vec3 p = dir * density;
    vec3 cell = floor(p);
    float h = hash13(cell + seed.x * 131.0 + float(layer) * 17.0);
    if (h > threshold) {
      vec3 star = cell + 0.5 + (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 4.1)) - 0.5) * 0.6;
      float d = length(p - star);
      // At standard, wide enough to cover a pixel of the half-resolution trace, so no star breaks into dots
      float baseSize = layer == 0 ? 0.2 * STAR_SIZE : (layer == 1 ? 0.3 * STAR_SIZE : 0.25);
      float brightness = (h - threshold) / (1.0 - threshold) * (layer == 0 ? 0.5 : (layer == 1 ? 0.18 : 0.06));
      float size = baseSize;
      if (layer == 2) {
        // The faint stars never shrink below a pixel, which would make them flicker; their light stays the same
        size = clamp(FAINT_STAR_MIN_PIXELS * pixelAngle * density, baseSize, 0.45);
        brightness *= (baseSize * baseSize) / (size * size);
      }
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
      float dt = clamp(STEP_SCALE * r * (r - 0.9), MIN_STEP, MAX_STEP);
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
              float phi = rotatedPhi(p, rp);
              float n = streaks(rp, phi + FILAMENT_WINDING * log(rp));   // wound into trailing spirals
              float clump = clumps(rp, phi);
              float outerFade = 1.0 - smoothstep(DISC_OUTER * 0.45, DISC_OUTER * 1.3, rp);
              float innerFade = smoothstep(DISC_INNER, DISC_INNER * 1.08, rp);
              float opacity = clamp((0.55 + 0.8 * n) * mix(CLUMP_OPACITY_LOW, CLUMP_OPACITY_HIGH, clump) * outerFade * innerFade, 0.0, 1.0);
              // brightness ∝ (g·T)⁴, as a share of the disc's peak
              float brightness = pow(g * tShare, 4.0) * (0.55 + 0.9 * n) * mix(CLUMP_BRIGHT_LOW, CLUMP_BRIGHT_HIGH, clump);
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
          float glow = HOT_FLOW_GLOW * density * dt;
          if (glow > HOT_FLOW_NEGLIGIBLE) {
            float g = shiftFactor(pm, max(rm, 1.05), -normalize(vel));
            float n = 0.6 + 0.8 * streaks(rm, rotatedPhi(pm, rm));
            light += (1.0 - covered) * glow * g * g * g * n * vec3(1.0, 0.42, 0.1);
          }
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
