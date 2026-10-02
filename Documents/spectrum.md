# Spectrum

How each planet's air is read from afar through its transit spectrum (Worlds Up Close, Phase B), what the reading can and cannot show, and the decisions behind it.

The plan is `Worlds-Up-Close.md` (Phase B) as amended by `Worlds-Up-Close-Revision-1.md`. The code lives in `frontend/src/simulation/` (`atmosphereComposition.ts`, `clouds.ts`, `spectrum.ts`, `observation.ts`, `detection.ts`) and `frontend/src/ui/` (`SpectrumPanel.tsx`, `spectrumChart.ts`, `spectrumDiscovery.ts`). Each module's header says why it exists, how it works and its limits; this document collects what they decide together.

Nothing here changes a universe. Phase B reads what the world history and evolution left, so it changes no outcome and no rules version.

---

## The chain

| Step | Module | In | Out |
|---|---|---|---|
| B1 Composition | `atmosphereComposition.ts` | the planet, its civilization | mixing ratios of each gas, today |
| Clouds | `clouds.ts` | the planet, its composition | cloud cover and top pressure |
| B2 Spectrum | `spectrum.ts` | planet, star, composition, clouds | transit depth on 600 bins, 0.3–20 µm |
| B3 Observation | `observation.ts` | spectrum, number of transits | noisy depths and their uncertainties |
| B4 Detection | `detection.ts` | observation, the model | significance per gas, a verdict |
| B5 Panel | `SpectrumPanel.tsx` | all of the above | the Spectrum tab |

### B1 · What the air holds

- **Solid planets:** read from the world history's final state (Revision 1): the background gas as N₂; CO₂, O₂ and CH₄ as the loop left them; ozone from the loop's column; water vapour by Clausius–Clapeyron at the surface temperature, at Earth's relative humidity times the planet's wetness, never more than its whole water inventory, and all of it while the oceans are steam.
- **Life:** N₂O from living biomass under oxygen, Earth's pre-industrial 270 ppb at Earth's biomass. Life that has died out leaves none.
- **Technology:** an active civilization adds Earth's present-day amounts per head, times its population: CO₂ and NO₂ from the industrial stage, CFC-11 and CFC-12 from the information age. A collapsed one adds nothing.
- **Giants:** H₂ and He, with carbon as CH₄ or CO by the equilibrium CH₄ + H₂O ⇌ CO + 3 H₂ at the cloud tops (equal at 1,112 K), and NH₃ and H₂O cold-trapped at their saturation pressure.
- **The deliberate false positive:** a planet that lost water to space keeps the oxygen of its photolysis, with no life at all. Seed 100000 has 137 such lifeless oxygen worlds.

### Clouds

One deck per planet, its top at the tropopause, 0.1 bar (Robinson & Catling 2014). Cover: thick air clouds over from 10 bar to full at 90 bar (the A6 rule, shared with the globe), or two-thirds of a solid planet at Earth's humidity, scaled down in drier air. Giants are covered where water condenses at 1 bar, and hot giants are clear.

### B2 · The spectrum

An isothermal limb (Lecavelier des Etangs et al. 2008): the scale height H = kT/(μ·m_u·g); at each wavelength the air turns opaque at a height z = H·ln(σ/σ_ref) above the reference level (the surface, or 1 bar for giants); the depth is (R_p + z)² / R★², at most 100%. Cross-sections are Rayleigh scattering from each gas's polarisability plus Gaussian bands, with strengths from approximate integrated band strengths (the table in `spectrum.ts` gives each source). Under the cloud deck z is at least the deck's height.

### B3 · Observing

Photon noise per bin follows the star's light (luminosity and Planck spectrum), with one transit of a Sun-like star giving 30 ppm per bin at 1 µm. Each transit is its own measurement, drawn from the seeded SPECTRUM stream; n transits are the mean of the first n, so a longer look adds to a shorter one and the same observation always shows the same data.

### B4 · Detection

A gas's significance is √(χ²_without − χ²_with) against the data, the gas removed from the model and the others filling its share. Detected means ≥ 3σ. The verdict is the first that applies:

| Detected | Verdict |
|---|---|
| CFC-11 or CFC-12 | Technosignature |
| O₂ or O₃, with CH₄ | Strong biosignature (chemical disequilibrium) |
| CH₄ on a temperate (250–350 K) solid world, or N₂O | Possible biosignature |
| O₂ or O₃ | Ambiguous: could be abiotic |
| any other gas | Atmosphere detected, no biosignature |
| nothing | No detection at this depth |

### B5 · The panel

The Spectrum tab shows the data as 60 display points (inverse-variance means of runs of ten bins) with 1σ error bars, the model, and the bands of the detected gases only; a transits slider from 1 to 200; the significance table; and the verdict. A universe's first strong biosignature and first technosignature can each be recorded once as a discovery.

---

## Decisions

### Owner decisions

- **N₂O is made** (B1, 2026-10-02): from living biomass, not left out for want of a nitrogen cycle.
- **Hot giants do what real ones do** (B1, 2026-10-02): methane turns to carbon monoxide above ~1,100 K.

### Choices made while building, open to review

Each was reported when made; none has been changed by the owner yet.

- **Clouds** (B2): the rule above. The spec says only that a deck flattens the spectrum.
- **The instrument** (B3): 30 ppm per bin for one transit of a Sun-like star at 1 µm (`REFERENCE_NOISE_PPM`). This one number sets how hard every planet is to read.
- **Transits add up** (B4): each transit is its own measurement, so evidence accumulates. The plan's B3 seeded the noise by the number of transits, which redrew all the data at every count and made verdicts flicker at 3σ.
- **The verdict table** (B4): N₂O reads as a possible biosignature, and "Atmosphere detected" is added for planets showing only gases such as water or CO₂.
- **Giant bands** (B2): CO and NH₃ bands are added to the plan's band table, for the gases B1 gives giants.
- **The axis in percent** (B5) from 10,000 ppm, where ppm labels no longer fit the panel.

### Fixed

- **Transit depth is capped at 100%** (found in B5): a planet larger than its star, around a white dwarf, had depths far above 100%. It now hides the whole star, and no light passes through its air. Seed 100000 has 170 such planets; one of them had been B4's only strong biosignature.

---

## Measured (seed 100000, all 8,537 planets, 200 transits)

| Verdict | Planets |
|---|---:|
| No detection | 653 |
| Atmosphere detected | 7,213 |
| Ambiguous | 45 |
| Possible biosignature | 626 |
| Strong biosignature | 0 |
| Technosignature | 0 |

- Of the 137 lifeless oxygen worlds: 2 ambiguous, 123 atmosphere only, 12 nothing. None reads higher than ambiguous, as the plan requires.
- Eight planets carry CFCs from an active information-age civilization; none is detected.
- Verdicts stepped back from one transit count to the next (1, 10, 50, 200) 5 times in about 25,600 steps, by noise at the 3σ line.

An Earth twin (Earth's air today, before industry), around the Sun and around a 0.26 R☉ red dwarf:

| Transits | Around the Sun | Around a red dwarf |
|---:|---|---|
| 1 | nothing | nothing |
| 10 | nothing (H₂O 2.6σ) | atmosphere (H₂O 4.1σ) |
| 50 | atmosphere (H₂O 3.9σ) | atmosphere (H₂O 7.2σ) |
| 200 | atmosphere (H₂O 7.0σ, O₂ 1.8σ) | atmosphere (H₂O 13.9σ, O₂ 2.1σ) |

Earth's oxygen is not detected even after 200 transits; its methane is far too thin to see. (The B3 commit's "O₂ at ~3σ" came from a quick estimate that removed O₂ without the other gases filling its share, and was too high.)

Speed: one spectrum takes ~0.4 ms (budget 10 ms); observing 200 transits and testing every gas, ~9 ms.

---

## What the reading cannot show

- **Not line-by-line radiative transfer.** Band strengths are band averages, approximations whose sources are listed. An average overstates how opaque a band of saturated lines is, so features come out taller than real ones: Earth's CO₂ band at 4.3 µm reaches ~120 km, where detailed models give tens of km.
- **No emission or reflected-light spectra.** Transmission only.
- **One temperature and one composition at every height.** No stratosphere, no cold trap above a solid surface, no photochemistry with height.
- **No refraction, collision-induced absorption or hazes;** one opaque cloud deck.
- **Photon noise only,** from one instrument that sees every star as if from the same distance. No instrument systematics or starspots; every transit counts the same, whatever its length.
- **The observer is handed the right model:** the planet's own temperature, gravity, clouds and the other gases' amounts. A real retrieval must fit those too and would find less.

---

## Surprises (kept, CLAUDE.md principle 4)

- **Life is seen by its methane or N₂O, never by both oxygen and methane.** 626 planets show a possible biosignature: methane on a temperate world, or N₂O. Oxygen and methane together, the strong biosignature, are not detected anywhere: where oxygen builds up it destroys the methane (the world history's CH₄ loss rises with O₂), as on Earth.
- **A smaller planet is not always harder to read.** At the same density its gravity falls with its size, its air stands taller in proportion, and the signal (∝ R_p·H) stays about the same. At the same gravity it is weaker.
- **Red dwarfs are easier, not harder.** Their light is dimmer, but their small disks make every planet's air a larger share of the transit, and that wins.
- **Planets that hide their whole star.** Around white dwarfs, about the Earth's size, 170 planets block all the starlight, and their air can never be read.

---

## Open

- **Technosignatures are practically undetectable.** CFCs absorb in the mid-infrared, where few photons arrive; on an Earth-gravity world even 20,000 times Earth's CFC-12 stays under 3σ after 200 transits. Strong biosignatures are absent too. So the panel's "record this universe's first" will rarely appear. The levers are the instrument (`REFERENCE_NOISE_PPM`), how much CFC a civilization emits, or longer observations; this is an owner decision.
