# v18 Baseline (Phase 0 of the Fixing Plan)

Measured 31 October 2026 on `black-hole-render` at `1294752` (simulation code identical to `583ad8b`), simulation rules **v18**, before any fix in `Documents/Fixing-Plan-2026-11.md`.

Why it exists: Batch A changes what every seed generates. These numbers are the "before" that each fix is compared against, so every change in the universe is a measured decision.

## What was measured, and how to repeat it

| Measurement | Command (from `frontend/`) | Result |
|---|---|---|
| Test suite | `npx vitest run` | **60 files, 665 tests, all pass** (300 s) |
| Scientific probes | `PROBE_OUT=../Documents/baseline-v18 npm run probes` | `probes.md`, `probes.json` here (about 20 s) |
| Universe statistics | `npm run stats` | The `2026-10-31 · rules v18` entry in `Documents/stats.md`: 18 universes in 250 s. Its "+ uncommitted changes" was this baseline's documents and probe script; the simulation code was unchanged. |

`npm run probes` (`frontend/stats/probes.ts`) is new. It re-runs the earlier audit's probes (A1–A4 in `Documents/Scientific-Audit-2026-10.md`) as one repeatable script. It asserts nothing; it measures. It stays out of `npm test`.

## Headline numbers (the problems Batch A must move)

| Finding | v18 value | Target after Batch A |
|---|---|---|
| Stars above 8 M☉ (S1) | 10.1 % | ≈ 0.7 % at birth (Kroupa), far less today |
| Stars below 0.5 M☉ (S1) | 26.8 % | ≈ 70–75 % |
| Brightest / widest giant (S3) | 4.2 × 10⁹ L☉ / 669 AU (132 giants wider than 5 AU) | ≲ 10⁶ L☉ / ≲ 10 AU |
| Earth twin at Venus's orbit, 0.72 AU (C1) | 320 K, keeps its oceans | Runaway: oceans lost |
| Runaway sets in (C1) | between 0.5 and 0.6 AU | ≈ 0.95–1.0 AU |
| Hottest world (C2) | 8,540 K (lava world, seed 42) | Physically bounded |
| Twin at 1.37 AU at 10 / 20 / 40 steps per Gyr (C3) | 312 K ocean / 254 K snowball / 246 K snowball | The same outcome at every step size |
| Twin at 1.3 AU at 10 / 20 / 40 steps per Gyr (C3) | 232 K snowball / 304 K ocean / 234 K snowball | The same outcome at every step size |
| Solid planets above 2.04 M⊕ (P1) | 30.3 % (261 below 3 g/cm³) | 0: they become envelope worlds |
| Hot Jupiters in 250 systems (P2) | 0 | A few |
| Ever-wet worlds with life (L1) | 80.5 % | Not a target: labelled as an assumption |

## Agreement with the earlier audit

Every probe matches the earlier audit's reported values: class shares, mass shares, giant extremes, the 320 K Venus-orbit twin, the 312 K / 246 K step-size split, and all A4 planet numbers. The one difference is the hottest lava world, **8,540 K here against 8,007 K reported**. That is probably a different temperature field (planet `temperature` here); either way, the finding stands.

Two further observations from the step-size probe:
- The divergence is worse than the audit described. At 1.3 AU, 20 steps per Gyr gives a warm ocean while both 10 and 40 give a snowball. The outcome does not converge as the step shrinks, so it flips between neighbouring orbits and step sizes. That points to limit cycles (CO₂ build-up, then deglaciation) being sampled at arbitrary phases, as the audit suspected (C3).
- 10 and 20 steps per Gyr already differ at 1.0 AU (290 K versus 287 K, with first ice). 20 and 40 agree there and at 1.2 AU. The temperate band looks converged by 20 steps; the cold edge does not.
