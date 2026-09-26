import { describe, it, expect } from "vitest";
import { exp, log, pow, sin, cos } from "../simulation/detmath";
import { createRNG } from "../simulation/rng";

const ULP_OF_ONE = 2 ** -52;
const bitsView = new DataView(new ArrayBuffer(8));
function hexBits(x: number): string {
  bitsView.setFloat64(0, x);
  return bitsView.getBigUint64(0).toString(16).padStart(16, "0");
}

function relativeError(actual: number, expected: number): number {
  return expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected);
}

/** Largest relative error against Math.* over n seeded inputs. */
function worstError(n: number, input: (r: () => number) => number[], ours: (...a: number[]) => number, reference: (...a: number[]) => number): number {
  const rng = createRNG(20260926);
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const args = input(rng);
    worst = Math.max(worst, relativeError(ours(...args), reference(...args)));
  }
  return worst;
}

// Every engine must produce exactly these bits. They are the output of this
// implementation, pinned; a failure in any browser means a non-deterministic
// operation crept in. Inputs cover each code path: tiny arguments, range
// reduction, subnormals, overflow edges and every quadrant.
const GOLDEN: Record<string, [number[], string][]> = {
  exp: [
    [[1e-10], "3ff000000006df38"], [[0.3], "3ff599058c8c1a96"], [[-0.3], "3fe7b4c869c37c05"],
    [[0.5], "3ffa61298e1e069c"], [[1], "4005bf0a8b14576a"], [[-1], "3fd78b56362cef38"],
    [[2.5], "40285d6fd931e0bb"], [[-7.25], "3f47455fe323fafe"], [[10], "40d5829dcf950560"],
    [[88.7], "47ef4705bbffae5c"], [[709.7], "7fed75ae7a50ee14"], [[-744], "0000000000000002"],
  ],
  log: [
    [[1e-310], "c0864e69394d9508"], [[0.00001], "c027069e2aa2aa5b"], [[0.5], "bfe62e42fefa39ef"],
    [[0.999999], "beb0c6f82d74d230"], [[1.000001], "3eb0c6f713f33a1d"], [[1.5], "3fd9f323ecbf984c"],
    [[2], "3fe62e42fefa39ef"], [[2.718281828459045], "3ff0000000000000"], [[10], "40026bb1bbb55516"],
    [[123456.789], "40277281cad8a844"], [[1e300], "4085963447f87fb5"],
  ],
  pow: [
    [[10, -1.75], "3f9235a71c5ee5cb"], [[10, 1.75], "404c1df80dec17b0"], [[0.5, 2.5], "3fc6a09e667f3bcc"],
    [[1.2, 3.5], "3ffe497015e6c831"], [[45, 3.5], "4122a7aa2aacb888"], [[0.3, 0.6], "3fdf13f63c03331e"],
    [[5772, 0.25], "40216ebd530f25c0"], [[7.5, -0.1332], "3fe877b647d30db6"], [[2, 10], "4090000000000000"],
    [[3, -3], "3fa2f684bda12f68"], [[-2, 3], "c020000000000000"], [[0.9, 0.7], "3fedb9900d983dd4"],
  ],
  sin: [
    [[1e-9], "3e112e0be826d695"], [[0.5], "3fdeaee8744b05f0"], [[0.7853981633974483], "3fe6a09e667f3bcc"],
    [[1], "3feaed548f090cee"], [[1.5707963267948966], "3ff0000000000000"], [[2], "3fed18f6ead1b446"],
    [[3.141592653589793], "3ca1a62633145c07"], [[4], "bfe837b9dddc1eae"], [[-5], "3feeaf81f5e09933"],
    [[6.5], "3fcb890d40c6cb3c"], [[100], "bfe03425b78c4db8"], [[12345.678], "bfe687d5890974a5"],
  ],
  cos: [
    [[1e-9], "3ff0000000000000"], [[0.25], "3fef01549f7deea1"], [[0.5], "3fec1528065b7d50"],
    [[0.7853981633974483], "3fe6a09e667f3bcd"], [[1], "3fe14a280fb5068c"], [[1.5707963267948966], "3c91a62633145c07"],
    [[2], "bfdaa22657537205"], [[3.141592653589793], "bff0000000000000"], [[4], "bfe4eaa606db24c1"],
    [[-5], "3fd22785706b4ad9"], [[100], "3feb981dbf665fdf"], [[12345.678], "3fe6b94c3bbe24b8"],
  ],
};

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  exp, log, sin, cos, pow: (x, y) => pow(x, y),
};

describe("detmath golden bit patterns", () => {
  for (const [name, cases] of Object.entries(GOLDEN)) {
    it(`${name} gives the pinned bits for every input`, () => {
      for (const [args, expected] of cases) expect(`${args}: ${hexBits(FUNCTIONS[name](...args))}`).toBe(`${args}: ${expected}`);
    });
  }
});

describe("detmath accuracy against Math.*", () => {
  it("exp is within 2 ulp across [-700, 700]", () => {
    expect(worstError(20_000, (r) => [(r() - 0.5) * 1400], exp, Math.exp)).toBeLessThanOrEqual(2 * ULP_OF_ONE);
  });

  it("exp is within 2 ulp near zero, where the simulation uses it most", () => {
    expect(worstError(20_000, (r) => [(r() - 0.5) * 20], exp, Math.exp)).toBeLessThanOrEqual(2 * ULP_OF_ONE);
  });

  it("log is within 2 ulp from 1e-300 to 1e300", () => {
    expect(worstError(20_000, (r) => [10 ** ((r() - 0.5) * 600)], log, Math.log)).toBeLessThanOrEqual(2 * ULP_OF_ONE);
  });

  it("log is within 2 ulp just around 1", () => {
    expect(worstError(20_000, (r) => [1 + (r() - 0.5) * 1e-3], log, Math.log)).toBeLessThanOrEqual(2 * ULP_OF_ONE);
  });

  it("pow is within 1e-14 for the ranges the simulation uses (|y·ln x| < 20)", () => {
    const worst = worstError(20_000, (r) => [0.01 + r() * 200, (r() - 0.5) * 7], pow, Math.pow);
    expect(worst).toBeLessThan(1e-14);
  });

  it("sin and cos are within 1 ulp of 1 in absolute terms for |x| < 1000", () => {
    const rng = createRNG(7);
    for (let i = 0; i < 20_000; i++) {
      const x = (rng() - 0.5) * 2000;
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThanOrEqual(ULP_OF_ONE);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThanOrEqual(ULP_OF_ONE);
    }
  });
});

describe("detmath identities and special values", () => {
  it("keeps exp and log inverse to each other", () => {
    // An ulp of error in log x becomes |log x| ulps after exp, so the bound scales with it
    for (const x of [1e-8, 0.3, 1, 7, 1e5]) {
      expect(relativeError(exp(log(x)), x)).toBeLessThanOrEqual(2 * (1 + Math.abs(Math.log(x))) * ULP_OF_ONE);
    }
  });

  it("keeps sin² + cos² = 1", () => {
    for (const x of [-10, -1, 0, 0.1, 1, 2, 3, 50]) expect(Math.abs(sin(x) ** 2 + cos(x) ** 2 - 1)).toBeLessThan(4 * ULP_OF_ONE);
  });

  it("matches Math on the special values the simulation could meet", () => {
    expect(exp(0)).toBe(1);
    expect(exp(1000)).toBe(Infinity);
    expect(exp(-1000)).toBe(0);
    expect(exp(-Infinity)).toBe(0);
    expect(exp(NaN)).toBeNaN();
    expect(log(1)).toBe(0);
    expect(log(0)).toBe(-Infinity);
    expect(log(-1)).toBeNaN();
    expect(log(Infinity)).toBe(Infinity);
    expect(pow(7, 0)).toBe(1);
    expect(pow(0, 2.5)).toBe(0);
    expect(pow(0, -2.5)).toBe(Infinity);
    expect(pow(-8, 0.5)).toBeNaN();
    expect(pow(-2, 65)).toBeLessThan(0);   // odd integer power of a negative base
    expect(pow(-2, 66)).toBeGreaterThan(0);
    expect(pow(1, 12.34)).toBe(1);
    expect(sin(0)).toBe(0);
    expect(Object.is(sin(-0), -0)).toBe(true);
    expect(cos(0)).toBe(1);
    expect(sin(Infinity)).toBeNaN();
  });

  it("computes integer powers by exact multiplication", () => {
    expect(pow(2, 10)).toBe(1024);
    expect(pow(10, 3)).toBe(1000);
    expect(pow(1.5, 2)).toBe(2.25);
    expect(pow(2, -2)).toBe(0.25);
  });

  it("refuses angles too large to reduce accurately instead of returning a wrong value", () => {
    expect(() => sin(1e7)).toThrow(RangeError);
    expect(() => cos(-1e7)).toThrow(RangeError);
  });
});
