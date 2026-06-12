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

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

Enter a seed and press **Enter**, or click **Forge Random** to generate a universe.

Sound begins on your first interaction.

---

## Quick Start Seeds

These seeds produce universes worth exploring:

| Seed | Galaxy Type | Notes |
|------|-------------|-------|
| `271828` | Elliptical | Rich in civilizations — 12 arose across the stellar population |
| `100000` | Spiral | Classic spiral, abundant life, 8 civilizations |
| `3141592` | Spiral | Dense biosphere network, 8 civilizations |
| `404040` | Elliptical | 8 civilizations; elliptical density at work |
| `13579` | Spiral | 7 civilizations, balanced distribution |
| `137035` | Irregular | Irregular galaxy yielding 7 civilizations — rare |

For a contrasting experience, try seed `161803` — a sparse, quieter universe.

---

## Navigation

```
Observatory (Galaxy View)
  → click a star         → Star Inspector
  → Explore System       → Planetary System
  → click a planet       → Planet Inspector
  → Scan Biosphere       → Biosphere Inspector
  → Scan Civilization    → Civilization Inspector
  → Chronicles (HUD)     → Universe Timeline
  → ← Observatory        → Return to Galaxy View
```

---

## Experimenting with Reality

Click **Laws of Reality** to adjust the six fundamental constants:

* **Gravity Strength** — alters planetary orbital radii
* **Expansion Rate** — scales the galaxy
* **Stellar Ignition Threshold** — changes the mass distribution of stars
* **Entropy Rate** — alters stellar lifespans
* **Emergence Sensitivity** — controls how often life appears
* **Intelligence Modifier** — adjusts civilization emergence probability

Apply a **Preset** for curated configurations, or adjust sliders manually.

Click **Establish Baseline**, modify the laws, then click **Compare Realities** to measure the consequences of changing the rules of existence.

---

## Sound

Aion Forge includes a fully procedural audio system — no audio files, all synthesized.

Sound should amplify wonder without demanding attention.

Each view has a distinct ambient atmosphere:

* **Galaxy view** — deep cosmic drones, sparse movement
* **Stellar systems** — lighter harmonic textures
* **Biospheres** — warmer, living frequencies
* **Civilizations** — abstract motifs that evolve with technological stage
* **Chronicles** — slow, contemplative atmosphere

Discoveries are acknowledged with restraint — a quiet tone, not a fanfare.

Audio controls appear at the bottom of the console. Click **◎** to mute. Click **⊹** to adjust individual layer volumes.

---

## The Observatory Interface

Aion Forge presents as a premium observatory instrument.

The left console contains:

* **Universe identity** — the unique universe ID (AF-U-XXXX-XXXX), galaxy type, and law modification state
* **Observe** — seed input, Forge Random, Reforge
* **Reality** — Laws of Reality panel, Experiment Log
* **Archive** — Archive Reality, Library of Aion, Restore Universe
* **Compare** — Establish Baseline, Compare Realities
* **Sound** — ambient audio controls

The right panel contains contextual inspectors — Star, Planet, Biosphere, Civilization — each presenting observatory-grade data.

---

## Current Status

**Version 1.0 + Enhancement I + Enhancement III**

Aion Forge has completed its first mature release and two post-release enhancements.

### Simulation (Phases 0–9)

* Deterministic galaxy generation — spiral, elliptical, irregular
* 2,000-star stellar populations with full lifecycle simulation
* Planetary system generation with habitability assessment
* Probability-driven biosphere emergence and evolutionary progression
* Civilization formation, technological progression, collapse and recovery
* Historical event recording and timeline replay
* Configurable laws of physics with experiment comparison
* Universe persistence, library, export/import, and discovery collections
* 22 determinism tests covering every simulation layer

### Enhancement I — The Observatory

A complete visual and experiential transformation.

* Unified design system — CSS custom properties covering color, typography, spacing, motion
* Premium observatory interface — universe identity header with unique ID, console section grouping, observatory language throughout
* Contextual inspector system — all six panel types rebuilt with the inspector vocabulary
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

Every universe is fully reproducible from its seed.

---

## Technology

### Current Stack

* React
* TypeScript
* Vite
* Web Audio API
* Three.js (galaxy rendering)
* Vitest (determinism test suite)

---

## Contributing

Begin by reading:

* `CLAUDE.md` — engineering philosophy and contributor guidelines
* `Documents/PROJECT_CHARTER.md` — the vision and purpose
* `Documents/SYSTEM_SPEC.md` — technical specification
* `Documents/SIMULATION_RULES.md` — simulation layer rules
* `Documents/ROADMAP.md` — development phases

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
