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

---

## Quick Start Seeds

These seeds produce universes worth exploring. Figures are for the default parameters under simulation rules v10, as the life survey counts them: worlds with organisms (microbial or more advanced), civilizations (living or in ruins), and how many systems host a civilization that got past farming.

| Seed | Galaxy Type | Worlds with organisms | Civilizations | Systems past agriculture |
|------|-------------|---:|---:|---:|
| `161803` | Elliptical | 3200 | 77 | 15 |
| `100000` | Spiral | 3297 | 89 | 13 |
| `271828` | Elliptical | 3304 | 86 | 11 |
| `137035` | Irregular | 3327 | 77 | 11 |
| `404040` | Elliptical | 3258 | 65 | 11 |
| `3141592` | Spiral | 3161 | 75 | 10 |

With 2,000 stars per universe, default parameters give every seed a similar amount of life; what differs is where it arises and what becomes of it. Life begins on most worlds with liquid water within a few hundred million years and evolves inside its planet's history. Most of it stays microbial: nearly half of living worlds are frozen over, with life under the ice and no light, and bodies larger than a microgram need an oxygen atmosphere that most worlds never get. A civilization begins when a lineage heavier than a gram evolves enough information processing to count as a mind, and about a third of them are ruins whose species died out. Civilizations need fire to get past farming, and fire needs exposed land and enough oxygen, so many stop at agriculture. For a quieter universe, change the laws instead: the **Fragile Life** preset leaves life on about a tenth of solid planets and no minds; **Abundant Life** and **Eternal Stars** give the most.

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
  → Timeline (sidebar)       → Universe timeline
  → breadcrumb (top bar)     → Back to any earlier level
```

---

## Experimenting with Reality

Click **Edit parameters…** to adjust the six fundamental constants:

* **Gravity Strength** — alters planetary orbital radii
* **Expansion Rate** — scales the galaxy
* **Stellar Ignition Threshold** — changes the mass distribution of stars
* **Entropy Rate** — alters stellar lifespans
* **Emergence Sensitivity** — controls how often life appears
* **Intelligence Modifier** — adjusts civilization emergence probability

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
* **Left sidebar** — universe facts, the Life markers switch (rings every star system with life and labels the nearest ones with their most advanced life form or civilization), current physical parameters, comparison and experiment log, saved universes (Save universe, Library, Import), and the timeline
* **Centre** — the rendered galaxy, planetary system or planet seen from orbit; tool panels open over it
* **Right dock** — the selected star, planet table, planet, biosphere or civilization, with values in physical units (M☉, L☉, K, AU, Gyr) and spectral types
* **Status bar** — hints, a scale bar (light-years in the galaxy, AU in a system, kilometres around a planet), and sound controls

Distances in light-years use a display convention — the default galaxy radius of 120 simulation units is shown as about 50,000 ly — and do not affect the simulation.

---

## Current Status

**Version 1.0, Enhancements I, III and V, and Worlds Up Close Phase A, A1–A10, and Phase C2 steps C2.1–C2.7 and C2.10, and Phase B steps B1–B3 (simulation rules v10)**

### Simulation

* Deterministic galaxy generation — spiral, elliptical, irregular
* 2,000-star stellar populations with full lifecycle simulation; red giants swell and engulf their innermost planets
* Planetary systems that form beyond the young star's heat, with planet types and resource abundance
* Planets from small rocky worlds to super-Jupiters of up to 13 Jupiter masses, sized by a measured mass–radius relation (Chen & Kipping 2017)
* Physical planets — gravity, escape velocity, orbital period, axial tilt, rotation, tidal locking, and water set by the snow line
* Geography of solid planets — continents, oceans and elevation on a grid of cells
* World histories over billions of years — the star brightens, volcanoes outgas CO₂, land and seafloor weather it away, oceans can boil off in a runaway greenhouse, and today's climate, pressure and atmosphere class are what that history leaves
* Life that begins by chance where there is liquid water, then branches, adapts and dies out inside its planet's history: lineages with a six-trait genome, sharing energy through food chains, shaped by oxygen, gravity, UV and catastrophes; their oxygen and methane change the air
* Civilization formation, technological progression, collapse and recovery
* Atmospheric composition — the gases each atmosphere holds today: N₂, CO₂, O₂, CH₄ and ozone as the world history left them, water vapour by Clausius–Clapeyron, N₂O from living biomass under oxygen, CO₂, NO₂ and CFCs from active industrial civilizations, and on giants hydrogen and helium, carbon as methane or (above ~1,100 K) carbon monoxide by chemical equilibrium, and cold-trapped ammonia and water. Oxygen alone does not prove life: worlds that lost water to space keep its oxygen
* Transit spectra — how deep each planet's transit is from 0.3 to 20 µm, from its gases, temperature and gravity: Rayleigh scattering and absorption bands of every gas above, over a scale height that light, hot air makes tall, under a cloud deck that thick or humid air and cold giants carry
* Observing transits — 1 to 200 transits, with photon noise that falls as the square root of their number and follows the star's light; the same observation always shows the same data
* Historical event recording and timeline replay
* Configurable laws of physics with experiment comparison
* Universe persistence, library, export/import, and discovery collections
* Life survey run in a background worker; saved counts are marked when they were made under older simulation rules
* Determinism tests for every simulation layer, among some 250 tests

The simulation rules carry a version number (`frontend/src/simulation/version.ts`). It rises whenever a change alters what a seed produces, so older saved figures can be recognised.

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
* GLSL — custom shaders for star glow, dust, the night sky, and the planet view (globe baking and lighting, atmosphere, clouds, rings)
* Node.js + Express + mysql2 — local API for saved data (`backend/`)
* MySQL — Library, discoveries, experiment log, star bookmarks
* Vitest — determinism, physics, climate, rendering-data and formatting tests (frontend); record validation tests (backend)

---

## Contributing

Begin by reading:

* `CLAUDE.md` — engineering philosophy and contributor guidelines
* `Documents/PROJECT_CHARTER.md` — the vision and purpose
* `Documents/SYSTEM_SPEC.md` — the design specification: what exists in a universe and how the layers relate
* `Documents/SIMULATION_RULES.md` — the laws of behaviour every simulation layer follows (determinism, causality, thresholds, feedback)
* `Documents/ROADMAP.md` — development phases
* `Worlds-Up-Close.md` and `Worlds-Up-Close-Revision-1.md` — the plan for planets, their histories and the planet view (the revision takes precedence)
* `Documents/stats.md` — life counts and timings recorded after each change to the rules
* `Documents/SHOWCASE.md` — notable seeds and what to look for in them

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
