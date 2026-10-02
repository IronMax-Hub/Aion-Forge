# The plan: Planet Forge

*Forge a planet from its description, then stand on it*

Planning document · 3 Oct 2026 · PF0–PF1 done; PF2 next

Planet Forge takes a description of one planet (its star, body, air and surface) and builds ground you can land on and look around. It is a separate app from Aion Forge, in the same repository. Aion Forge sends it the planets its simulation produces; Planet Forge also runs on its own, from presets or from inputs you type in.

This replaces **Phase D — Standing on the surface** of `../Worlds-Up-Close.md`. Phase D's steps map onto this plan as shown in [From Phase D](#from-phase-d).

## Contents

- [Decisions](#decisions)
- [How the two apps fit together](#how-the-two-apps-fit-together)
- [Ground rules](#ground-rules)
- [Phases](#phases)
- [From Phase D](#from-phase-d)
- [Later](#later)
- [Risks](#risks)

---

## Decisions

Made by the owner, 2–3 Oct 2026.

| Question | Decision |
|---|---|
| Where it lives | This repository, in its own folder `planet-forge/`, with its own `package.json`, dev server, build and tests. Neither app imports the other's code. |
| How a planet is handed over | In the URL: Aion Forge opens Planet Forge with the planet's spec after `#`. No backend for now. |
| Same tab or new tab | A new tab, so Aion Forge keeps its place (for now). |
| How closely the ground matches the planet seen from orbit | At the scale of continents: Aion Forge sends its 642 surface cells and Planet Forge adds its own finer terrain. Except at the landing site, which matches exactly: Aion Forge sends what its globe showed there, and Planet Forge's ground agrees with it. |
| Where you land | *Go to the Surface* lands at the point of the globe facing the camera; clicking the globe first picks a specific site. |
| Life | Organisms later. The ground tint of vegetation stays, as on the orbit globe. |
| Landing on water | Float at the surface for now. |
| Giant planets | *Go to the Surface* appears only for planets with a solid surface. |

Why not match the fine detail everywhere: Aion Forge's orbit globe adds its own detail noise on the GPU, which moves coastlines by up to just under half a cell (about 500 km on an Earth-sized world). Reproducing that exactly would make Aion Forge's rendering code a contract that Planet Forge must copy and keep identical. Matching continents everywhere and the landing site exactly gives the part that matters, landing where you clicked, without that coupling. The spec can grow later if a full match is ever wanted.

## How the two apps fit together

```
Aion Forge (frontend/, port 5173)                 Planet Forge (planet-forge/, port 5174)
  simulation → planet's world history               spec → terrain → renderer → you, on the ground
  planetSpecOf(…) → Planet Spec  ──── URL #spec ───▶  presets / your inputs → Planet Spec
                                    contracts/planet-spec/
                         (schema and examples: data both apps test against)
```

- **The Planet Spec** (`../contracts/planet-spec/README.md`) is the whole interface: a self-contained, versioned description of one planet. Presets, your inputs and Aion Forge's export are all specs, so Planet Forge has one way in.
- **Aion Forge's part** is small and touches no simulation: a pure function that builds the spec, picking a point on the globe, and the button. No rules-version bump.
- **No server.** Planet Forge is a static site; the spec travels after `#`, which browsers never send to a server. A backend would come only with a reason (a saved library of forged planets, or specs too large for a URL).
- **Address.** Aion Forge reads Planet Forge's address from one setting (`VITE_PLANET_FORGE_URL`), with `http://127.0.0.1:5174` as the development default.

### Why the same repository

While the spec is settling, both sides change together: one commit can change the spec, its schema, the exporter and the reader, with tests on both sides. If Planet Forge later needs its own release schedule or licence, `git subtree split` moves the folder out with its history.

### Why code is copied, not shared

Planet Forge will need some of what Aion Forge has (simplex noise, colour helpers, scattering formulas). It gets its own copies. A shared package would tie the two apps' releases together, and the owner asked that Planet Forge not affect Aion Forge in any way. The cost is keeping two copies; none of them has to stay identical, because the spec, not the code, is what must agree.

## Ground rules

The root `CLAUDE.md` applies to Planet Forge as it does to Aion Forge. In particular:

- **Determinism.** The same spec always forges the same planet. Every random draw comes from the spec's `seed`, through Planet Forge's own seeded generator. Rendering may differ by a pixel between graphics cards, as Aion Forge's does; heights, materials and placements may not.
- **Planet Forge describes; it does not simulate.** It does not evolve a planet. Its presets and form are authored descriptions, and its documentation says so. What it works out (rocks, valleys, sky colour) follows from the spec through stated rules, not from special cases per planet type: a lava world glows because its ground is hot, not because it is a "lava world".
- **Plan first.** Each phase below is planned in detail, then reviewed, before code; committed separately, after review.
- **Each phase is usable when it ends.**
- **Measure before optimising** (constitution §11). Budgets below are targets to measure against, not reasons to add caches up front.

### Stack

As Aion Forge: React, TypeScript, Vite, Three.js (WebGL 2), Vitest, ESLint. Zod checks incoming specs, as Aion Forge's backend does.

## Phases

Sizes: S, M, L, XL, as in the Worlds-Up-Close plan. They are relative sizes, not time estimates.

Order: Planet Forge forges presets first (PF0–PF5); the button in Aion Forge comes last (PF6).

### PF0 Scaffold and spec
**M** · **done**

- **Objective:** An app that reads, checks and writes Planet Specs.
- **Deliverables:**
  - `planet-forge/` skeleton: Vite, React, TypeScript, Three.js, Vitest, ESLint; dev server on port 5174; README.
  - `src/spec/`: the spec's TypeScript type, its Zod check, and reading and writing it in the URL fragment (`deflate-raw`, base64url).
  - `contracts/planet-spec/planet-spec.v1.schema.json` and the first examples.
  - An empty view that shows a loaded spec's figures, or the check's message for a bad one.
- **Verification:** a spec survives a round trip through the URL unchanged; malformed specs and unknown versions are rejected with a message naming the field; every example passes the schema.

### PF1 Presets and inputs
**M** · **done**

- **Objective:** Planet Forge works on its own.
- **Deliverables:**
  - Five presets: Earth-like, lava world, ice world, ocean world, desert world.
  - A form for the main inputs: star temperature and distance, planet size and mass, day length and tilt, air pressure and gases, water amount, mean temperature, relief, ground cover.
  - **The world sketcher:** turns those inputs into surface cells. Continents from seeded noise on the sphere, filled with water to the requested amount; temperatures falling with latitude, or from the substellar point on a locked world; moisture from distance to water.
- **Implementation:** The sketcher is authored, not simulated, and its documentation says so: it describes a plausible planet, it does not evolve one. Aion Forge's specs bypass it.
- **Verification:** the same inputs always give the same cells; more water never gives less ocean; each preset passes the schema.
- **As built** (owner decisions, 3 Oct 2026):
  - **Inputs** (`src/forge/inputs.ts`): star temperature and luminosity; distance; radius, mass, day length, locked, tilt; pressure, relative amounts of N₂, O₂, CO₂, CH₄ and H₂O, cloud cover; ocean share, mean temperature, relief at 1 g; ground cover and its colour; name and seed. Worked out from them: the star's radius (Stefan–Boltzmann), its mass (L ∝ M⁴, a main-sequence estimate), the year (Kepler), gravity (M/R²) and water's boiling point (Clausius–Clapeyron, never below the triple point).
  - **Mean temperature is an input**, not computed: Planet Forge describes, it does not simulate. The form shows the star's equilibrium temperature (30% of its light reflected) as a guide.
  - **The sketcher** (`src/forge/sketch.ts`, rules and constants in its header): a level-3 icosphere of 642 cells, the resolution of Aion Forge's grid; heights from seeded value-noise fBm, spanning the relief divided by gravity, stored to the metre; sea level set to put the ocean share of cells under water; temperature as the mean times one plus a zero-average pattern (equator to pole when spinning, substellar point to far side when locked), its strength a share of the mean (0.2 spinning, 0.8 locked) halved by 2 bar of air, 6.5 K colder per km above the sea where there is air, never below 30 K; water, ice or dry basin under the sea by temperature, ice on land below freezing on a planet with water; moisture halving with each cell from open water.
  - **The same in every browser:** a copy of Aion Forge's `detmath` (`src/forge/detmath.ts`) and the same lint rule over `src/forge/`; the grid and noise use exact arithmetic only.
  - **Presets as committed data:** `npm run presets` writes each preset's spec to `contracts/planet-spec/examples/<id>.json`; an unchanged preset is forged from its file, and a test fails if a file is not what the sketcher makes now.
  - **The page:** preset buttons, the form with its worked-out figures, a seed with a Random button (a random seed is an input; the planet from it is deterministic), the inputs' problems named under a disabled Forge button, and a flat surface map of the cells (a check, not the planet's look; the globe comes in PF5).

### PF2 Terrain
**L** · was D1

- **Objective:** The height and ground type at any point of the planet, at any scale down to about a metre.
- **Deliverables:** `src/terrain/`: one CPU height function and one ground-type function.
  - **Large scale:** the spec's cells, blended smoothly between their centres.
  - **Fine scale:** the planet's own detail noise, octaves added as the camera nears, with relief scaled by gravity (lower gravity, taller mountains), as in Aion Forge's geography.
  - **Ground type** by temperature, moisture, height and slope: soil, rock, sand, snow, ice, molten rock above about 900 K, and the ground-cover tint where it lives.
  - **The landing-site rule:** within a short radius of the site, the terrain is blended towards what the spec's `landing.observed` says was there (land, water or ice; height; colour). One general rule for every planet, not a per-type case.
- **Verification:** the same spec gives the same heights; the landing site always matches its observation; the coast stays within half a cell of where the cells put it; land and water away from the site are as the cells say at every cell centre.

### PF3 Terrain renderer
**XL** · was D3

- **Objective:** The ground around the observer, out to the horizon.
- **Deliverables:**
  - Terrain chunks in a quadtree on the planet's cube-sphere, finer near the camera, built in a worker.
  - True curvature, so the horizon distance follows √(2·R·h): small planets have nearer horizons.
  - A floating origin, so positions stay precise far from the planet's centre.
  - Materials blended by ground type and slope; water at sea level that reflects the sky; molten ground that glows.
- **Implementation:** skirts hide seams between levels of detail.
- **Verification:** no cracks between levels; a frame within 16 ms at 1080p on the reference machine (measured, with automatic detail reduction if exceeded).

### PF4 Sky and light
**L** · was D4

- **Objective:** A sky that follows from the star and the air.
- **Deliverables:**
  - Rayleigh and Mie scattering from the star's colour and the air's pressure and gases: thin air gives a dark sky, thick air a hazy one.
  - The star's disc at its true angular size, 2·atan(R★ / a).
  - Time of day from the spec's `subsolar` point: a spinning world's day, compressed as Aion Forge compresses it; a locked world's star fixed in the sky at a height set by the site's distance from the substellar point.
  - Clouds by the spec's cover.
- **Verification:** the Earth-like preset gives a blue sky; a red dwarf a warmer one; a closer orbit a larger disc; an airless world a black sky with a sharp star.

### PF5 Arrival and the observer
**M** · was D2 (landing half), D10, and a short form of D9

- **Objective:** Arrive at the site and look around.
- **Deliverables:**
  - Planet Forge opens on its own globe of the planet, drawn from the cells, then descends to the site with a short fade.
  - Without a `landing` in the spec (presets), a site is picked on Planet Forge's globe, or a default one is used.
  - The observer camera: drag to look, WASD to move, height in metres; it stays above the ground and floats on water.
  - A readout: position, height, temperature, air pressure, local time.
- **Implementation:** no jumping, no collisions beyond staying above ground or water, no inventory: an instrument, not a game character.
- **Verification:** landing at a chosen site puts the camera over the observed ground type; frame-time log across the presets.

### PF6 The Aion Forge connection
**M** · the only phase that changes Aion Forge · presentation only, no rules bump

- **Objective:** *Go to the Surface* in Aion Forge forges the planet you were looking at, landing where you chose.
- **Deliverables (in `frontend/`):**
  - `planetSpecOf(…)`: a pure function from a planet, its star and its world history to a Planet Spec. The grid's cells are turned into the spec's body frame: spin axis up; on a locked world, longitude 0 at the substellar point.
  - Picking a site on the planet-view globe: a click gives the site's latitude and longitude in the body frame. The point facing the camera is the default.
  - The observation at the site: what the globe drew there (land, water or ice; colour; vegetated), read from the baked globe at that one point; the height from the surface map. How exactly it is read (the albedo atlas's texel, or a one-texel re-run of the bake that also writes the kind) is settled in this phase's plan.
  - The *Go to the Surface* button on the planet overview panel, for solid worlds only. It opens Planet Forge in a new tab at `VITE_PLANET_FORGE_URL#spec=…`.
  - A development-only test: what `planetSpecOf` exports passes the shared schema.
- **Verification:** the exported spec passes the schema and survives the URL round trip; Planet Forge, opened from the button, lands on the clicked site with the ground the globe showed there, in daylight if the site was on the day side.

## From Phase D

| Phase D step | Here |
|---|---|
| D1 Terrain sampling | PF2. No longer the same fBm as Aion Forge's globe: continents match, fine detail is Planet Forge's own, the landing site is pinned. The CPU–GPU parity test becomes a determinism test of the CPU height function. |
| D2 Choosing a landing site | Picking in Aion Forge: PF6. Landing: PF5. Suggested sites (most habitable, a coast, a civilization, a locked world's terminator) are later. |
| D3 Terrain renderer | PF3 |
| D4 Sky, light and the view overhead | PF4, without the night sky (later) |
| D5 Vegetation from evolved producers | Later |
| D6 Animals | Later, still a stretch goal |
| D7 Traces of civilization | Later |
| D8 Giants, lava and ice | Lava and ice: PF2–PF3, from temperature. Giants: later; until then, no button for giants. |
| D9 Seamless descent | A short form in PF5 (Planet Forge's own globe, then a fade). Seamless across the two apps is not possible: opening Planet Forge is a page change. |
| D10 Observer controls and performance | PF5 |

## Later

Each would add optional fields to the spec, so older specs keep working.

- **Plants and animals** (D5, D6): drawn from the evolved body plans Aion Forge already makes (C2.8), sent in the spec.
- **Traces of civilization** (D7).
- **The night sky** (D4): the galaxy as seen from the planet's star, which needs star positions in the spec, or a seed and Planet Forge's own sky.
- **Giants** (D8): a descent through cloud decks to "no solid surface".
- **Suggested landing sites** (D2).
- **Returning to Aion Forge in the same tab**, which needs Aion Forge to restore its galaxy, star and planet from the URL.
- **A backend**, if a saved library of forged planets is wanted.
- **Matching the fine detail everywhere**, if continents-plus-landing-site proves not enough.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| The ground does not look like the planet seen from orbit | Landing breaks the illusion | The landing site is pinned to the observation; continents and climate come from the same cells; colours follow the same rules as Aion Forge's globe, copied with their constants |
| The sketcher becomes a second simulation | Scope growth, duplicated physics | It only places continents, water, temperature and moisture; no history, no feedback. Anything more belongs in Aion Forge |
| The spec changes often while settling | Exporter and reader drift apart | One repository; the shared schema and examples tested from both sides; the spec version raised on breaking changes |
| Terrain renderer performance | Low frame rates on older GPUs | Budgets measured from PF3 on; detail reduces automatically; chunks built in a worker |
| Large-scale terrain looks game-like | Breaks the realistic tone | Reference screenshots reviewed at each phase, as in Worlds Up Close |
| URL too long | The hand-off fails | About 13 KB measured on random cells, an upper bound; if new fields push it past what browsers accept, that is the reason to add a backend |
