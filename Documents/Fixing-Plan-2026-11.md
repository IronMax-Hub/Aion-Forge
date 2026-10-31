# Aion Forge Fixing Plan

Date: 31 October 2026
Sources: the earlier Claude audit (`Scientific-Audit-2026-10.md`), the ChatGPT audit pack and its unified version, and my two reviews of them (`Claude-Assessment-of-ChatGPT-Audit-2026-10.md`, `Claude-Review-of-Unified-Audit-2026-10-31.md`).
Status: a plan only. No code has been changed.

---

## Principles behind the order

1. **Cheap and independent first.** The engineering fixes don't change any universe. They're quick, and they make later work safer: CI catches regressions while the bigger changes land.
2. **Changes that alter generated universes land together.** Every fix that changes what a seed generates goes into **one rules-version bump (v18 → v19)**, on its own branch, merged once. Seeds then change once, not five times.
3. **Display fixes stay separate from simulation fixes.** Rendering-only changes never touch determinism, so they don't need the bump.
4. **Measure before changing.** Before Batch A, save the v18 population and climate statistics, so every fix shows a before/after comparison.
5. **No heavy GPU runs on this PC.** I check black-hole work with a CPU copy of the ray tracer in Vitest, and you look at the visuals on the phone.
6. **Fix the errors, label the speculation.** Life, minds and civilizations are speculative by design. They get honest labels, not new numbers chosen by me.

---

## Phase 0: Baseline (about half a day)

| Step | What | Done when |
|---|---|---|
| 0.1 | Run the full test suite on `black-hole-render` and record the result (the earlier audit saw 60 files, 665 tests) | Pass count recorded |
| 0.2 | Run `npm run stats` and the earlier audit's probes, and save the outputs as the **v18 baseline**: stellar class and mass shares, giant L and R, Earth-twin climate sweep, step-size test, planet statistics for seed 42 | Saved to `Documents/baseline-v18/` |
| 0.3 | Commit the audit documents (ChatGPT pack, unified audit, my reviews, this plan) | One docs commit |

---

## Phase 1: Batch C, engineering clean-up (no universe changes, about 1–2 days)

Each item is its own small commit, with a test where one makes sense.

| # | Fix | Files | Test |
|---|---|---|---|
| C1 | Stop tracking `frontend/.vite/` and add it to `.gitignore` | `.gitignore` | — |
| C2 | Accept seed 0 on import: test for a finite non-negative integer, not truthiness | `simulation/persistence.ts:76` | Seed-0 export → import round trip |
| C3 | Limit seeds to 0…2³²−1 in the seed box and in the API schema | `App.tsx:439`, `backend/src/records.ts:6` | Accepts 0 and 2³²−1; rejects 2³² |
| C4 | Survey worker crash handling: `onerror`/`onmessageerror` fail the job, replace the worker, and end the "surveying" state | `workers/surveyPool.ts`, `surveyClient.ts` | A fake worker that throws produces one error and no hung promise |
| C5 | Cancel superseded surveys (drop queued chunks from older generations) and cap workers at 4 | same files | Rapid reseeding runs only the newest job |
| C6 | Guard the `localStorage` flag in the one-time import | `api/importLocalData.ts` | Storage that throws still loads |
| C7 | Fix the `gravityStrength` text: what it actually does is move orbits in by √g | `simulation/config.ts:7`, `ui/physics/catalogue.ts:113` | — |
| C8 | Minimal CI: frontend typecheck, lint, Vitest; backend typecheck and tests | `.github/workflows/ci.yml` | First run is green |

---

## Phase 2: Batch B, rendering and black hole (no rules bump, about 2–3 days)

| # | Fix | Files | Verification |
|---|---|---|---|
| B1 | Draw planet orbits at `effectiveOrbitAU`, so the picture matches the physics when gravity ≠ 1 | `rendering/systemLayout.ts`, `UniverseRenderer.ts:651–786` | Test: drawn radius = physics radius at g = 0.25, 1, 2 |
| B2 | **CPU reference tracer first**: copy the shader's integrator, weak-field hand-off and shift function into TypeScript, and test them against exact Schwarzschild results: critical impact parameter 3√3/2 r_s, shadow angle at finite distance, weak-field deflection 2r_s/b, β = 0.5 at the ISCO | `rendering/blackHole/traceReference.ts` (new) + test | Shows the current 1.5 % / 9.5 % shadow error before any fix |
| B3 | Camera rays start in a **static observer's** frame: map the screen angle ψ to the coordinate angle with tan α = tan ψ / √(1−1/r) | `blackHole.frag.glsl:296–299` and the CPU copy | The B2 shadow test passes at 6, 10, 34 and 120 r_s |
| B4 | Doppler direction converted into the local static frame before `shiftFactor` (radial part × 1/√f, then renormalised) | `blackHole.frag.glsl:199–206, 333, 358` | Exact shift for approaching, receding and face-on emitters in the CPU copy |
| B5 | Disc peak temperature from Shakura–Sunyaev (≈1.5×10⁵ K at 10⁸ M☉, λ = 1, η ≈ 0.057), with the derivation in the comment | `simulation/blackHole.ts:65` | Reference-value test. This number is shown in the UI but doesn't feed any other system, so no rules bump is needed |
| B6 | Mark the Newtonian disc profile and the 40,000 K colour clamp as deliberate approximations | shader comments, physics page | — |
| B7 | **Phone check** of the black hole at Standard/Medium/High, after B3–B5 | APK | You compare screenshots before and after |

---

## Phase 3: Batch A, simulation rules v19 (one branch, one bump, about 1–2 weeks)

Branch: `galaxy-planet-validation`, which ChatGPT already created and which is still identical to the audited code. After each step, compare against the v18 baseline. The version number changes only at the end.

### A1: Climate (the most important; it decides habitability and life)
| # | Fix | Where |
|---|---|---|
| A1.1 | **Runaway-greenhouse limit**: when absorbed flux exceeds the water-vapour radiation limit (~280 W/m², Goldblatt 2013 / Kopparapu 2013), the planet enters a runaway and loses its oceans, instead of staying temperate | `climate.ts`, `worldHistory.ts` |
| A1.2 | **Maximum greenhouse**: cap CO₂ warming (the Kopparapu outer edge), and give steam atmospheres a physically bounded temperature instead of 8,000 K | `climate.ts` |
| A1.3 | **Step-size convergence**: smaller steps around ice and runaway transitions, so the 1.37 AU twin ends the same at 100, 50 and 25 Myr steps. This must stay deterministic. | `worldHistory.ts:122` (`STEPS_PER_GYR`) |
| Tests | The Earth twin's inner edge lands near 0.95–1.0 AU; Venus-orbit twin goes runaway; nothing exceeds the bound; three step sizes agree |

### A2: Stars
| # | Fix | Where |
|---|---|---|
| A2.1 | **Kroupa IMF** by inverse CDF over 0.08–100 M☉, replacing `MASS_DRAW` | `star.ts:38–48` |
| A2.2 | **Formation times** from a constant star-formation rate over the galaxy's age. Stars older than their lifespan become remnants, and keep their remnant mass | `star.ts:592–623` |
| A2.3 | Ignition threshold reshapes the IMF smoothly, with no clamp pile-up | `star.ts:604` |
| A2.4 | Giant luminosity depends on mass, with a cap (no 670 AU giants); remnant luminosity follows L = 4πR²σT⁴; white dwarfs cool with age | `star.ts:128–142, 209–221` |
| Tests | Mass-bin fractions within sampling error of Kroupa; remnant fractions consistent with the star-formation history; threshold sweep 0.01–2 has no spike; giants stay within bounds |

### A3: Planets and moons
| # | Fix | Where |
|---|---|---|
| A3.1 | **Pair mass for planets that orbit both stars**, in periods and in moon Hill limits (the same rule `rogues.ts` already uses) | `planetPhysics.ts:130`, `moons.ts:112` |
| A3.2 | **Hill cap for large moons**: the 30–60 R draw is limited to ½ the Hill radius, or no moon | `moons.ts:236–249` |
| A3.3 | **White-dwarf hosts**: use the remnant mass, and widen surviving orbits by M_initial/M_remnant | `planet.ts:452–470` |
| A3.4 | **Sub-Neptunes get no surface**: solids above ~1.6–2 R⊕ become envelope worlds with no geography, oceans or life | `planetBasics.ts:23,60–70`, `planetPhysics.ts:218` |
| A3.5 | **Orbits scale with the star**: the inner edge follows stellar mass for all stars, plus a small hot-Jupiter channel | `planet.ts:138–175, 470` |
| Tests | Kepler period checks for equal and unequal binaries; no moon outside its limit; white-dwarf orbit expansion; no solid planet below ~3 g/cm³; M-dwarf habitable zones get populated |

### A4: Close the batch
- Bump `SIMULATION_RULES_VERSION` to 19, re-run `npm run stats`, regenerate the README seed table **once**, and write the v18→v19 comparison into `Documents/`.
- Merge into `black-hole-render` as one merge.

---

## Phase 4: Labels and the physics page (about 1 day, after A)

- Label life, minds, civilizations and the Great Filter as **speculative models** on the physics page and in the encyclopedia. Name the abiogenesis rate as an assumption, and point to the existing `emergenceSensitivity` control.
- Rename the "resonant" architecture "near 2:1 spacing".
- Update the physics page's statements on the IMF, the runaway limit and the climate's valid range.
- Use the "established / approximate / speculative / illustrative" framework from the unified audit (§6).

---

## Deliberately not doing (for now)

These are documented model limits, or large new systems the constitution says not to build speculatively:
protoplanetary disc mass budgets; an N-body or multi-planet stability tier; a shared galaxy density field and Sérsic profiles; a Novikov–Thorne disc; metallicity effects by planet class; keeping full rogue-planet records (unless you want rogue planets as a feature); a half-float render-target fallback; Android plugin tests; backend route tests (worth adding once CI exists); the "data contracts" in unified audit §9.

**Dropped:** AF-015, the no-op PATCH (a false positive).

---

## Decisions I need from you (my defaults in bold)

1. IMF: **Kroupa** or Chabrier?
2. Star-formation history: **constant for every galaxy** at first, or per galaxy type right away?
3. Sub-Neptunes: **envelope worlds with no surface**, or allow some to be stripped back to rocky cores by escape?
4. Black-hole camera: **a static observer**, or a falling or orbiting one?
5. Abiogenesis: **label only**, or change the rate too?
6. Rogue planets: **keep counts only**, or make them real records?
7. Branches: Phase 1 and 2 on a **new branch from `black-hole-render`**, and Batch A on **`galaxy-planet-validation`**?

## Rough effort

| Phase | Effort | Universe changes? |
|---|---|---|
| 0 Baseline | ½ day | No |
| 1 Engineering | 1–2 days | No |
| 2 Rendering / black hole | 2–3 days + phone check | No |
| 3 Rules v19 | 1–2 weeks | **Yes, once** |
| 4 Labels | 1 day | No |
