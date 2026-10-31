# Aion Forge: Independent Scientific and Mathematical Audit

Date: 31 October 2026
Scope: every simulation subsystem in `frontend/src/simulation/`, plus the rendering code that turns physics into pictures (`frontend/src/rendering/`, especially the black-hole ray tracer and the Kepler orbit drawing).
Commit audited: `583ad8b` (branch `claude/aion-forge-scientific-audit-erx7ge`).
Method: I read every equation in the code and checked it against the literature. I recomputed the key quantities by hand or in Python, and ran the real simulation functions in probe scripts (Appendix A). The probes import the unmodified source. The single numerical-convergence experiment ran on a scratch copy outside the repository. No application code was changed. Earlier audits, `Documents/stats.md` and the project's own claims were not used as evidence.

---

## 1. Executive summary

**Overall verdict.** Aion Forge has a solid core of correct physics. Determinism, Kepler orbits, gravity and escape velocity, Clausius–Clapeyron, insolation geometry, tidal heating, ice shells, binary stability limits, the "cosmic shoreline" escape law, the transit-spectrum formalism and the black-hole light paths are all done right, and often carefully. Several of the most visible *outputs* are still not scientifically trustworthy, because a few upstream approximations are used far outside the range where they hold:

1. **The stellar population is badly wrong** (High). The mass draw gives about 14 times too many stars above 8 M☉ at birth. Each star's age is also drawn within its own lifespan, so massive stars never die off. The result: 10% of present-day stars are above 8 M☉, where a Kroupa IMF with constant star formation gives about 0.001%. Red dwarfs are 27% of stars where they should be about 75–80%.
2. **The climate model has no runaway-greenhouse limit and no maximum-greenhouse limit** (Critical). An Earth twin at Venus's orbit keeps its oceans at 320 K. Runaway sets in only near 0.5 AU, where the accepted inner edge is about 0.97 AU (Kopparapu et al. 2013). Steam atmospheres reach surface temperatures up to **8,000 K**.
3. **Present-day climates beyond ~1.3 AU are not numerically converged** (High). With a 100 Myr step, an Earth twin at 1.37 AU ends as a 312 K ocean world. With a 25 Myr step the same planet ends as a 246 K snowball.
4. **Sub-Neptunes are treated as rocky worlds with surfaces** (High). Planets of 2–15 M⊕ get Chen & Kipping's *volatile-rich* radii (1.3–3 g/cm³) and still receive oceans, continents, climates and life. They are 30% of "solid" planets.
5. **Life is close to inevitable by construction** (High, speculative parameter). The origin-of-life rate is anchored on Earth alone. 80% of worlds that ever had liquid water develop life, which is 40% of all solid planets in the sample.

Because these sit upstream, the errors spread. Too many massive stars, combined with the unbounded greenhouse, make 25% of sampled solid planets "lava worlds", most of them around B and A stars. The missing runaway limit inflates habitable-zone and life statistics.

**Trust by subsystem**

| Subsystem | Trust | Main reason |
|---|---|---|
| Determinism and RNG | **High** | Ported fdlibm math with exact bit access, ordered stream mixing, lint guard; tests pass |
| Orbital mechanics (Kepler, Hill, binary limits) | **High** | Equations and coefficients verified against published cases |
| Tidal heating, ice shells, interior heat | **High / Medium** | Io reproduced (2.24 W/m² vs ~2.5 observed); interior law is a reasonable heuristic |
| Atmospheric escape (cosmic shoreline) | **Medium–High** | Reproduces which Solar System bodies have air |
| Transit spectra, composition, detection | **Medium–High** | Correct formalism; band strengths are HITRAN-order averages; limits stated |
| Black hole (ray tracing, Doppler, discs) | **High** for light paths; **Medium** for the disc temperature normalisation (≈3.5× too hot) | |
| Metallicity evolution | **Medium–High** | Present-day gradient −0.054 dex/kpc, matching Cepheid data |
| Planet population and architecture | **Low–Medium** | Orbits ignore stellar mass; composition from mass alone; sub-Neptunes made solid; no hot Jupiters |
| Climate history | **Low** outside about 0.9–1.2 S⊕ | No runaway or maximum-greenhouse limits, an unbounded greenhouse, step-size dependence |
| Stellar population and evolution | **Low** | Wrong IMF, wrong age sampling, giant and remnant luminosities off by orders of magnitude |
| Galaxy morphology | **Illustrative only** | Artistic particle distributions (as documented) |
| Life, evolution, minds, civilizations, Great Filter | **Speculative** | Internally consistent rules with no empirical calibration beyond Earth; should be labelled as such |

---

## 2. Severity and confidence scale

- **Critical**: produces qualitatively wrong outcomes in a core, user-visible result over a large part of parameter space.
- **High**: a large quantitative error (≥ factor of a few, or wrong regime) in a core quantity that propagates downstream.
- **Medium**: a real error or unjustified assumption with bounded or local impact.
- **Low**: minor inaccuracy, documentation mismatch, or cosmetic physics.
- **Verified (✓)**: checked and found correct.

Confidence describes how certain I am that the finding is real and correctly characterised (High, Medium or Low).

---

## 3. Data flow traced

```
seed ─► galaxy.ts (type, particle cloud; display)          ─► rendering/UniverseRenderer
     ├► star.ts  (mass draw → lifespan → age → class → T, L; position; [Fe/H] via metallicity.ts)
     │     └► binary.ts (companion: q, P, a, e)  ─► blackHole.ts (central BH, own stream)
     └► planet.ts per star
           ├ planetCount, architecture, orbits (AU, pushed out by dust-sublimation line)
           ├ planetBasics: mass draw × 10^[Fe/H], Chen–Kipping radius, atmosphere class
           ├ binary stability (Holman–Wiegert) → rogues.ts (Hill spacing 2√3)
           ├ moons.ts (+ interiorHeat.ts tides, ice shells)
           └ solid planets: planetPhysics → geography → worldHistory (100 Myr steps)
                 ├ star.ts luminosityAt / xuvFluence  → atmosphericEscape.ts
                 ├ climate.ts (18-band EBM, greenhouse, ice) ← carbon cycle, O₂, CH₄
                 └ evolution/* (life) → biosphere → civilization → greatFilter
           → atmosphereComposition → clouds → spectrum → observation → detection
rendering reads the results only (orbits by Kepler's equation, colours by blackbody fit).
```

Simulation and rendering are cleanly separated. Rendering never writes back, which I confirmed by reading the renderer and the layout modules.

---

## 4. Findings

### 4.1 Stellar populations and stellar evolution (`star.ts`)

#### S1. The initial mass function overproduces massive stars by about 14× at birth. High severity, high confidence.
- **Where:** `star.ts:38-48` (`MASS_DRAW`, `generateMass`).
- **What:** a piecewise-linear inverse CDF puts 60% of stars at 0.1–1 M☉, 28% at 1–5, 9% at 5–20 and 3% at 20–100 M☉.
- **Reproduced** (12,000 stars, six seeds, probe `stars.probe.ts`):

  | Quantity | Model | Kroupa (2001) births, 0.1–100 M☉ |
  |---|---|---|
  | Share M < 0.5 M☉ | 26.8% | 72.9% |
  | Share M < 1 M☉ | 60.4% | 89.0% |
  | Share M > 8 M☉ | 10.1% | 0.71% |
  | Share M > 20 M☉ | 3.1% | 0.20% |
  | Median mass | 0.85 M☉ | 0.28 M☉ |
- **Evidence:** Kroupa 2001, MNRAS 322, 231; Chabrier 2003, PASP 115, 763. RECONS: about 75% of stars within 10 pc are M dwarfs (Henry et al. 2006, AJ 132, 2360).
- **Documentation mismatch:** the Physics page (`ui/physics/chapters/stars.ts:49`) says the curve is "weighted heavily towards red dwarfs". It is not.
- **Recommendation:** sample a Kroupa or Chabrier IMF by analytic inverse CDF. It is still one draw, so determinism is unchanged. Scale `stellarIgnitionThreshold` as a shift of the IMF break mass instead of a roll multiplier.

#### S2. Each star's age is drawn within its own lifespan, so there is no star-formation history. High severity, high confidence.
- **Where:** `star.ts:608` (`age = rng() * Math.min(lifespan, universeAgeBY)`), `star.ts:64-65`, `star.ts:80-86`.
- **What:** every star, whatever its mass, is caught at a random moment of its own life. A 20 M☉ star (life 5.6 Myr) is as likely to exist today as a red dwarf. Remnants are made only in the last 5% of the lifespan, so **no white dwarf or neutron star is ever older than 5% of its progenitor's lifespan**. Real white dwarfs are up to ~10 Gyr old.
- **Reproduced:** red giants 4.8% of stars, remnants 2.45%, main-sequence stars above 8 M☉ 10% of the population. Combining Kroupa births with *this model's own* lifetimes and a constant star-formation rate over 13.7 Gyr gives giants ≈ 0.44%, remnants ≈ 8.5%, and living stars above 8 M☉ ≈ 1.1 × 10⁻⁵.
- **Cross-subsystem inconsistency:** `metallicity.ts` models ellipticals as "one early, fast burst", yet elliptical galaxies receive the same young O and B stars as spirals.
- **Recommendation:** draw a birth time from a per-galaxy-type star-formation history (constant for spirals, early burst for ellipticals, late or bursty for irregulars). Set age = universe age − birth time and keep stars whose age exceeds their lifespan as remnants with that age. This also fixes white-dwarf cooling ages (S5).

#### S3. Red-giant luminosity is 500 × the main-sequence value for every mass, which gives impossible giants. High severity, high confidence.
- **Where:** `star.ts:128`, `star.ts:142`, `star.ts:220-229` (past-giant radius at 4,000 K), `star.ts:182-185`.
- **Reproduced:** giant luminosity reaches **4.2 × 10⁹ L☉**, and giant radii reach **670 AU**. 132 of 573 giants are larger than 5 AU. Per mass: 20 M☉ → 1.8 × 10⁷ L☉ and 41 AU; 100 M☉ → 5 × 10⁹ L☉ and 685 AU.
- **Evidence:** the Eddington limit is ≈ 3.2 × 10⁴ (M/M☉) L☉, about 3 × 10⁶ L☉ for 100 M☉. No cool supergiant exceeds log L ≈ 5.8 (Humphreys & Davidson 1979, ApJ 232, 409). The largest red supergiants are ~1,500 R☉ ≈ 7 AU (Levesque et al. 2005, ApJ 628, 973). At the other end, a 1 M☉ past giant has radius **0.22 AU** in the model, while the Sun's red-giant-branch tip reaches ~1 AU (~200 R☉) and its AGB phase is similar or larger (Schröder & Connon Smith 2008, MNRAS 386, 155).
- **Impact:** planet engulfment (`planet.ts:474-499`) is badly overestimated for massive stars and underestimated for Sun-like ones: Mercury and Venus survive the model Sun's giant phase. Planets on irradiated giant-phase orbits get wildly wrong temperatures. Orbital expansion from stellar mass loss (a ∝ 1/M) is not modelled.
- **Recommendation:** cap giant luminosity, for example with Hurley et al. (2000, MNRAS 315, 543) fits or a mass-dependent factor capped near 10⁵·⁸ L☉, and use a mass-dependent maximum radius.

#### S4. Single power laws for luminosity, radius and lifetime fail at both ends of the main sequence. Medium severity, high confidence.
- **Where:** `star.ts:54-58`, `star.ts:100-121`, `star.ts:126`, `star.ts:134-136`.
- **Reproduced:**

  | M (M☉) | L = M^3.5 | Typical observed L | R = M^0.8 | T (unclamped) | Lifespan = 10 M^−2.5 Gyr |
  |---|---|---|---|---|---|
  | 0.1 | 3.2 × 10⁻⁴ | ~1 × 10⁻³ | 0.158 | 1,934 K, clamped to 2,300 | 3.2 Tyr |
  | 1 | 1 | 1 | 1 | 5,772 K | 10 Gyr |
  | 40 | 4.0 × 10⁵ | ~2 × 10⁵ | 19.1 | 33,300 K | 1 Myr, floored at 3 Myr (real ~5 Myr) |
  | 100 | 1.0 × 10⁷ | ~1.5 × 10⁶ | 39.8 | 51,400 K | floored at 3 Myr |
- **Evidence:** Eker et al. 2015 (AJ 149, 131) give a piecewise mass–luminosity relation: L ∝ M^2.3 below 0.43 M☉ and ≈ M^1 near the Eddington limit. Late-M dwarfs are 2,700–3,000 K at 0.1 M☉ (Mann et al. 2015, ApJ 804, 64). The clamp at 2,300 K hides the error.
- **Recommendation:** use piecewise mass–luminosity and mass–radius relations (Eker et al. 2015/2018), or the Tout et al. (1996) ZAMS fits.

#### S5. Remnant luminosities contradict Stefan–Boltzmann, and white dwarfs do not cool. Medium severity, high confidence.
- **Where:** `star.ts:90-97`, `star.ts:129-131`, `star.ts:141`.
- **Reproduced:** applying `stellarRadiusAU` to model white dwarfs gives radius **4.4 R⊕ at 8,000 K and 0.13 R⊕ at 80,000 K**. Real white dwarfs are ≈ 0.9–1.4 R⊕ (≈ 0.0126 R☉). An 80,000 K white dwarf of that radius has L ≈ 5.9 L☉, not 0.051. Neutron stars (L fixed at 10⁻⁵ L☉, T 10⁵–10⁶ K) come out at **0.07–7 km** instead of ~11 km. White-dwarf temperature is a uniform draw unrelated to age.
- **Impact:** white-dwarf planets get wrong irradiation, and any radius-based logic (transit depths, engulfment) is wrong for remnants.
- **Recommendation:** fix the radius (white dwarf ≈ 0.0126 R☉ for 0.6 M☉; neutron star 11 km), compute L = 4πR²σT⁴, and set T from a Mestel cooling law in the remnant's age.

#### S6. Main-sequence brightening is linear, so late brightening is too slow. Low severity, medium confidence.
- **Where:** `star.ts:152-168`, `star.ts:232-241`.
- **Reproduced:** model Sun L(0) = 0.698 (good), L(8.5 Gyr) = 1.256. Gough (1981, Sol. Phys. 74, 21) gives 1.51 at 8.5 Gyr, and standard solar models give ~1.6–1.8 near the end of the main sequence.
- **Impact:** future habitable lifetimes are overestimated. This compounds C1.

#### S7. Smaller stellar inconsistencies. Low severity, high confidence.
- The ±10% temperature jitter (`star.ts:103,118`) is applied without changing L, so the implied radius scatters by ±22%.
- Protostars use main-sequence L with T = 2,000–4,000 K. A 10 M☉ protostar then has R ≈ 1 AU and can engulf freshly drawn planets.
- Universe age 13.7 Gyr against Planck 2018's 13.787 Gyr is negligible.

#### S8. ✓ Magnetic activity and XUV (`star.ts:354-458`). Verified, high confidence.
Ribas et al. (2005) decay exponent 1.23 ✓. Wright et al. (2011) saturation ratio 10^−3.13 ✓. The temperature-dependent saturation time follows West et al. (2008) ✓. The photospheric XUV series ∫x³/(eˣ−1) is correct. The closed-form fluence integral ∫(a+bt)(t/tₛ)^−p dt is exact. The present-day Sun is calibrated to 3.4 × 10⁻⁶ L☉ (≈ 4.6 erg cm⁻² s⁻¹ at 1 AU) ✓. The model Sun's XUV at 50 Myr is 77 × today's, consistent with Ribas' ~100×. One caveat: Wright's ratio is soft X-ray only; the rescaling factor s = 0.503 absorbs the difference.

### 4.2 Binary and multiple stars (`binary.ts`)

#### B1. ✓ Multiplicity, periods and stability limits. Verified, high confidence.
- Multiplicity by mass (26 / 46 / 60 / 75%) is consistent with Duchêne & Kraus (2013, ARA&A 51, 269).
- The log-normal period distribution (median log P = 5.03, σ = 2.28) matches Raghavan et al. (2010) ✓. Kepler's third law in AU, M☉ and years ✓.
- Holman & Wiegert (1999) coefficients are transcribed exactly. α Cen A gives an S-type limit of **2.77 AU** (HW99: ~2.5–2.8). Kepler-16 gives a P-type limit of **0.646 AU** against the published ~0.64 AU, with the planet at 0.705 ✓.
- The orbit-averaged companion flux L/(a²√(1−e²)) is the correct time average ✓.

#### B2. Brown-dwarf companions are treated as hydrogen-burning stars. Medium severity, high confidence.
- **Where:** `binary.ts:41`, `binary.ts:86`.
- q is uniform from 0.1 to 1, so any primary below 0.8 M☉ can receive a companion below 0.08 M☉. That companion then gets L = M^3.5, a main-sequence class and a lifespan.
- **Recommendation:** classify companions below 0.075 M☉ as brown dwarfs (L ≈ 10⁻⁵–10⁻⁴ L☉, cooling), or truncate q at 0.08/M₁.

#### B3. No binary interaction, and solar-type periods are used for massive stars. Medium severity, high confidence.
- **Where:** `binary.ts:27-30` (partly acknowledged).
- Pairs closer than their stellar radii exist. There is no Roche-lobe overflow, common envelope or merger, and each companion evolves as a single star.
- Sana et al. (2012, Science 337, 444) find that about 70% of O stars interact, and that massive binaries have much shorter periods than Raghavan's solar-type distribution.

#### B4. Pair colour as a luminosity-weighted temperature. Low severity.
`binary.ts:165-170` is a display convenience, not a colour temperature. It is acceptable for display only.

### 4.3 Central black holes (`blackHole.ts`, `rendering/blackHole/`)

#### BH1. ✓ Light paths, frequency shifts and disc profile. Verified, high confidence.
- Schwarzschild radius 2.953 km/M☉ ✓.
- The photon equation d²x/dλ² = −(3/2)h²x/r⁵ (r_s = 1) is the exact Cartesian form of u″ + u = (3/2)r_s u² ✓.
- The weak-field deflection tends to 2r_s/b = 4GM/(c²b) ✓.
- Circular-orbit speed seen by a static observer, β = √(r_s/(2(r − r_s))), gives β = 0.5 at the ISCO ✓. The frequency shift g = √(1 − r_s/r)·√(1 − β²)/(1 − β cos θ) ✓, with I ∝ g⁴ ✓.
- The Shakura–Sunyaev profile peaks at r = (49/36) r_in, with f_peak = 0.056653 ✓.
- Eddington-scaled T ∝ (λ/M)^¼ ✓. The thin-disc/ADAF switch at λ ≈ 0.01 is reasonable (Narayan & Yi 1995).

#### BH2. The disc peak temperature is about 3.5× too high. Low–Medium severity, medium confidence.
- **Where:** `blackHole.ts:235`.
- **What:** the model uses 5 × 10⁵ K for 10⁸ M☉ at the Eddington rate. The standard thin disc with r_in = 6GM/c² gives a peak T of **1.54 × 10⁵ K (η = 0.057) or 1.34 × 10⁵ K (η = 0.1)**, computed in `misc.probe.ts`. The model value matches the *scale* T* ≈ 6.3 × 10⁵ K of T(r) = T*(r/r_s)^−3/4 (Peterson 1997), not the peak.
- **Recommendation:** use ≈ 1.4 × 10⁵ K, or compute it from the Shakura–Sunyaev formula.

#### BH3. Black-hole mass from galaxy type only. Low severity (acknowledged).
There is no M–σ or bulge-mass relation (Kormendy & Ho 2013, ARA&A 51, 511).

### 4.4 Galaxies and chemical evolution (`galaxy.ts`, `metallicity.ts`)

#### G1. The galaxy particle cloud is illustrative, not a physical structure. Low severity, high confidence.
- **Where:** `galaxy.ts:39-73`, `galaxy.ts:77-111`; positions in `star.ts:505-537`.
- The spiral angle is linear in radius (an Archimedean spiral). Observed arms are roughly logarithmic, with constant pitch.
- Radius is uniform, which gives Σ ∝ 1/R instead of an exponential disc.
- The *same* scatter is added to x and z (`galaxy.ts:52-54`), so particles smear along the x = z diagonal.
- Ellipticals are not Sérsic or de Vaucouleurs profiles.
- Stars use a different distribution (t^0.7, spread 0.25) from the rendered particles (uniform t, spread 0.35), so the stars do not trace the visible galaxy exactly.
- **Recommendation:** label this as artistic, or draw both stars and particles from an exponential disc with logarithmic arms. Using independent scatter for x and z is a one-line improvement.

#### G2. ✓ Metallicity enrichment. Verified, high confidence.
The closed-box-with-infall form is sensible. Reproduced: the present-day gas gradient near the solar radius is **−0.054 dex/kpc**, against Cepheids and HII regions at ~−0.05 to −0.07 (Luck & Lambert 2011; Genovali et al. 2014). The centre is at +0.20 dex, and the Sun's birth gas is solar (−0.001). Metallicity does not alter stellar structure (acknowledged).

### 4.5 Planet formation and characteristics (`planet.ts`, `planetBasics.ts`, `planetPhysics.ts`, `rogues.ts`)

#### P1. Sub-Neptunes are given solid surfaces. High severity, high confidence.
- **Where:** `planetBasics.ts:23` (`GIANT_PLANET_MASS = 15`), `planetBasics.ts:60-70` (Chen & Kipping radii), `planetPhysics.ts:218-219`.
- **What:** above 2.04 M⊕ the Neptunian branch (R ∝ M^0.589) applies. It describes planets with volatile or H/He envelopes. Everything below 15 M⊕ is still treated as solid, with geography, oceans, continents, a climate and a biosphere.
- **Reproduced:** 237 of 782 solid planets (30%) are above 2.04 M⊕, and 261 have bulk density below 3 g/cm³ (the ±20% radius scatter included). Densities: 5 M⊕ → 3.0 g/cm³, 10 M⊕ → 1.8 g/cm³, 14.5 M⊕ → 1.3 g/cm³. A 10 M⊕ "rocky" world has R = 3.1 R⊕ and g = 1.02.
- **Evidence:** the radius valley near 1.5–2 R⊕ (Fulton et al. 2017, AJ 154, 109). Planets above ~1.6 R⊕ are mostly not rocky (Rogers 2015, ApJ 801, 41).
- **Recommendation:** use a rocky mass–radius relation (Zeng et al. 2016) for planets kept as solid. Give planets above ~1.6–2 R⊕ an envelope, or make them "mini-Neptunes" with no surface, unless photoevaporation strips them. AE2's escape machinery could decide that.

#### P2. Orbits ignore stellar mass, so there are no compact M-dwarf systems and no hot Jupiters. Medium severity, high confidence.
- **Where:** `planet.ts:138-175`, `planet.ts:470-471`.
- **What:** the first orbit is 0.1–0.4 AU for every star. Systems move outward only for luminous stars. An M dwarf's habitable zone (0.06 AU at 0.2 M☉) is therefore almost never populated; TRAPPIST-1's planets lie at 0.011–0.062 AU.
- **Reproduced:** 0 hot Jupiters (> 0.3 M_J, < 0.1 AU) in 250 systems. The observed rate is ~0.5–1% of FGK stars (Wright et al. 2012). Planet counts are also flat with stellar mass, while M dwarfs host ~2.5 small planets each (Dressing & Charbonneau 2015).
- **Recommendation:** scale the inner edge with the stellar mass or dust-sublimation radius for *all* stars, not only bright ones, and draw a small hot-Jupiter channel.

#### P3. Composition depends on mass alone, not where the planet formed. Medium severity, high confidence.
- **Where:** `planet.ts:483`, `planet.ts:542`.
- Gas giants are equally likely at 0.1 AU and 30 AU, and there is no snow-line or core-accretion dependence.
- Scaling *all* planet masses by 10^[Fe/H] contradicts the observation that small-planet occurrence barely depends on metallicity (acknowledged in code, `planet.ts:275-278`).

#### P4. All orbits are circular, and "resonant" systems are not resonant. Low severity, high confidence.
- **Where:** `planet.ts:139-144`.
- "Resonant" spacings of 1.5–1.7 in semi-major axis are period ratios of 1.84–2.2, which are not locked to 3:2 (1.31) or 2:1 (1.587).
- Planet eccentricities are zero. Observed giants follow roughly a Rayleigh distribution with σ ≈ 0.2–0.3.
- The stability test uses only the two-planet 2√3 Hill criterion (Gladman 1993 ✓, but limited, as the code acknowledges).

#### P5. A comment understates the giant fraction. Low severity, high confidence.
`planetBasics.ts:38-39` says "about one planet in twenty is heavier than Saturn". The draw gives **7.4%** above 95 M⊕ before metallicity scaling, and 16.4% above 15 M⊕.

#### P6. ✓ Verified planet physics. High confidence.
- Kepler period √(a³/M★) ✓; surface gravity M/R² ✓; v_esc = 11.2√(M/R) km/s ✓.
- The Hill radius and the Gladman 2√3 R_H criterion ✓.
- Tidal-lock radius ∝ (t M★²)^⅙, calibrated to ~0.40 AU for today's Sun ✓ (Peale / Gladman et al. 1996 scaling).
- Chen & Kipping (2017) coefficients and their continuity at 2.04 and 131.6 M⊕ ✓.
- Dust-sublimation radius (278/1500)²√L ✓.

#### P7. Smaller planet assumptions. Low severity.
- The tidal-lock state uses the star's *present* age for the whole history (`planetPhysics.ts:161,204`).
- The snow line uses Hayashi's 2.7 AU (defined for 1 L☉) times √L_ZAMS, which gives 2.26 AU for the Sun.
- Pulsar planets are excluded.
- Protostars already host finished planetary systems.

### 4.6 Climate and world history (`climate.ts`, `worldHistory.ts`)

#### C1. There is no runaway-greenhouse limit set by insolation, so the inner habitable-zone edge sits near 0.5 AU. Critical severity, high confidence.
- **Where:** `climate.ts:118-124` (the vapour feedback reads the water inventory, not temperature); `worldHistory.ts:527` (`wetness = wetnessOf(state.water)`); `worldHistory.ts:617` (steam only when T_mean ≥ boiling point); weathering drawdown at `worldHistory.ts:543-553`.
- **Reproduced** (`climate.probe.ts`: Earth twin, 1 bar, W = 0.08, no life):

  | a (AU) | S/S⊕ | Model T (K) | Oceans | Kopparapu et al. 2013 |
  |---|---|---|---|---|
  | 0.45 | 4.9 | 665 | lost | runaway |
  | 0.55 | 3.3 | 344 | 62%, moist greenhouse | runaway |
  | 0.65 | 2.4 | 329 | 63% | runaway |
  | 0.72 | 1.9 | **320** | **63%, stable** | runaway (Venus) |
  | 0.90 | 1.23 | 300 | 63% | runaway (S > 1.06) |
  | 1.00 | 1.0 | 290.5 ✓ | 63% | habitable |
- **Why:** water-vapour feedback is a fixed ×2 amplifier, independent of temperature. Silicate weathering then draws CO₂ down to ~10⁻⁵ bar as the planet warms, which *cools* it. Steam appears only when the mean surface temperature reaches the boiling point (373 K at 1 bar). In reality the runaway is set by the Simpson–Nakajima outgoing-radiation limit of ≈ 280 W/m² of absorbed flux (Goldblatt et al. 2013, Nat. Geosci. 6, 661), reached near S ≈ 1.06 S⊕ for the Sun (Kopparapu et al. 2013, ApJ 765, 131; Leconte et al. 2013 give ~1.1).
- **Acknowledgement understated:** the Physics page says "Under thick air the model keeps oceans on worlds absorbing more than the runaway limit (decision 6)". The probe shows it happens at **1 bar** as well.
- **Impact:** planets in Venus-like zones are counted as habitable, which inflates habitability, life, mind and civilization counts, and surface-climate statistics.
- **Recommendation:** add an absorbed-flux limit. If (1 − A)·S/4 exceeds ~280 W/m² (scaled a little by gravity, per Pierrehumbert 2010), the water goes to steam. Make the vapour amplification depend on temperature through the saturation pressure the code already has (`waterSaturationBar`).

#### C2. The greenhouse is unbounded: surface temperatures reach ~8,000 K, and there is no maximum CO₂ greenhouse. High severity, high confidence.
- **Where:** `climate.ts:70-75`, `climate.ts:118-124`, `climate.ts:150-152`; steam pressure at `worldHistory.ts:151`.
- **What:** G = [16.5√P + 1.5 log₂(CO₂/ref) + 150√CH₄] / (1 − 0.5 w), then T = T_eff (1 + G/255). Fitted to Earth (33 K at 1 bar), it is applied unchanged up to hundreds or thousands of bar.
- **Reproduced** (`systems.probe.ts`): 197 of 782 solid planets are "lava", mostly steam-greenhouse worlds. Examples: T = 8,007 K at P = 1,429 bar; 5,044 K at 442 bar; 4,444 K at 504 bar. A 1 M☉ star's planet at 0.46 AU (T_eq 395 K) reaches 1,865 K. The vapour multiplier (×2) is applied on top of a steam pressure that already represents the vapour.
- **Maximum greenhouse:** an Earth twin at 2.0 AU builds 18 bar of CO₂ and reaches **315 K** with open oceans. Physically, thick CO₂ atmospheres stop warming near ~8 bar because of Rayleigh scattering and CO₂ condensation, which puts the outer edge at S ≈ 0.36, about 1.67 AU (Kasting et al. 1993; Kopparapu et al. 2013). The model has no Rayleigh penalty, and its CO₂ cap applies only where CO₂ saturates.
- **Evidence:** steam atmospheres over magma oceans have surface temperatures of roughly 1,500–3,000 K (Hamano et al. 2013, Nature 497, 607; Lebrun et al. 2013). 8,000 K is hotter than the photosphere of the Sun-like star in that example.
- **Venus test:** a dry 90-bar CO₂ Venus analogue reaches 584 K, against 737 K observed. The model's albedo cannot represent Venus's 0.76, so the answer is right only through cancelling errors.
- **Recommendation:** use a grey radiative or OLR-limit formulation (for example Pierrehumbert 2010, ch. 4) with a ceiling where the surface stays at the radiating level. Cap the vapour multiplier when the vapour is already counted as steam. Add a Rayleigh/condensation maximum-greenhouse term for CO₂.

#### C3. Present-day climates depend on the time step: limit cycles are sampled, not resolved. High severity, high confidence.
- **Where:** `worldHistory.ts:122` (`STEPS_PER_GYR = 10`), carbon solve `worldHistory.ts:543-553`, ice hysteresis `climate.ts:277-298`.
- **Reproduced:** the identical planet was run with Δt = 0.1 Gyr (shipped) and 0.025 Gyr (scratch copy, one constant changed):

  | a (AU) | T, Δt = 0.1 | State | T, Δt = 0.025 | State |
  |---|---|---|---|---|
  | 1.00 | 290.5 K | CO₂ 5.5 × 10⁻⁴ | 286.6 K | CO₂ 2.3 × 10⁻⁴ |
  | 1.20 | 270.6 K | 26% ice | 265.9 K | 35% ice |
  | 1.37 | **311.9 K** | **ocean** | **246.1 K** | **snowball** |
  | 1.50 | **320.0 K** | **ocean** | **246.5 K** | **snowball** |
  | 2.00 | **314.9 K** | **ocean** | **228.4 K** | **snowball** |
- With Δt = 0.1 Gyr, worlds at 1.1–2.0 AU flip between "freezes-over" and "thaws" every one to three steps (over 30 transitions between 0.7 and 3.9 Gyr at 1.2 AU). The present-day state is whichever phase the final step lands in, and it is not even monotonic in orbit: 1.5 AU is warm, 1.7 AU frozen, 2.0 AU warm.
- **Physical note:** CO₂–ice limit cycles are real in principle (Menou 2015; Haqq-Misra et al. 2016), but their period should not equal the integrator's step.
- **Recommendation:** run a convergence study and use adaptive sub-stepping when the ice cover changes. Report a time-averaged or "attractor" state, or both phases, instead of the last sample. Treat the snowball and hothouse decision as a function of a converged outcome.

#### C4. Smaller climate issues. Medium severity.
- A Mars analogue (thin or moderate air) loses its atmosphere completely and freezes globally at 177 K. Real Mars has 6 mbar and is ~210 K. The water ice inventory sets a global ice albedo of 0.62.
- Liquid habitability uses 263 K (the ice-formation threshold) instead of the freezing point (`climate.ts:64,456`).
- Ozone ∝ √(O₂/0.21) underestimates the ozone column at 1–10% of present O₂ (Segura et al. 2003, Astrobiology 3, 689).

#### C5. ✓ Verified climate building blocks. High confidence.
- T_eq = 278 (L/a²)^¼ (1 − A)^¼ gives Earth 255 K ✓.
- Earth at 1 AU: **290.5 K** (observed 288 K) ✓. Climate sensitivity 3 K per CO₂ doubling ✓ (IPCC AR6).
- Mars-type greenhouse ≈ 5–8 K ✓.
- Clausius–Clapeyron for water (L/R = 4,895 K, triple point 273.16 K and 611.7 Pa, critical point 647 K) and the boiling curve: 92 bar → 568.6 K against 578 K measured ✓.
- CO₂ triple point, critical point and latent heats; 1 atm sublimation at ≈195 K reproduced ✓.
- The two-term Legendre insolation s₂ = −(5/8)P₂(cos ε) (North et al. 1981) ✓. Locked insolation 4 max(0, x) integrates to 1 ✓. The band integrals are exact ✓.
- Walker et al. (1981) weathering e-folding of 13.7 K with √CO₂ dependence ✓.
- Outgassing at the present-day Earth level (≈ 17 bar CO₂ per Gyr) is within a factor of ~3.5 of observed fluxes (≈ 60 bar-equivalent per Gyr) ✓, order of magnitude.

### 4.7 Atmospheric escape, interior heat and moons

#### E1. ✓ The cosmic shoreline reproduces the Solar System. Verified, high confidence.
Using `airRetained(1/a², v_esc)`: Mercury 0, Moon 0, Ganymede 0, Callisto 0 (all airless ✓); Venus 0.93, Earth 0.99, Titan 0.88, Triton 0.85, Pluto 0.78 (all have air ✓). Mars comes out at 0, while the real planet keeps 6 mbar, a borderline case. The v_esc⁴ slope follows Zahnle & Catling (2017, ApJ 843, 122) ✓.

#### E2. Retention curve and uniform stripping are arbitrary. Low severity (acknowledged).
r = 1 − (X/X_c)², with every gas stripped by the same share whatever the atmospheric mass. Energy-limited escape removes a *mass*, so thick atmospheres should last longer.

#### M1. ✓ Tidal heating, ice shells and satellites. Verified, high confidence.
- Ė = (21/2)(k₂/Q)G M_p² R⁵ n e²/a⁶ ✓ (Peale et al. 1979).
- Reproduced: Io **2.24 W/m²** (observed ~2–2.5), Europa 0.21 W/m², Enceladus 0.028 W/m² (observed ≈ 0.02).
- Ice shell d = (651/q) ln(271/T_s) gives Europa **13 km** ✓.
- Satellite-system mass ratio 2 × 10⁻⁴ ✓ (Galilean moons 2.07 × 10⁻⁴). Half-Hill-radius moon limit ✓. Giant-impact moon mass ratio range includes the Moon's 0.0123 ✓.

#### M2. Moon simplifications. Low severity (acknowledged).
Io's k₂/Q is used for every moon. There is no orbital evolution or resonance forcing; eccentricity is a draw.

#### I1. The interior heat law is a heuristic. Low severity.
q = q⊕ √M e^(−t/8 Gyr), anchored to Earth (0.087 W/m² ✓). The Moon gets 0.0096 W/m² against Apollo's ≈ 0.016–0.021; Mars gets 0.0285 against ≈ 0.02 from InSight-era models. This is reasonable for a heuristic, but the √M scaling is not derived.

### 4.8 Atmospheric composition, spectra and detection

#### A1. ✓ Spectrum, composition and detection logic. Mostly verified, medium–high confidence.
- Lecavelier des Etangs et al. (2008) isothermal transit formalism, with τ_eq = 0.56 ✓. The Rayleigh cross-section (128π⁵/3)α²/λ⁴ ✓.
- Gaussian band peak = S/(1.064 W) ✓. Band strengths are of HITRAN order (O₂ A band, CO₂ 4.3 µm, CH₄ 3.3 µm, O₃ 9.6 µm).
- CH₄ + H₂O ⇌ CO + 3H₂ with ΔH = 225.9 kJ and ΔS = 253 J/K gives K = 1 at 893 K, with CO = CH₄ near 1,100 K at 1 bar, consistent with Visscher & Moses (2011) ✓.
- Jupiter and Uranus bulk abundances match Galileo, Juno and Voyager values ✓.
- The biosignature logic (O₂/O₃ with CH₄ counted as disequilibrium, and abiotic O₂ from escaping water kept as a false positive) follows Meadows et al. (2018) ✓.
- Stated limits (no refraction, no collision-induced absorption, averaged bands) are accurate.

### 4.9 Life, evolution, minds and civilizations

#### L1. The origin-of-life rate is anchored on a single biased datum. High severity, speculative.
- **Where:** `worldHistory.ts:187-191` (`ORIGIN_PER_GYR_PER_WATER_AREA = 4.6`).
- **Reproduced:** in 250 main-sequence systems, **80.5% of worlds that ever had liquid water developed life**, which is **39.6% of all solid planets**.
- **Evidence:** early life on Earth does not constrain the abiogenesis rate, because of selection effects (Spiegel & Turner 2012, PNAS 109, 395). The rate could be many orders of magnitude lower.
- **Recommendation:** present this as an explicit speculative dial (as `emergenceSensitivity` partly does), default to a value whose meaning is stated, and avoid presenting life frequencies as predictions.

#### L2. The evolution, minds, civilization and Great Filter models are speculative frameworks. Informational.
Some ingredients rest on real biology: Kleiber's M^¾ law, the 1/18 anaerobic yield, Henry's law for dissolved O₂, Wien's law for pigment match. But the whole chain from lineage to mind to civilization is invented rule-making with owner-chosen thresholds. Three species traits (curiosity, cooperation, resilience) are seeded draws (`civilization.ts:118-124`), and cooperation is keyed to habitability score. That fits the project charter, but the UI should label these outputs as speculative, separate from the astrophysics.

### 4.10 Cross-cutting checks

#### X1. ✓ Determinism. Verified, high confidence.
- Mulberry32, a MurmurHash3-finaliser stream mixer, fdlibm ports of exp, log, sin and cos, and pow via exp·log.
- The simulation contains no `Math.exp/log/pow/sin/cos/random`. The only exception is the display-only particle cloud in `galaxy.ts:53-54,91`, which is documented. `Date.now` appears only in metadata (`experiment.ts`, `journal.ts`).
- The ESLint rule enforces this, and `determinism.test.ts` passes.
- Box–Muller uses u = 1 − rng() ∈ (0, 1], so log(0) cannot occur ✓.

#### X2. Units are consistent.
AU, M☉, L☉, M⊕, R⊕, Gyr, K and bar are used consistently. Constants checked: Earth mass = 3.003 × 10⁻⁶ M☉, Earth GM = 398,600.4 km³/s², R☉ = 0.00465047 AU, G = 6.674 × 10⁻¹¹, σ = 5.670374419 × 10⁻⁸. No unit error was found.

#### X3. Errors compound.
S1 and S2 make 10% of stars luminous B and A types. Combined with C2's unbounded greenhouse, this makes lava worlds 25% of solid planets in the sample, and 22 of the first 25 lava worlds listed orbit stars above 2 M☉. In the main-sequence sample no planet was engulfed (engulfment applies to giants and remnants, where S3 makes the radii wrong). C1 and L1 together inflate life-bearing worlds.

#### X4. Configuration "laws" are not physical.
`gravityStrength` scales orbits by 1/√G (`planetBasics.ts:29-31`) and `entropyRate` divides lifespans. These are labelled as a laboratory. Physical consequences, such as the effect of G on stellar luminosity, are not derived. This is acceptable if presented as stylised.

---

## 5. Prioritised recommendations

1. **Climate limits (C1, C2):** add a runaway OLR limit (≈ 280 W/m² absorbed), make vapour feedback depend on temperature, cap steam-atmosphere surface temperatures, and add a maximum CO₂ greenhouse. This has the largest effect on habitability, life and civilization statistics.
2. **Numerical convergence (C3):** run a step-size study, use adaptive sub-steps around ice transitions, and report converged or attractor states.
3. **Stellar population (S1, S2):** use a Kroupa or Chabrier IMF, draw birth times from a per-galaxy-type star-formation history, and keep dead stars as aged remnants.
4. **Giants and remnants (S3, S5):** cap giant luminosity and radius, give white dwarfs and neutron stars physical radii with L = 4πR²σT⁴, and add white-dwarf cooling.
5. **Planet structure (P1, P2):** use a rocky mass–radius relation, give planets above ~1.6–2 R⊕ envelopes, and scale orbits with stellar mass for all stars.
6. **Main-sequence relations (S4):** piecewise mass–luminosity and mass–radius relations.
7. **Small fixes:** BH2 disc temperature normalisation; G1 independent x/z scatter; B2 brown-dwarf companions; P5 comment; the Physics-page statements on the IMF and the runaway limit.
8. **Labelling (L1, L2):** mark life, minds and civilization outputs as speculative, and expose the abiogenesis rate as an explicit assumption.

Each of these can be implemented deterministically with the existing seeded streams.

---

## 6. What is established, approximated or speculative

| Category | Components |
|---|---|
| **Established physics, correctly implemented** | Kepler III and Kepler's equation (renderer); gravity and escape velocity; Hill radius and Gladman criterion; Holman–Wiegert limits; Raghavan periods; Clausius–Clapeyron (H₂O, CO₂); boiling curve; equilibrium temperature; Legendre insolation; tidal heating; ice-shell conduction; Schwarzschild light paths, Doppler and gravitational shifts; Shakura–Sunyaev profile; Rayleigh scattering; transit-depth formalism; CH₄/CO equilibrium; Stefan–Boltzmann (where applied consistently) |
| **Reasonable approximations** | XUV activity law; cosmic shoreline; carbon–silicate weathering; metallicity enrichment; mass–radius (Chen & Kipping, within its domain); greenhouse near Earth conditions (0.9–1.2 S⊕, ≤ a few bar); interior heat law; satellite-system mass ratio |
| **Approximations used out of range (errors)** | IMF; age sampling; L = M^3.5; R = M^0.8; giant ×500 luminosity; remnant L and T; greenhouse at high pressure or insolation; Neptunian radii for solid planets; orbit placement independent of stellar mass |
| **Speculative by design** | Abiogenesis rate; evolution engine; minds; civilizations; Great Filter gates; tilt wander; impacts and volcanic pulses as catastrophes; configuration "laws" |
| **Illustrative only** | Galaxy particle morphology; star colours (Helland fit); pair colour |

---

## Appendix A: Reproducing the probes

The probes are Vitest files that import the unmodified simulation modules. To rerun them, copy a probe into `frontend/src/__tests__/` (or set its import path accordingly), run `npx vitest run <file>`, and delete it afterwards. Condensed versions:

**A1. Stellar population** (S1–S5)
```ts
const g = galaxy.buildGalaxyConfig(seed, config.makeConfig(seed));   // seeds 42, 7777, 100000, 1, 2, 3
const pop = star.generateStarsFor(g);
// count classification shares, mass shares (>8, >20, <1, <0.5), giant L and stellarRadiusAU
```
Output: main sequence 90.6%, giants 4.8%, protostars 2.2%, white dwarfs 1.9%, neutron stars 0.37%, black holes 0.18%. Mass shares: M > 8: 10.1%; M > 20: 3.1%; M < 1: 60.4%; M < 0.5: 26.8%. Maximum giant L 4.2 × 10⁹ L☉ and maximum giant radius 670 AU.

**A2. Earth-twin climate sweep** (C1, C2, C4)
```ts
const cfg = config.makeConfig(4242, { emergenceSensitivity: 0 });
const planet = { id: 0, key: '1-0', hostStarId: 1, orbitalRadius: a, mass: 1, size: 1,
  formationAtmosphere: 'moderate', atmosphere: 'moderate', moons: [], /* other fields default */ };
const phys = planetPhysics.derivePhysics(planet, sun, 4242, cfg);
phys.waterInventory = 0.08; phys.axialTiltDeg = 23.4;
const h = worldHistory.runWorldHistory(planet, phys, geography.buildGeography(planet, phys, 4242), sun, 4242, cfg);
// sun = { mass 1, age 4.6, lifespan 10, temperature 5772, luminosity 1, main-sequence, metallicity 0 }
```

**A3. Step-size convergence** (C3): copy `frontend/src/simulation/` to a scratch directory, change `STEPS_PER_GYR` from 10 to 40 in `worldHistory.ts`, and rerun A2 against both copies.

**A4. Planetary systems** (P1, P2, C2, L1): `planet.generatePlanetsFor(s, 42, cfg)` for the first 250 main-sequence stars of seed 42. Output: 3.95 planets per star; 20.9% giants; 0 hot Jupiters; 30.3% of solid planets above 2.04 M⊕; 261 solid planets below 3 g/cm³; 39.6% of solids with life; life on 80.5% of ever-wet worlds; 197 lava worlds, with surface temperatures up to 8,007 K.

**A5. Physics spot checks** (M1, B1, G2, BH2, E1): `interiorHeat.tidalHeatFlow` for Io, Europa and Enceladus with real orbital elements; `binary.sTypeLimitAU` for α Cen and `pTypeLimitAU` for Kepler-16; `metallicity.gasMetallicity` gradient; Shakura–Sunyaev T_max computed independently; `atmosphericEscape.airRetained` for ten Solar System bodies; `climate.boilingPointK` at seven pressures.

**A6. Existing test suite:** the full suite passes at the audited commit: 60 files, 665 tests. The tests check internal consistency and calibrations; none of them catches the findings above.

## Appendix B: Key references

Chabrier 2003, PASP 115, 763 · Chen & Kipping 2017, ApJ 834, 17 · Duchêne & Kraus 2013, ARA&A 51, 269 · Eker et al. 2015, AJ 149, 131 · Fulton et al. 2017, AJ 154, 109 · Gladman 1993, Icarus 106, 247 · Goldblatt et al. 2013, Nat. Geosci. 6, 661 · Gough 1981, Sol. Phys. 74, 21 · Hamano et al. 2013, Nature 497, 607 · Holman & Wiegert 1999, AJ 117, 621 · Humphreys & Davidson 1979, ApJ 232, 409 · Hurley et al. 2000, MNRAS 315, 543 · Kasting et al. 1993, Icarus 101, 108 · Kopparapu et al. 2013, ApJ 765, 131 · Kroupa 2001, MNRAS 322, 231 · Lecavelier des Etangs et al. 2008, A&A 481, L83 · Leconte et al. 2013, Nature 504, 268 · Levesque et al. 2005, ApJ 628, 973 · Meadows et al. 2018, Astrobiology 18, 630 · Peale et al. 1979, Science 203, 892 · Pierrehumbert 2010, *Principles of Planetary Climate* · Raghavan et al. 2010, ApJS 190, 1 · Ribas et al. 2005, ApJ 622, 680 · Sana et al. 2012, Science 337, 444 · Segura et al. 2003, Astrobiology 3, 689 · Shakura & Sunyaev 1973, A&A 24, 337 · Spiegel & Turner 2012, PNAS 109, 395 · Walker et al. 1981, JGR 86, 9776 · West et al. 2008, AJ 135, 785 · Wright et al. 2011, ApJ 743, 48 · Zahnle & Catling 2017, ApJ 843, 122 · Zeng et al. 2016, ApJ 819, 127.
