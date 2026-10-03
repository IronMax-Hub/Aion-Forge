# The plan: Planet Forge

*Forge a planet from its description, then stand on it*

Planning document · 3 Oct 2026 · PF0–PF3 built; PF3's frame time open; PF4 built; PF4's frame time and look open

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
**L** · was D1 · **done**

- **Objective:** The height and ground type at any point of the planet, at any scale down to about a metre.
- **Deliverables:** `src/terrain/`: one CPU height function and one ground-type function.
  - **Large scale:** the spec's cells, blended smoothly between their centres.
  - **Fine scale:** the planet's own detail noise, octaves added as the camera nears, with relief scaled by gravity (lower gravity, taller mountains), as in Aion Forge's geography.
  - **Ground type** by temperature, moisture, height and slope: soil, rock, sand, snow, ice, molten rock above about 900 K, and the ground-cover tint where it lives.
  - **The landing-site rule:** within a short radius of the site, the terrain is blended towards what the spec's `landing.observed` says was there (land, water or ice; height; colour). One general rule for every planet, not a per-type case.
- **Verification:** the same spec gives the same heights; the landing site always matches its observation; the coast stays within half a cell of where the cells put it; land and water away from the site are as the cells say at every cell centre.
- **As built** (owner decisions, 3 Oct 2026; rules and constants in each file's header):
  - **Large scale** (`cellField.ts`): Aion Forge's Franke–Little blend and radius (0.2 rad for 642 cells, scaled by √(642/N)), with chord distances; cells filed in 16 × 16 buckets per cube face.
  - **Fine scale** (`detail.ts`, `gradientNoise.ts`): up to 24 layers of gradient noise from the cells' spacing down to 1 m; regions 0.4–1.6× as rugged; the last layer fades in, so levels of detail never jump. Strength (retuned in PF3): 2 km at a 1,000 km wavelength at 1 g, divided by gravity, falling as wavelength^0.5 down to 1 km and wavelength^0.9 below.
  - **Anchoring** (`terrain.ts`): the detail is 0 at every cell centre, so every centre keeps the spec's height and kind, at every level of detail (tested on every preset). Between centres coasts wander with the detail, as on Aion Forge's globe; they always cross between two centres of different kinds, but the detail can also raise islands or sink lakes between centres of one kind, so "within half a cell" is not guaranteed.
  - **Kind:** dry seabed, sea ice or open water below sea level, land ice or land above it, from the cells' ice and dry flags with ragged edges (moved by under ½, so no centre changes kind). Temperature follows local height by the lapse rate where there is air.
  - **Landing pin** (`landing.ts`): full within 1 km, gone by 10 km; one height offset per level of detail, so the site stands at the observed height (at least 5 m on its kind's side of sea level) at every level; the ice flag pulled to what was seen. Tested on three presets with observations that contradict the cells.
  - **Materials** (`materials.ts`): molten, snow, rock, sand, ground cover and soil shares adding up to 1; slope from the caller. Airless worlds' bare ground is rock (no wind or water to make sand or soil).
  - **Speed:** about 4.5 µs per height at 1 m detail in Node (5.1 µs for a full sample), after replacing the noise's branching gradient with lookup tables (same values, half the time).
  - **Check:** the flat map's Terrain view samples the terrain once per degree, coloured by materials and shaded by slope; about 0.2 s to draw.

### PF3 Terrain renderer
**XL** · was D3 · **built**

- **Objective:** The ground around the observer, out to the horizon.
- **Deliverables:**
  - Terrain chunks in a quadtree on the planet's cube-sphere, finer near the camera, built in a worker.
  - True curvature, so the horizon distance follows √(2·R·h): small planets have nearer horizons.
  - A floating origin, so positions stay precise far from the planet's centre.
  - Materials blended by ground type and slope; water at sea level that reflects the sky; molten ground that glows.
- **Implementation:** skirts hide seams between levels of detail.
- **Verification:** no cracks between levels; a frame within 16 ms at 1080p on the reference machine (measured, with automatic detail reduction if exceeded).
- **As built** (owner decisions, 3 Oct 2026; details in each file's header, `src/ground/`):
  - **Patches** (`cubeSphere.ts`, `quadtree.ts`): six equal-angle cube faces, each a quadtree; a patch splits when the camera is closer than 2× its edge, down to vertices 1 m apart; parents stay drawn until all four children are built; patches beyond the horizon are skipped, those outside the view culled by Three.js.
  - **Building** (`patchBuilder.ts`, `patch.worker.ts`, `workerPool.ts`): 32 × 32 squares per patch (the plan's 64 × 64 cut to a quarter of the triangles for this machine's GPU, a GeForce 210-class NVA8); heights at twice the vertex spacing; normals from an outer ring; outward-facing skirts deep enough for a coarser neighbour's sag; colours from PF2's materials in Aion Forge's globe palette; water as a second mesh with depth per vertex; up to 4 workers, nearest first; 600 patches cached.
  - **Drawing** (`GroundRenderer.ts`, `shaders/water.*.glsl`): camera-relative placement, a logarithmic depth buffer, Lambert ground with molten glow, water with depth colour, Fresnel against a placeholder sky colour, the star's glint and ripples; a black sky until PF4.
  - **Frame time:** the split factor falls to 0.75 when frames run over 20 ms and recovers under 14 ms (the figure was unreliable on slow machines until fixed after PF4; see PF4b). Not yet measured reliably: in the app's browser pane an empty frame already takes 40–50 ms on this machine, so the 16 ms target is checked by the owner in a normal browser tab.
  - **The temporary viewer** (`src/ui/GroundView.tsx`): a site picked on the flat map, a height from 2 m to 2,000 km, drag to look, and a sun-height control (the star otherwise sits over the spec's subsolar point or longitude 0, leaving most sites in night until PF4 brings the time of day). PF5 replaces it.
  - **Found on screen:** skirts drawn double-sided showed as dark dotted lines along patch edges (back faces take flipped normals); the ground is drawn front faces only. The ground looked very flat: PF2's starting detail gave median slopes of 0.1° over 1 km. A single rougher exponent (0.5) was measured and rejected: 14% of the ground became steeper than 35° over a metre, rock that would vanish where the ground is built coarser. Applied instead (owner decision): a split spectrum, rough above 1 km and smoother below (`detail.ts`), about 0.9° median over 1 km and 4° over 1 m. Mountain ranges (ridges on high ground) come after PF4, once haze shows depth.

### PF4 Sky and light
**L** · was D4 · **built**

- **Objective:** A sky that follows from the star and the air.
- **Deliverables:**
  - Rayleigh and Mie scattering from the star's colour and the air's pressure and gases: thin air gives a dark sky, thick air a hazy one.
  - The star's disc at its true angular size, 2·atan(R★ / a).
  - Time of day from the spec's `subsolar` point: a spinning world's day, compressed as Aion Forge compresses it; a locked world's star fixed in the sky at a height set by the site's distance from the substellar point.
  - Clouds by the spec's cover.
- **Verification:** the Earth-like preset gives a blue sky; a red dwarf a warmer one; a closer orbit a larger disc; an airless world a black sky with a sharp star.
- **Split** (owner decision, 3 Oct 2026): PF4a the air, the sky, the star's disc and the light on the ground and water; PF4b the time of day, clouds and the viewer's time control.
- **PF4a as built** (owner decisions, 3 Oct 2026; rules and constants in each file's header, `src/sky/`):
  - **The air** (`air.ts`): scale height R·T / (M·g) from the cells' mean temperature, the gases' mean molar mass and gravity. Rayleigh scattering is Aion Forge's A6 Earth depth at 1 bar, scaled by the molecules overhead, P / (M·g), and by the gases' refractivity squared against air's (CO₂ about 2.3× N₂ per molecule, H₂ about 0.2×): the column of air, not pressure alone (owner decision), so on worlds far from 1 g the ground's sky is not as dense as A6's rim. Haze (Mie): Earth's clear-sky 0.025 (Bruneton and Neyret's reference) per unit mass of air overhead, in a layer 0.15 as thick as the air's, Henyey–Greenstein 0.76. No absorption.
  - **Scattering** (`scattering.ts`): single scattering along each view ray in 32 steps; the starlight's path to each step from the Chapman function's asymptotic form, √(π·x/2)·erfcx(√(x/2)·cos χ), with erfcx in a fitted one-parameter form (within 0.35%): within 0.4% of the stepped column for Earth's air (0.9% at X = 100). An earlier closed form from memory was 13% out near the horizon; the test against the stepped column caught it. Phase functions applied after the march; A6's 35% grey share for light scattered more than once.
  - **Tables:** the sky table (32 × 128, by angle round from the star and from overhead, rows packed at the horizon as in Hillaire's sky-view table) for the camera's height and the star's height, rebuilt when either changes enough: about 20 ms in Node, 25–40 ms in the browser. The light table (the sky's light on level ground by the star's height) once per planet.
  - **Drawing** (`shaders/atmosphere.glsl`, shared): the sky behind everything from the table; the star's disc at 2·atan(R★ / a), at least 3 pixels across with the same total light, dimmed by the air in front of it, hidden by the sea-level sphere; per vertex the starlight that gets through to the ground, the sky's light by the local star height, and the haze between the camera and the vertex (its share of the sky's light along that direction, by how much the stretch dims against the whole ray); water reflects the sky table.
  - **Brightness** (owner decision): the star's light is 3 × colour × flux (L★ / a²); the exposure is 3 × flux^−0.75, so lit ground looks as bright as flux^0.25 (as Aion Forge's globe lights it) and the sky and star keep their proportions. Light where neither star nor sky reaches: 0.01, until the night sky.
  - **Checked on screen:** a blue-grey day sky with a pale horizon and hills fading into it; sunset light on backlit hills; from 300 km a blue limb; the airless lava world a black sky with a sharp 19° disc.
  - **Open, for review (PF4a):** ~~the sky is paler than photographs~~ (fixed after PF4, below); twilight is dark soon after sunset (single scattering only); the disc saturates to white in tone mapping, low or high; the sky's light on the ground is the sea-level sky's, whatever the ground's height. **Frame time:** in the software renderer used for screenshots, per-vertex haze roughly doubles each patch's cost (about 280 patches at the split factor PF3 drew 540 with, for the same frame time); to measure on the reference machine.

- **PF4b as built** (owner decisions, 3 Oct 2026; details in each file's header):
  - **Time of day** (`src/sky/dayClock.ts`): the solar day from the sidereal day and the year, 1 / (1/day − 1/year), or 1/day + 1/year for a world spinning against its orbit (tilt over 90°: Venus's 117 days); the point under the star keeps its latitude (the season fixed while you watch) and moves west once a solar day; a locked world's star stands still, its height 90° less the site's distance from the substellar point. The start is the spec's subsolar point, or latitude 0, longitude 0 for presets. A solar day takes 60 s on screen, as Aion Forge turns a planet once a minute.
  - **The viewer:** a local-time slider (a 24-hour clock of the local solar day) and *Run the day* replace the sun-height slider; the readout gives the star's height and the day's length; on a locked world the slider is off and says the star stands still.
  - **The sky table while the star moves:** built a few rows a frame (4 ms), the last whole table shown meanwhile: about 20–40 ms over 5–8 frames in the browser.
  - **Clouds** (`src/sky/clouds.ts`, `shaders/clouds.frag.glsl`): a latitude–longitude map (512 × 256) of seeded gradient noise from systems half the planet's radius across down to about 200 km, cut at the level that clouds over exactly the spec's share of the area (tested to 0.1%); finer value noise (64 km down to 2 km) roughens edges and thickness on screen. One thin layer a quarter of the air's scale height up (about 2 km on the Earth-like world), drawn over the whole screen after the ground with its depth written, so mountains above it hide it. Lit by the starlight that gets through and the sky's light, darker from the far side of thick cloud; hazed to the camera. Drifting once round the pole in 900 s, as Aion Forge's, except under reduced motion. No shadows on the ground.
  - **Found on screen:** from orbit height, a sharp-edged clear "continent" in the clouds was a snowy plateau standing above the 2 km layer (3% of the Earth-like world's land is higher), not a fault: drawing clouded points red and clear points green showed the ground in front of the layer there.
  - **Frame time** (software renderer, relative only): PF3 and PF4a both drew about 2.3 frames a second at the Earth-like test site; with clouds overhead 1.3, then 1.7 after dropping pixels the noise cannot cloud and giving clouds a cheaper haze. The viewer's frame-time figure ignored intervals over 100 ms (meant for a hidden tab), so on a slow machine it showed about 30–50 ms while frames took far longer. **Fixed after PF4** (owner decision): `src/ground/frameMeter.ts` counts frames over each second, every frame however slow, and restarts when the tab is hidden; the viewer shows the mean frame time and frames a second. The same view now reads 361 ms (2.8 a second), and the split factor, which had been rising on the false figure, falls to its floor as PF3's rule intends.
  - **Open, for review:** from below, overcast reads as smooth grey (fine detail stops at 2 km); one layer at one height, so no towering or high cloud; clouds from the ground only within about 160 km (the layer's horizon), so a sky is either overcast or clear more often than broken.

- **The pale sky, fixed after PF4** (owner request, 3 Oct 2026): overhead on the Earth-like world the screen showed (69, 78, 96), a dull grey-blue; now (63, 89, 136), and (69, 103, 156) 30° up opposite the star. Two causes, both changed in `src/sky/`:
  - **The channels' Rayleigh strengths** come from the whole spectrum, not the law sampled at one wavelength per channel: sunlight scattered as λ^−4.05, against sunlight itself, through the CIE 1931 observer (Wyman, Sloan and Shirley's fit) into linear sRGB gives red 0.52 and blue 2.39 times green, for stars from 3,200 to 10,000 K alike (a test re-derives them); A6's sampling at 612 and 465 nm gave 0.64 and 1.96. A hot star's sky stays blue, not violet. **This departs from A6**, whose rim from orbit keeps the sampled strengths; the same change there is recommended separately (it would touch Aion Forge).
  - **Light scattered more than once** by Hillaire's method (2020), replacing A6's fixed 35% grey share: a table per planet (32 heights × 32 star heights, 64 directions each) of the once-scattered light arriving from every direction, times 1 / (1 − f), f the share sent on to scatter again; each step of a view ray adds it. About 15% of the light overhead on the Earth-like world, more than half in 10 bar of air, whose sky whitens. Light from the ground is not counted.
  - **Cost:** the table about 0.3 s once per planet; the sky table about 45 ms instead of 20, still built over several frames.
  - **Still open:** overhead the sky is about 16% as bright as sunlit sand, where Earth's is about 25–45% (no light from the ground in the multiple scattering); twilight is dark soon after sunset.

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
