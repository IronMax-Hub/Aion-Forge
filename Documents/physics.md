# Physics

How the physics of stars and planets changes what worlds become, and the record of every change to it. It is modelled on `evolution.md`.

The plan is `Galaxy-Through-Time.md`. The code lives in `frontend/src/simulation/`. The Physics page (`frontend/src/ui/physics/`) shows every rule with its constants and what it did in the open universe. This document records why the constants have their values and what they did when they were measured.

---

## Step 3: atmospheric escape (AE1–AE4, rules v11)

A world's air is not permanent. A young star's extreme ultraviolet (XUV) heats a planet's upper atmosphere. A world whose gravity is weak for the energy it receives loses its air to space, and its water with it.

### The star's XUV (AE1, `star.ts`)

| Constant | Value | Why |
|---|---|---|
| `XUV_SATURATED_SHARE` | 10^(−3.13) ≈ 7.4 × 10⁻⁴ | The saturated X-ray share of a star's light (Wright et al. 2011) |
| `ACTIVITY_DECAY_EXPONENT` | 1.23 | After saturation, activity falls as (t / t_sat)^(−1.23) (Ribas et al. 2005) |
| `SATURATION` | 0.1 Gyr from 5,200 K, rising linearly to 0.8 Gyr at 3,900 K and to 8 Gyr at 2,700 K | Red dwarfs stay active far longer (West et al. 2008). This also sets flare UV, through the one activity curve (decision 42) |
| `ENVELOPE_FADE_K` | 6,500–7,500 K | The law describes stars with a convective envelope. Hotter stars are X-ray faint, so the law fades out across this range (decision 37) |
| `SOLAR_XUV_TODAY` | 3.4 × 10⁻⁶ L☉ | The law is scaled (`ACTIVITY_SCALE`, about 0.51) so the model's Sun gives the measured value at 4.6 Gyr. The photosphere's share below `XUV_MAX_NM` = 100 nm is added |

- **Fluence.** The fluence is integrated exactly, in closed form (`xuvFluence`). A world's dose therefore does not depend on how its history is divided into steps.
- **After the main sequence.** The XUV is held at the main-sequence track's end value. This is a modelling choice: cool giants are X-ray faint.

### Air escape (AE2, `atmosphericEscape.ts`)

- **Dose.** A world's dose X is its XUV fluence, counted in Earth doses: X⊕ = 1 is the model's Sun at 1 AU over 4.6 Gyr.
- **Critical dose.** X_crit = K · (v_esc / 11.2 km/s)⁴. The slope is the cosmic shoreline of Zahnle & Catling (2017).
- **Share kept.** A world keeps the share r = max(0, 1 − (X / X_crit)²) of its air. Every gas loses the share the background gas lost.

| Constant | Value | Why |
|---|---|---|
| `ESCAPE_K` | 10 | It sits between Titan, which needs K above about 3.6, and Mars, which would keep some air above about 11. The Solar System allows only that window, so K is not a tuning knob (decisions 5 and 26, decided 18 Oct 2026 as recommended). Reference table: Earth keeps 99%, Venus 93%, a Titan-like world 87%; Mars, Mercury, Ganymede-like and Moon-like bodies keep none |

**Water.** Water escapes by the same drivers (decision 40), as energy-limited escape that removes an amount rather than a share.
- Water is lost while the upper air is moist. That begins at a threshold `MOIST_THRESHOLD` that falls with the background gas: 340 K at 1 bar, falling 42.5 K per tenfold drop, to 255 K at 0.01 bar (Wordsworth & Pierrehumbert 2014).
- The loss ramps up over `MOIST_RAMP_K` = 20 K.
- It is calibrated so a fully moist Earth loses `EARTH_OCEANS_LOST_PER_GYR` = 0.29 Earth oceans per Gyr under today's Sun (heating efficiency 0.15).

**Taken with AE2 (18 Oct 2026):**
- **Triple point (decision 27).** Below `WATER_TRIPLE_POINT` (0.006117 bar) there is no liquid water. Below 1 atm, boiling follows a curve through the triple point.
- **One atmosphere draw (decision 43).** Every planet now draws its air the same way (`ATMOSPHERE_DRAW`), and escape alone decides what each keeps. Planets below `OWN_AIR_STREAM_BELOW_MASS` = 0.05 M⊕ draw from their own stream (`SALT.AIR`), so every other planet keeps its draws.
- **Past giants (decision 44).** Today's remnants shone as giants. `luminosityAt` and `temperatureAt` include that phase, at `PAST_GIANT_TEMPERATURE_K` = 4,000 K, the middle of the giant range. Planets inside the giant's radius were engulfed.
- **Gravity setting (decision 45).** Escape reads the planet's own escape velocity, not the laboratory's gravity setting.

### Lost air on screen (AE3)

- **Planet panel.** It reads "Formed with crushing air · none today" when the air class changed, and "Air lost to space · 1.29 Gyr ago" for a stripped world.
- **Entry.** The encyclopedia entry says the same.
- **Timeline.** It records "The last of its air was lost to space." (historic).

### Measured (AE4, 18 Oct 2026)

The figures come from the stats harness, entry "2026-10-18 · rules v11" in `stats.md`. They are compared with the rules v10 entry of 17 Oct 2026 (commit 67d0e26), which comes before AE1.

**Systems with organisms**

| Preset | v10 | v11 | Change |
|---|---:|---:|---:|
| Familiar Reality (100000 / 42 / 7777) | 987 / 968 / 1,006 | 912 / 891 / 933 | −7.6% / −8.0% / −7.3% |
| Slow Cosmos | 1,284 / 1,309 / 1,331 | 1,202 / 1,228 / 1,259 | −6% |
| Fragile Life | 425 / 393 / 425 | 384 / 368 / 393 | −6 to −10% |
| Eternal Stars | 1,217 / 1,220 / 1,243 | 1,115 / 1,125 / 1,128 | −8% |
| Rare Intelligence | 989 / 972 / 1,008 | 917 / 897 / 933 | −7% |
| Abundant Life | 1,184 / 1,183 / 1,211 | 1,102 / 1,115 / 1,120 | −6% |

This is inside the ±25% target, so K is not tuned.

**Familiar Reality, before and after**

| Measure | v10 | v11 |
|---|---:|---:|
| Solid planets stripped of their air | — | 23.5–25.2% |
| Air today (none / thin / moderate / thick / crushing), seed 100000 | — | 1,823 / 196 / 629 / 2,085 / 2,318 |
| Runaway greenhouse | 2.8–3.3% | 1.4–1.6% |
| Oceans lost | 14.1–14.5% | 21.7–22.8% |
| Liquid water today | 23.8–24.1% | 15.0% |
| Living today | 44.6–46.2% | 39.5–41.7% |
| Civilizations | 82–95 | 52–68 |
| Worlds with a mind (Great Filter) | 72–86 | 52–71 |
| Engulfed by past giants, seed 100000 | — | 109 planets |

- **Living worlds by host star**, seed 100000 (M / K / G / F or hotter / white dwarf): 1,235 / 1,215 / 410 / 75 / 2.
- **Eternal Stars** is stripped most, with 41% of its solid planets airless; the other presets lose 22–31%.
- **The Great Filter** is still "Life's oxygen filled the air" under the default parameters.

### Surprises (kept, CLAUDE.md principle 4)

- **Water goes before it boils.** Under the young Sun's saturated XUV, energy-limited escape takes an Earth's ocean at 0.42 AU within its first 100 Myr. Hot, water-poor worlds now lose their water rather than run away, so runaway greenhouses halved instead of doubling (decision 6's check is not triggered). Giants still drive runaways.
- **Life outlives its air.** Some worlds keep microbial life under their ice after the last of their air is gone, for example seed 100000, planet 1940 b, around an M5 dwarf, which formed with crushing air.
- **Snowballs that thicken.** Some frozen worlds formed with a trace of air hold several bar today, gases their histories added (seed AF-U-3093-7997, planet 0856 c: 5.56 bar).
- **Minds feel it most.** Systems with organisms fell by 8%, but civilizations fell by about a third (seed 100000: 89 → 53). Not yet traced; open water today fell by more than a third as well.

### Open after AE4

- **Escape as a share (decision 38)** still strips thick air as completely as thin air. A rule that removes a mass would let thick atmospheres last longer.
- **XUV from hot white dwarfs** (their photospheres) is not included.

---

## Step 4: metallicity (MZ1–MZ3, rules v12)

Every generation of stars returns heavier elements to the gas the next forms from. Planets are built from those elements.

### The galaxy's enrichment (MZ1, `metallicity.ts`)

Z(R, t) = Z_floor + y · (1 − e^(−t / τ(R))), with τ(R) = τ_core · e^(R / R_τ), and [Fe/H] = log10 Z. R is the distance from the centre in the disc plane as a share of the galaxy's scale; t is cosmic time.

| Constant | Value | Why |
|---|---|---|
| `METALLICITY_FLOOR` | 10⁻³ Z☉ | The first gas: [Fe/H] = −3, like the oldest halo stars |
| `ENRICHMENT.spiral` | y 1.6, τ_core 1 Gyr, R_τ 0.233 | The gas where and when the Sun formed (R 0.52, 9.1 Gyr) is solar; the centre levels off near +0.2; today's gradient is −0.049 dex per kpc (observed about −0.06) |
| `ENRICHMENT.elliptical` | y 1.6, τ_core 0.3 Gyr, R_τ 0.5 | One early, fast burst: a star born at 1 Gyr at R 0.34 is +0.12, and today's gas is +0.20 everywhere |
| `ENRICHMENT.irregular` | y 0.5, τ_core 3 Gyr, R_τ 0.233 | Slow formation, and outflows that carry metals away: levels off at −0.30, like the Magellanic Clouds |

Constants per galaxy type were the owner's choice (decision 7, 18 Oct 2026) over the plan's one law.

### Each star's metallicity (MZ2, `star.ts`)

A star's [Fe/H] is its gas's where and when it formed, plus a normal scatter of `METALLICITY_SCATTER_DEX` = 0.1 dex from its own stream (`SALT.METALLICITY`). About 0.2 dex is observed near the Sun, much of it from stars migrating radially, which is not modelled. Every other draw is untouched. Seed 100000 (spiral): the median star is −0.18; stars older than 10 Gyr −0.80, younger than 2 Gyr −0.04.

### Planets from the disk's solids (MZ3, `planet.ts`)

mass = min(4,000 M⊕, drawn mass · 10^(α · [Fe/H])), with `METALLICITY_MASS_EXPONENT` α = 1 (decision 8). A body below 0.018 M⊕ is not a planet. This contradicts the observation that small planets' occurrence barely depends on metallicity (Buchhave et al. 2012; Petigura et al. 2018). It is kept as the simplest rule, with a tripwire: the alternative (scaling only the giants' path) is taken if living worlds around stars older than 10 Gyr fall by more than half against v11.

### Measured (MZ3, 18 Oct 2026)

| Seed | Planets | Too small | Living, stars > 10 Gyr | Systems with organisms | Civilizations |
|---|---|---:|---|---|---|
| 100000 | 8,428 → 7,650 | 778 | 880 → 713 (−19%) | 912 → 911 | 53 → 36 |
| 42 | 8,410 → 8,374 | 36 | 736 → 695 (−6%) | 891 → 884 | 52 → 49 |
| 7777 | 8,519 → 7,743 | 776 | 810 → 701 (−13%) | 933 → 907 | 68 → 40 |

The tripwire is not triggered. Seed 42's galaxy is metal-rich (1,620 of its stars above +0.1), so it barely changed.

**Giants against [Fe/H].** Stars hosting a giant, seed 100000, below −0.5 / −0.5 to −0.2 / −0.2 to +0.1 / above +0.1:
- v12: 28% / 32% / 43% / 55%.
- v11: 51% / 47% / 44% / 44%.

The relation now runs the right way but far shallower than the observed 10^(2[Fe/H]) (Fischer & Valenti 2005), and the model's giant share near solar metallicity is several times the observed. This is recorded for the owner; α is not changed.

### Surprises

- **Old stars keep their life.** Before building, the escape rule suggested that old stars' lighter rocky worlds would mostly be stripped. Living worlds around stars older than 10 Gyr fell by only 6–19%.
- **Minds fall harder than life again.** Systems with organisms barely moved (0 to −3%), while civilizations fell by up to 41%. Not yet traced.

### Measured (MZ5, 18 Oct 2026)

From the stats harness, entry "2026-10-18 · rules v12" in `stats.md`.

**Median [Fe/H] by star age**, Familiar Reality (0–2 / 2–6 / 6–10 / above 10 Gyr):

| Seed | Galaxy | Median [Fe/H] |
|---|---|---|
| 100000 | spiral | −0.04 / −0.09 / −0.32 / −0.80 |
| 7777 | spiral | −0.01 / −0.12 / −0.31 / −0.74 |
| 42 | elliptical | +0.21 / +0.21 / +0.20 / +0.14 |

The median star is not far from solar, so y is not tuned. In the elliptical, nearly every star is metal-rich (1,620 of 2,000 above +0.1).

**By the host star's [Fe/H]**, Familiar Reality, seed 100000:

| [Fe/H] | Stars | Planets per star | Giants | Median solid planet | Living today |
|---|---:|---:|---:|---:|---:|
| below −0.5 | 498 | 3.60 | 9% | 0.29 M⊕ | 913 |
| −0.5 to −0.2 | 455 | 3.69 | 11% | 0.51 M⊕ | 584 |
| −0.2 to +0.1 | 563 | 4.05 | 15% | 0.56 M⊕ | 703 |
| +0.1 and above | 472 | 4.03 | 22% | 0.60 M⊕ | 472 |

**Systems with organisms**, default parameters, v11 → v12: 912 → 911, 891 → 884, 933 → 907 (0 to −3%), inside ±25%.

- **More life around metal-poor stars.** The poorest stars host the most worlds living today (913, nearly two per star, against one per star above +0.1), on planets of half the mass. Not yet traced: these are also the oldest stars, whose worlds have had longest for life to begin.
- **Giants by [Fe/H].** The share of planets that are giants rises from 9% to 22% across the table. That is the observed direction, but far shallower than 10^(2[Fe/H]); recorded for the owner (decision 8).
