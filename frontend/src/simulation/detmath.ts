// Deterministic math.
//
// Why it exists: JavaScript's Math.exp, Math.log, Math.pow, Math.sin and
// Math.cos are not required to be correctly rounded, and engines implement
// them differently. A universe seed could therefore produce a different
// universe in Chrome and in Firefox. Every calculation that decides an outcome
// uses these functions instead (Worlds-Up-Close-Revision-1.md, R1).
//
// How it works: ports of the fdlibm algorithms (Sun Microsystems, 1993; the
// basis of most engines' own Math functions). They use only +, −, ×, ÷, whose
// results IEEE 754 fixes exactly, plus exact reads and writes of a double's
// exponent bits through a big-endian DataView. The same inputs give
// bit-identical outputs in every engine.
//
// Accuracy: exp, log, sin and cos are within 1 ulp of the true value. pow(x, y)
// is computed as exp(y·log x), so its relative error grows with |y·ln x|: about
// 1e-15 when |y·ln x| < 10, and under 1e-13 when |y·ln x| < 700. Integer powers
// up to 64 use repeated multiplication. None of this is correctly rounded.
//
// Limits: sin and cos reduce their argument with a three-part π/2, which is
// accurate for |x| < 2^19·π/2 (about 823,550). Larger arguments throw rather
// than return a silently wrong answer; no simulation angle comes close.
//
// Rendering and the galaxy particle cloud keep using Math.*: they never feed
// back into the simulation. A lint rule keeps the non-exact Math functions
// out of simulation/.

// ── Exact access to a double's bits ───────────────────────────────────────────

const bits = new DataView(new ArrayBuffer(8));

function highWord(x: number): number {
  bits.setFloat64(0, x);
  return bits.getInt32(0);
}

function withHighWord(x: number, high: number): number {
  bits.setFloat64(0, x);
  bits.setInt32(0, high);
  return bits.getFloat64(0);
}

/** 2^n for an integer n in [-1022, 1023], built from its exponent bits. */
function powerOfTwo(n: number): number {
  bits.setInt32(0, (n + 1023) << 20);
  bits.setInt32(4, 0);
  return bits.getFloat64(0);
}

/** y · 2^k, exact unless the result is subnormal. */
function scaleByPowerOfTwo(y: number, k: number): number {
  if (k > 1023) return y * powerOfTwo(k - 1023) * powerOfTwo(1023);
  if (k < -1022) return y * powerOfTwo(k + 1000) * powerOfTwo(-1000);
  return y * powerOfTwo(k);
}

// ── exp (fdlibm e_exp.c) ──────────────────────────────────────────────────────

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+00;
const EXP_OVERFLOW = 7.09782712893383973096e+02;
const EXP_UNDERFLOW = -7.45133219101941108420e+02;
const P1 = 1.66666666666666019037e-01;
const P2 = -2.77777777770155933842e-03;
const P3 = 6.61375632143793436117e-05;
const P4 = -1.65339022054652515390e-06;
const P5 = 4.13813679705723846039e-08;

/** e^x. */
export function exp(x: number): number {
  if (x !== x) return x;
  if (x > EXP_OVERFLOW) return Infinity;
  if (x < EXP_UNDERFLOW) return 0;

  const hx = highWord(x) & 0x7fffffff;
  const negative = x < 0;
  let hi = 0;
  let lo = 0;
  let k = 0;

  // Reduce x to r = x − k·ln2 with |r| ≤ ln2/2, carrying ln2 in two parts
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      hi = negative ? x + LN2_HI : x - LN2_HI;
      lo = negative ? -LN2_LO : LN2_LO;
      k = negative ? -1 : 1;
    } else {
      k = (INV_LN2 * x + (negative ? -0.5 : 0.5)) | 0;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }

  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - ((lo - (x * c) / (2 - c)) - hi);
  return scaleByPowerOfTwo(y, k);
}

// ── log (fdlibm e_log.c) ──────────────────────────────────────────────────────

const TWO_54 = 1.80143985094819840000e+16;
const LG1 = 6.666666666666735130e-01;
const LG2 = 3.999999999940941908e-01;
const LG3 = 2.857142874366239149e-01;
const LG4 = 2.222219843214978396e-01;
const LG5 = 1.818357216161805012e-01;
const LG6 = 1.531383769920937332e-01;
const LG7 = 1.479819860511658591e-01;

/** Natural logarithm. */
export function log(x: number): number {
  let hx = highWord(x);
  let k = 0;

  if (hx < 0x00100000) {
    if (x === 0) return -Infinity;
    if (x < 0 || x !== x) return NaN;
    k -= 54;                        // subnormal: scale up into the normal range
    x *= TWO_54;
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;   // +Infinity or NaN

  // Write x = 2^k · m with m in [√2/2, √2), then log x = k·ln2 + log m
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  x = withHighWord(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  const dk = k;

  if ((0x000fffff & (2 + hx)) < 3) {    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO;
    const r = f * f * (0.5 - 0.3333333333333333 * f);
    return k === 0 ? f - r : dk * LN2_HI - ((r - dk * LN2_LO) - f);
  }

  // log(1+f) = 2s + s·R(s²), with s = f / (2 + f)
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const r = t2 + t1;
  if (((hx - 0x6147a) | (0x6b851 - hx)) > 0) {
    const halfFSquared = 0.5 * f * f;
    return k === 0
      ? f - (halfFSquared - s * (halfFSquared + r))
      : dk * LN2_HI - ((halfFSquared - (s * (halfFSquared + r) + dk * LN2_LO)) - f);
  }
  return k === 0 ? f - s * (f - r) : dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f);
}

// ── pow ───────────────────────────────────────────────────────────────────────

const MAX_MULTIPLIED_POWER = 64;

/** x^y for finite x and y, following Math.pow's results for zero, negative and NaN inputs. */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;

  if (Number.isInteger(y) && Math.abs(y) <= MAX_MULTIPLIED_POWER) {
    let result = 1;
    let base = x;
    for (let e = Math.abs(y); e > 0; e = Math.floor(e / 2)) {
      if (e % 2 === 1) result *= base;
      base *= base;
    }
    return y < 0 ? 1 / result : result;
  }

  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    const magnitude = exp(y * log(-x));
    return y % 2 === 0 ? magnitude : -magnitude;
  }
  return exp(y * log(x));
}

// ── sin and cos (fdlibm s_sin.c, s_cos.c, k_sin.c, k_cos.c, e_rem_pio2.c) ─────

const INV_PIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00;    // first 33 bits of π/2
const PIO2_1T = 6.07710050650619224932e-11;   // π/2 − PIO2_1
const PIO2_2 = 6.07710050630396597660e-11;    // next 33 bits
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;    // next 33 bits
const PIO2_3T = 8.47842766036889956997e-32;
const MAX_REDUCIBLE_HIGH_WORD = 0x413921fb;   // |x| ≈ 2^19·π/2

/** Reduce x to y0 + y1 in [−π/4, π/4] and return the quadrant n, with x = n·π/2 + y0 + y1. */
function reduceQuarterTurns(x: number, out: [number, number]): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix > MAX_REDUCIBLE_HIGH_WORD) {
    throw new RangeError(`detmath: angle ${x} is too large to reduce accurately`);
  }

  const t = Math.abs(x);
  const n = (t * INV_PIO2 + 0.5) | 0;
  const fn = n;
  let r = t - fn * PIO2_1;
  let w = fn * PIO2_1T;
  let y0 = r - w;

  // If the first subtraction cancelled many bits, subtract the next parts of π/2
  const exponent = ix >> 20;
  if (exponent - ((highWord(y0) >> 20) & 0x7ff) > 16) {
    let before = r;
    w = fn * PIO2_2;
    r = before - w;
    w = fn * PIO2_2T - ((before - r) - w);
    y0 = r - w;
    if (exponent - ((highWord(y0) >> 20) & 0x7ff) > 49) {
      before = r;
      w = fn * PIO2_3;
      r = before - w;
      w = fn * PIO2_3T - ((before - r) - w);
      y0 = r - w;
    }
  }
  const y1 = (r - y0) - w;

  if (hx < 0) {
    out[0] = -y0;
    out[1] = -y1;
    return -n;
  }
  out[0] = y0;
  out[1] = y1;
  return n;
}

const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08;
const S6 = 1.58969099521155010221e-10;

/** sin(x + y) for |x + y| ≤ π/4, where y is the tail of a reduced argument. */
function kernelSin(x: number, y: number, hasTail: boolean): number {
  if ((highWord(x) & 0x7fffffff) < 0x3e400000) return x;   // |x| < 2^-27
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (!hasTail) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-02;
const C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09;
const C6 = -1.13596475577881948265e-11;

/** cos(x + y) for |x + y| ≤ π/4, where y is the tail of a reduced argument. */
function kernelCos(x: number, y: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return 1;                            // |x| < 2^-27
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));   // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : withHighWord(0, ix - 0x00200000);
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

const reduced: [number, number] = [0, 0];

/** Sine of an angle in radians. */
export function sin(x: number): number {
  if ((highWord(x) & 0x7fffffff) <= 0x3fe921fb) return kernelSin(x, 0, false);   // |x| ≤ π/4
  if (!Number.isFinite(x)) return NaN;
  switch (reduceQuarterTurns(x, reduced) & 3) {
    case 0:  return kernelSin(reduced[0], reduced[1], true);
    case 1:  return kernelCos(reduced[0], reduced[1]);
    case 2:  return -kernelSin(reduced[0], reduced[1], true);
    default: return -kernelCos(reduced[0], reduced[1]);
  }
}

/** Cosine of an angle in radians. */
export function cos(x: number): number {
  if ((highWord(x) & 0x7fffffff) <= 0x3fe921fb) return kernelCos(x, 0);          // |x| ≤ π/4
  if (!Number.isFinite(x)) return NaN;
  switch (reduceQuarterTurns(x, reduced) & 3) {
    case 0:  return kernelCos(reduced[0], reduced[1]);
    case 1:  return -kernelSin(reduced[0], reduced[1], true);
    case 2:  return -kernelCos(reduced[0], reduced[1]);
    default: return kernelSin(reduced[0], reduced[1], true);
  }
}
