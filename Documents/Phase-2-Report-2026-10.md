# Phase 2 report: rendering and black hole (Batch B)

Branch `engineering-fixes`, after the Phase 1 commits. Not pushed. No rules-version bump: nothing here changes a stored count.

| # | Commit | What changed | How it was checked |
|---|---|---|---|
| B1 | `8f89cea` | The system view draws orbits at `effectiveOrbitAU` (moved in by √gravity), so the picture matches the climate, periods and tidal locking when gravity ≠ 1. The system's scale and the binary's spacing read the same distance. | Test: drawn radius = r/√g × units at g = 0.25, 1, 2; no planet or moon overlaps at g = 0.25 and 2 (seed 42, 400 stars) |
| B2 | `55f9024` | `rendering/blackHole/traceReference.ts`: a CPU copy of the shader's light paths (same equation, Verlet steps, step rule, weak-field hand-off, shift function) | Bending matches exact Schwarzschild within 1 % for b = 4–20 r_s; weak-field 2/b beyond the trace radius; light just inside 3√3/2 falls in; β = 0.5 at the ISCO. A test checks the copy's constants match the shader's |
| B3 | `cd6acc5` | The camera is a static observer: screen angle ψ maps to coordinate angle α with tan α = tan ψ / √(1 − 1/r) | Shadow size error **before → after**: 6 r_s 8.6 % → 0.16 %; 10 r_s 5.4 % → 0.17 %; 34 r_s 1.7 % → 0.17 %; 120 r_s 0.6 % → 0.16 %. What is left is the integrator's step size |
| B4 | `e1842fc` | The disc's Doppler angle is taken in the gas's own static frame (radial part × 1/√(1 − 1/r)), in the disc and the hot flow | Exact shift for face-on, approaching, receding, and a 60° emitter at the ISCO (1.247 before → 1.195, the exact value) |
| B5 | `5e2f3cc` | Disc peak temperature 5×10⁵ K → **1.54×10⁵ K** (Shakura–Sunyaev, Eddington limit, 10⁸ M☉, η = 1 − √(8/9) ≈ 0.057), derivation in the comment | A test recomputes it from G, c, σ, M☉ and L_Edd |
| B6 | `9cfdfa5` | The Newtonian disc profile (no Novikov–Thorne correction) and the 40,000 K colour clamp are named as deliberate approximations in the shader and on the physics page | — |

## What you will see differently

- **Shadow and photon ring**: slightly smaller, most at close range (about 8 % smaller at the 6 r_s zoom limit, under 2 % at the starting distance).
- **Disc colour**: hot discs were already at the 40,000 K colour limit and stay blue-white. Discs that were near the limit get cooler. Example: 10⁹ M☉ feeding at 1 % of its limit was 89,000 K (drawn at the limit) and is now 27,000 K, a less saturated blue-white. The black hole panel's temperature numbers fall by about 3.2×.
- **Doppler asymmetry**: the approaching side's brightening changes a little where light leaves the disc at a steep angle.
- **Gravity slider**: in universes with gravity ≠ 1, system-view orbits move to where the physics already had them.

## B7: phone check (yours)

The shader could not be compiled here. WebGL is off in my browser, and this PC's GPU must not render the black hole above Standard. The GLSL changes are small (one new function, two lines in `shiftFactor`), but only a real GPU proves they compile.

1. Build the APK from `engineering-fixes`.
2. Open one black hole with a **thin disc** and one with a **hot flow**. Look at each at Standard, Medium and High, at the starting distance and fully zoomed in.
3. Check that each one draws at all; a compile error shows as a black or missing view. Compare with screenshots from the current build: the shadow should be slightly smaller at close zoom, and nothing else should change much.

## Open question

The camera now *sees angles* as a static observer does, but not *colours*. A static observer hovering close to the hole would see everything blueshifted by 1/√(1 − 1/r): +9.5 % in frequency at 6 r_s, +1.5 % at 34. The disc would then look about 45 % brighter at the closest zoom. This is physically right but changes the look, and it wasn't in the plan, so I left it out. Your call.
