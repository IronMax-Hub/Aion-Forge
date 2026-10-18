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
