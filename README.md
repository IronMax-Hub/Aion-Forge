# Aion Forge

> **What kinds of complexity emerge when simple rules are allowed to unfold over deep time?**

Aion Forge is an experimental procedural universe generator built around that question.

Rather than scripting outcomes, Aion Forge defines the laws of reality and observes the consequences.

Galaxies form.

Stars ignite.

Worlds emerge.

Life adapts.

Civilizations rise and fall.

Histories unfold.

Not because they were explicitly designed to do so, but because the conditions allowed them to exist.

Aion Forge is not a traditional game.

It is not a scientifically rigorous cosmology simulator.

It is a laboratory for possibility.

A place for programmers, dreamers, scientists, artists, students, philosophers, and curious minds to explore alternate realities and witness how extraordinary stories can emerge from simple truths.

---

## Philosophy

Aion Forge is built upon a simple belief:

> **Stories are not inputs. Stories are outputs.**

Instead of hardcoding events, Aion Forge attempts to create conditions under which meaningful narratives emerge naturally.

A civilization should not discover interstellar travel because a script dictates it.

It should discover interstellar travel because millions of small interactions made such an outcome possible.

Complexity should emerge.

Wonder should emerge.

Even surprise should emerge.

---

## Core Principles

### Emergence Over Prescription

Outcomes should arise naturally.

The engine should avoid scripting history whenever possible.

---

### Determinism Is Sacred

The same seed must always produce the same universe.

Reality should be reproducible.

Experimentation requires consistency.

---

### Wonder Over Accuracy

Scientific inspiration is encouraged.

Scientific perfection is not required.

Reality inspires the simulation.

Wonder justifies it.

---

### Observation Over Control

The observer influences laws and initial conditions.

The observer does not dictate outcomes.

Aion Forge is about discovery, not domination.

---

## Getting Started

Aion Forge has two parts: the frontend (the app itself) and a small local API that saves your Library, discoveries, experiment log and star bookmarks to MySQL.

**1. Database and API** (needs a running MySQL server and a database named `Aion-Forge`):

```bash
cd backend
cp .env.example .env    # then set DB_USER and DB_PASSWORD in .env
npm install
npm run dev             # API on http://127.0.0.1:4000; tables are created on first start
```

**2. Frontend**, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. The frontend forwards `/api` requests to the backend. If the backend is not running, the universe still generates and explores normally, but the status bar reports that saving is unavailable.

Saved universes store the seed and physical parameters rather than every star and planet, since those regenerate identically from the seed. Data saved in the browser by earlier versions is copied to the database once, on first start.

Enter a seed and click **Generate**, or click **Random seed** to generate a universe.

Sound is off by default; turn it on from the status bar.

**3. On an Android phone** (optional): `npm run android` in `frontend/` builds a debug APK with Capacitor (needs the Android SDK and a JDK). The phone runs the same simulation, so a seed gives the same universe as on the desktop. How it is packaged and laid out for a phone: `Documents/Mobile-APK.md`.

---

## Quick Start Seeds

These seeds produce universes worth exploring. Figures are for the default parameters under simulation rules v19, as the life survey counts them: planets with organisms today (microbial or more advanced), moon worlds with organisms, civilizations (living or in ruins), and how many systems host a civilization that got past farming.

| Seed | Galaxy Type | Planets with organisms | Moon worlds with organisms | Civilizations | Systems past agriculture |
|------|-------------|---:|---:|---:|---:|
| `404040` | Elliptical | 1724 | 710 | 4 | 2 |
| `3141592` | Spiral | 1704 | 548 | 3 | 1 |
| `100000` | Spiral | 1659 | 438 | 1 | 0 |
| `271828` | Elliptical | 1667 | 658 | 1 | 0 |
| `161803` | Elliptical | 1640 | 796 | 0 | 0 |
| `137035` | Irregular | 1417 | 131 | 0 | 0 |

With 2,000 stars per universe, default parameters give these seeds about 1,400 to 1,750 planets with organisms. Three-quarters of stars are red dwarfs, as in the Milky Way, and they outlive the universe; their planets, close in and often locked facing their star, get life easily, but under dim red light and their young stars' flares it nearly always stays microbial. Worlds absorbing more starlight than a moist atmosphere can radiate lose their oceans in a runaway greenhouse, and planets larger than about 1.75 Earth radii keep thick gas envelopes with no surface. A civilization begins when a lineage that eats other life and is heavier than a gram evolves enough information processing to count as a mind; under these rules that happens a handful of times per universe at most, and many of those species have since died out. Civilizations need fire to get past farming, and fire needs a mind that lives on land, exposed land and enough oxygen. For a quieter universe, change the laws instead: the **Fragile Life** preset leaves life on about one solid planet in twenty and no minds; **Abundant Life** and **Eternal Stars** give the most life.

Generating a universe takes about 20 seconds on a four-core machine (under a minute on one core), because every planet's life is evolved through its history; the survey runs in the background on all cores but one, with a progress bar.

---

## Navigation

```
Galaxy view
  → click a star             → Star inspector (right dock)
  → Open system              → Planetary system + planet table
  → click a planet or row    → Planet inspector
  → Approach (or double-click the planet) → Planet view, in orbit
  → Leave orbit              → Back to the planetary system
  → Scan biosphere           → Biosphere inspector
  → Check for civilization   → Civilization inspector
  → click the galactic centre → Central black hole panel → Approach for a close-up
  → Timeline (sidebar)       → Universe timeline
  → Encyclopedia (sidebar)   → An entry for the galaxy, any star, planet, biosphere or civilization
  → Physics (sidebar)        → Every rule the universe runs on, and what it did here
  → Great Filter (sidebar)   → How many worlds pass each step from a solid surface to a civilization
  → breadcrumb (top bar)     → Back to any earlier level
```

The biosphere inspector opens a **Tree of life**: every lineage that evolved on the world, when it branched and when it died out.

---

## Experimenting with Reality

Click **Edit parameters…** to adjust the six fundamental constants:

* **Gravity Strength** — moves every orbit in by √gravity, so the climate, orbital periods and tidal locking feel a closer star
* **Expansion Rate** — scales the galaxy's size
* **Stellar Ignition Threshold** — reshapes the star mass draw: above 1, fewer heavy stars and more small, long-lived ones
* **Entropy Rate** — divides every star's lifespan
* **Emergence Sensitivity** — multiplies the rate at which life begins on liquid water
* **Intelligence Modifier** — sets how much information processing a mind needs

The Physics page says exactly what each law reaches, and what it does not.

Apply a **Preset** for curated configurations, or adjust sliders manually.

Click **Set as baseline**, change the parameters, then click **Compare with baseline** to measure the consequences of changing the rules of existence.

---

## Sound

Aion Forge includes a fully procedural audio system — no audio files, all synthesized.

Sound should amplify wonder without demanding attention.

Each view has a distinct ambient atmosphere:

* **Galaxy view** — deep cosmic drones, sparse movement
* **Stellar systems** — lighter harmonic textures
* **Biospheres** — warmer, living frequencies
* **Civilizations** — abstract motifs that evolve with technological stage
* **Timeline** — slow, contemplative atmosphere

Discoveries are acknowledged with restraint — a quiet tone, not a fanfare.

Sound is off by default. Use **Sound off / Sound on** in the status bar to toggle it, and the settings icon beside it to adjust individual layer volumes. Interface click sounds start at zero volume.

---

## The Observatory Interface

Aion Forge is laid out like scientific observatory software:

* **Top bar** — the universe ID (AF-U-XXXX-XXXX), a clickable breadcrumb, and seed controls (Generate, Random seed, Regenerate)
* **Left sidebar** — universe facts, overlays that mark every star system holding life or a civilization (living or in ruins), current physical parameters, comparison and experiment log, saved universes (Save universe, Library, Import), the Encyclopedia, Physics and Great Filter, and the timeline
* **Centre** — the rendered galaxy, planetary system or planet seen from orbit; tool panels open over it
* **Right dock** — the selected star, planet table, planet, biosphere or civilization, with values in physical units (M☉, L☉, K, AU, Gyr) and spectral types
* **Status bar** — hints, a scale bar (light-years in the galaxy, AU in a system, kilometres around a planet), and sound controls

Distances in light-years use a display convention — the default galaxy radius of 120 simulation units is shown as about 50,000 ly — and do not affect the simulation.

---

## Current Status

**Simulation rules v19** (November 2026). Version 1.0 and its enhancements, Worlds Up Close, The Galaxy Through Time, the central black hole, and the October 2026 scientific audit's corrections are in. What each rule says, where it comes from and how far to trust it is on the in-app **Physics** page and in `Documents/physics.md`.

### Simulation

* Deterministic galaxy generation — spiral, elliptical, irregular — with a central black hole whose mass suits the galaxy's type, and heavy elements that build up generation by generation, fastest near the centre
* 2,000 stars per universe, their masses drawn from the Kroupa initial mass function (three-quarters are red dwarfs, as in the Milky Way). Stars form throughout the universe's 13.7 billion years, so the old heavy ones have become white dwarfs, neutron stars and black holes. Stars brighten as they age, swell into giants that engulf their inner planets, and stay magnetically active and flaring while young
* Binary stars — about half of Sun-like stars have a companion; planets orbit one star or both, only where the pair allows a stable orbit, and receive both stars' light
* Planetary systems that form beyond the young star's heat, with orbits scaled to the star's mass; some systems get a hot Jupiter. Planets from small rocky worlds to super-Jupiters, sized by a measured mass–radius relation (Chen & Kipping 2017); above 1.75 Earth radii they keep gas envelopes and become sub-Neptunes with no surface. Neighbours packed too closely throw each other out
* Moons — large moons for rocky planets, families of moons for giants, tidally heated; moon worlds have their own histories and can carry life
* Physical planets — gravity, escape velocity, orbital period, axial tilt that can wander without a large moon, rotation, tidal locking, water set by where the planet formed, and heat from inside
* Geography of solid planets — plates, continents, mountains, oceans and elevation on a grid of cells
* World histories over billions of years — the star brightens, volcanoes outgas CO₂, land and seafloor weather it away, worlds freeze over and thaw, air escapes to space, and oceans boil once a world absorbs more than a moist atmosphere can radiate (the runaway greenhouse limit). Today's climate, pressure and atmosphere are what that history leaves
* Life that begins by chance where there is liquid water, then branches, adapts and dies out inside its planet's history: lineages with a six-trait genome, sharing energy through food chains, shaped by light, oxygen, gravity, ultraviolet, flares and catastrophes; their oxygen and methane change the air
* Minds that evolve, not ones that are rolled: a lineage that eats other life, weighs more than a gram and processes enough information becomes a mind. Its civilization farms, and with fire on land it can go on to industry, communication networks and space, or collapse and leave ruins
* Life, minds and civilizations are **speculative models**: Earth is the only example of life known. Under v19, life is common and minds are rare, a few per universe at most, because red dwarfs' dim light rarely lets life fill its air with oxygen. Each rule on the Physics page is marked established, approximate, speculative or illustrative
* Atmospheric composition — N₂, CO₂, O₂, CH₄ and ozone as the world history left them, water vapour by Clausius–Clapeyron, N₂O from living biomass, CO₂, NO₂ and CFCs from industry, and on giants hydrogen, helium, methane or carbon monoxide by chemical equilibrium, ammonia and water. Oxygen alone does not prove life: worlds that lost water to space keep its oxygen
* Transit spectra — each planet's transit depth from 0.3 to 20 µm, observed over 1 to 200 transits with photon noise, each gas's detection significance, and a verdict from strong biosignature to technosignature. How it works: `Documents/spectrum.md`
* The Encyclopedia — an entry for the galaxy and every star, planet, moon world, biosphere and civilization, written from the simulation's data, each sentence traceable to the fields it came from
* The Great Filter — how many worlds pass each of twelve gates, from a solid surface to a lasting civilization, and which gate lets the fewest through
* The Physics page — every rule, its constants read from the code, its source and limits, which law reaches it, and what it did to the universe on screen
* Historical event recording and timeline replay
* Configurable laws of physics with experiment comparison
* Universe persistence, library, export/import, and discovery collections
* Life survey run on all cores but one in background workers; saved counts are marked when they were made under older rules. Every world's facts go into one index (`universeIndex.ts`) that the encyclopedia, Great Filter and Physics page read
* Over 700 tests: determinism for every layer, physics and climate checks, population probes against measured astronomy, and reference entries

The simulation rules carry a version number (`frontend/src/simulation/version.ts`). It rises whenever a change alters what a seed produces, so older saved figures can be recognised. What changed from v18 to v19: `Documents/Phase-3-v18-to-v19.md`.

### Enhancement I — The Observatory

A complete visual and experiential transformation.

* Unified design system — CSS custom properties covering color, typography, spacing, motion
* Premium observatory interface — universe identity header with unique ID, console section grouping, observatory language throughout
* Contextual inspector system — all panel types built on the inspector vocabulary
* Enhanced timeline — category icons, importance-scaled cues, improved replay
* Gallery and discovery journal — universe cards, browsing, discovery collections
* Empty state design — intentional experiences for every unloaded state
* Motion system — entrance animations, hover transitions, standardized timing
* Responsive layouts — ultrawide, desktop, laptop, tablet

### Enhancement III — Sound Design

A fully procedural audio system.

All sound is synthesized via the Web Audio API — no audio files.

* Seven contextual ambient profiles with smooth crossfades
* Discovery sounds — tuned for restraint, not reward
* Interface audio — tactile confirmations, barely audible
* Reality Laboratory audio — slider pitch tracks value, preset and comparison cues
* Timeline audio — importance-scaled event cues, legendary moment tones, replay rhythm
* Civilization presence layer — abstract motifs that grow in harmonic complexity with advancement
* Adaptive mixing — ambient remains dominant at all times
* Per-layer volume controls with persistent preferences

### Enhancement V — Celestial Rendering

A visual transformation from particle simulation to astronomical experience.

* Galaxy dust drawn by a custom GLSL shader with circular soft-edged fragments
* Three-layer Gaussian star glow — bright core, inner ring, outer halo — in steady light, without twinkling
* Stellar classification visuals — O through M spectral types each carry distinct size and glow
* Star size from luminosity and spectral class; rare stars stand out
* A real night sky behind the galaxy — 5,000 fixed foreground stars and a few hundred faint distant galaxies chosen by the seed, on a sky that stays infinitely far away; it never reads or feeds the simulation
* Nebula accents placed by the galaxy's seed
* ACES filmic tone mapping
* Cinematic camera — damping, slow auto-rotation, eased focus tweens

### The central black hole

The galaxy's central black hole can be approached for a close-up, drawn by tracing light along its curved paths in a GLSL shader: the shadow, the photon ring, and a thin accretion disc or faint hot flow, Doppler-brightened on its approaching side and coloured by its temperature. The camera is a static observer, and a CPU copy of the shader's light paths checks it against exact Schwarzschild results in the tests. Quality levels trade detail for speed; the heavier ones need a capable GPU. What was checked and how: `Documents/Phase-2-Report-2026-10.md`.

### Worlds Up Close — the planet view

A third level of zoom: from a planetary system down to a single planet seen from orbit. Everything drawn comes from the simulated world; presentation choices (fine detail, cloud patterns, storms, rings) come from each planet's own seeded visual stream, so the same planet always looks the same, and nothing drawn feeds back into the simulation.

* Approach glides the camera into orbit; Leave orbit returns to the system
* Solid planets drawn from their surface grid — oceans, ice, dry and wet land, and relief, lit by their star's colour and a day–night terminator
* Rotation — tidally locked worlds keep one face to their star; free planets spin on their tilted axis, one real day compressed to about a minute on screen
* Air and clouds — a scattering rim coloured by the star's spectrum and the air's actual pressure, and clouds that thicken to full overcast on crushing worlds and drift slowly
* Gas and ice giants — bands that multiply with faster spin, a palette by cloud-top temperature (methane blue, ammonia cream and brown, cloudless azure, dark glowing hot Jupiters), storms and sometimes rings
* Molten ground — glowing cracks and heat shimmer where the surface is hot enough to melt
* Life seen from orbit — vegetation on moist land and in shallow seas, its strength following the biosphere and its colour the starlight (green under Sun-like stars, yellow-orange under K stars, dark red to near-black under red dwarfs, blue-green to blue under hotter stars); city lights on the night side from the industrial stage on, growing with population; a few dim lights after a collapse; and a faint shell of orbital points around space-age worlds
* Each globe is baked once on the GPU during the approach and cached for the last five planets visited, so older graphics cards stay responsive
* Reduced motion is respected

The planet inspector shows the same world in figures: physical properties, a Surface section for solid planets (gravity, pressure, rotation, tilt, ocean / land / ice, habitable area, temperature range) and a Cloud tops section for giants.

---

## Technology

### Current Stack

* React
* TypeScript
* Vite
* Web Audio API
* Web Workers — the life survey runs off the main thread
* Three.js — galaxy, system and planet rendering
* GLSL — custom shaders for star glow, dust, the night sky, the planet view (globe baking and lighting, atmosphere, clouds, rings) and the black hole's light paths
* Capacitor — the Android app (`frontend/android/`)
* Node.js + Express + mysql2 — local API for saved data (`backend/`)
* MySQL — Library, discoveries, experiment log, star bookmarks
* Vitest — determinism, physics, climate, rendering-data and formatting tests (frontend); record validation tests (backend)
* GitHub Actions — types, lint and tests for the frontend and backend on every push to `development` and every pull request into it

---

## Contributing

Begin by reading:

* `CLAUDE.md` — engineering philosophy and contributor guidelines
* `Documents/PROJECT_CHARTER.md` — the vision and purpose
* `Documents/SYSTEM_SPEC.md` — the design specification: what exists in a universe and how the layers relate
* `Documents/SIMULATION_RULES.md` — the laws of behaviour every simulation layer follows (determinism, causality, thresholds, feedback)
* `Documents/ROADMAP.md` — development phases
* `Documents/physics.md` — every rule and constant the simulation uses, with sources; the in-app Physics page shows the same from the code
* `Documents/evolution.md` — how life, minds and civilizations evolve
* `Worlds-Up-Close.md` and `Worlds-Up-Close-Revision-1.md` — the plan for planets, their histories and the planet view (the revision takes precedence)
* `Documents/Fixing-Plan-2026-11.md` — the current plan, from the October 2026 scientific audit
* `Documents/stats.md` — life counts and timings recorded after each change to the rules (`npm run stats` in `frontend/`; `npm run probes` checks populations against measured astronomy)
* `Documents/SHOWCASE.md` — notable seeds and what to look for in them

Work on a branch and open pull requests into `development`, where CI runs.

Contributions must preserve determinism, understandability, emergence, and wonder.

---

## License

License information will be added as the project evolves.

---

## Final Thought

Every universe begins with a seed.

Every seed becomes a possibility.

Most possibilities are never realized.

This repository is an attempt to realize one of them.

Welcome to Aion Forge.

Let's see what emerges.
