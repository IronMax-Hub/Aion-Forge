# Planet Spec

*The one thing Aion Forge and Planet Forge share: a complete description of a single planet.*

Version 1 · read and checked by Planet Forge since PF0; not yet exported by Aion Forge (PF6) · 3 Oct 2026

## Why it exists

Planet Forge forges a planet you can stand on from a description of it. That description can come from three places:

- **Aion Forge**, which exports a planet its simulation produced, when you press *Go to the Surface*;
- **a preset** (Earth-like, lava, ice, ocean, desert);
- **your own inputs**, typed into Planet Forge's form.

All three produce the same document, the Planet Spec, so Planet Forge has one way in. Planet Forge never runs Aion Forge's simulation, and Aion Forge never runs Planet Forge's terrain: the spec is the whole interface between them.

## What lives here

| File | Contents | Status |
|---|---|---|
| `README.md` | this description | written |
| `planet-spec.v1.schema.json` | the spec as a JSON Schema (draft 2020-12), generated from Planet Forge's checking code: `npm run schema` in `planet-forge/` | written |
| `examples/minimal.json` | the smallest spec Planet Forge accepts: an airless rock of 12 cells | written |
| `examples/*.json` | the presets (PF1) and one exported from Aion Forge (PF6) | to come |

These are data, not code. Neither app imports code from the other or from here; each one checks itself against the schema in its own tests:

- Planet Forge: every example and preset passes its checks, and the schema file is what its checking code generates, so the two cannot drift apart.
- Aion Forge: what `planetSpecOf(…)` exports passes the schema (a development-only check, PF6).

## Rules

- **Self-contained.** A spec holds everything needed to forge its planet. Nothing in it refers to Aion Forge's code, its grid or its seed streams.
- **Deterministic.** The same spec always forges the same planet. Any randomness Planet Forge uses comes from the spec's `seed`.
- **Versioned.** Every spec carries `specVersion`. A change that removes or reinterprets a field raises the version; adding an optional field does not. Planet Forge rejects a version it does not know, with a clear message, rather than guessing.
- **Physical units, named in the field.** `temperatureK`, `pressureBar`, `heightKm`. No unitless "scores".
- **Describes, does not prescribe.** A spec says what the planet is. How it looks from the ground (rocks, valleys, waves) is Planet Forge's to work out from that.

## Checking

Planet Forge checks every spec before reading it (`planet-forge/src/spec/`).

- **Sanity limits only.** Numbers must be finite; sizes, masses, distances, temperatures and the rotation period positive; pressure at least 0; shares within 0–1; latitudes within ±90°, longitudes within ±180°, axial tilt within 0–180°; the seed a whole number within its range. There are no "plausible ranges": an unusual but real planet is never rejected.
- **Rules across fields**, which the JSON Schema cannot express and Planet Forge checks itself:
  - each cell's direction is a unit vector, to within 0.001 (room for rounding);
  - the gas shares add up to 1, to within 0.001, unless there are no gases at all;
  - there are between 12 and 20,000 cells (the upper limit keeps a spec's URL a sensible size).
- **Unknown fields** are ignored and listed as warnings, so a spec with a newer optional field still reads. A gas name outside the list is an error, not an unknown field.
- **An unknown `specVersion`** is rejected, naming the versions Planet Forge reads.
- **Errors name their place**, as in code: `surface.cells[12][3]: …`.

## Frame

Directions on the planet are unit vectors in the planet's **body frame**, which turns with the planet:

- `+y` is the north pole of the spin axis.
- Longitude 0 is along `+x`, and longitude rises eastwards, the way the planet turns: anticlockwise seen from above the north pole, so towards `−z`. A direction is `(x, y, z) = (cos lat · cos lon, sin lat, −cos lat · sin lon)`, the same convention as Aion Forge's orbits.
- On a tidally locked planet, longitude 0, latitude 0 is the substellar point.

Latitude and longitude are in degrees.

## Fields, version 1

### Header

| Field | Type | Meaning |
|---|---|---|
| `specVersion` | `1` | |
| `source` | `"aion-forge"` · `"preset"` · `"custom"` | where the spec came from |
| `name` | string | shown in Planet Forge, e.g. "0861 d" or "Ocean world" |
| `seed` | integer, 0 – 2³²−1 | Planet Forge's own randomness |
| `origin` | object, optional | for specs from Aion Forge: `{ galaxySeed, starId, planetIndex, rulesVersion }`, shown as a label only; Planet Forge never reads the simulation from it |

### `star`

| Field | Unit | Meaning |
|---|---|---|
| `temperatureK` | K | surface temperature: the light's colour |
| `luminositySolar` | L☉ | brightness |
| `radiusSolar` | R☉ | size of its disc in the sky (Aion Forge works it out from luminosity and temperature) |

### `orbit`

| Field | Unit | Meaning |
|---|---|---|
| `distanceAU` | AU | with the star's radius, the disc's angular size; with its luminosity, the light received |
| `periodYears` | years | the year, for the solar day and seasons |

### `body`

| Field | Unit | Meaning |
|---|---|---|
| `radiusEarth` | R⊕ | |
| `massEarth` | M⊕ | |
| `gravityG` | g | surface gravity |
| `rotationHours` | hours | sidereal rotation; equals the year when locked |
| `tidallyLocked` | boolean | |
| `axialTiltDeg` | degrees | |

### `air`

| Field | Unit | Meaning |
|---|---|---|
| `pressureBar` | bar | surface pressure (about 0 for an airless world) |
| `gases` | mixing ratios summing to 1 | e.g. `{ "N2": 0.78, "O2": 0.21, ... }`, the gases of Aion Forge's `Gas` type |
| `cloudCover` | 0–1 | share of the sky clouded over |

### `surface`

| Field | Unit | Meaning |
|---|---|---|
| `cells` | array | the planet's surface, sampled at points spread over the sphere (below) |
| `seaLevelKm` | km | heights are relative to an arbitrary datum; this is where the sea stands on it |
| `freezingK`, `boilingK` | K | water's freezing and boiling points under this air |
| `steam` | boolean | the oceans have boiled into the air |

Each cell is `[x, y, z, heightKm, temperatureK, moisture, kind]`:

- `x, y, z`: its direction in the body frame;
- `heightKm`: relative to the datum, already scaled by gravity;
- `temperatureK`: present-day mean temperature;
- `moisture`: 0–1, falling with distance from open water;
- `kind`: `0` land, `1` open water, `2` ice.

Cells are arrays rather than objects to keep the spec small. Aion Forge sends its 642 grid cells (about 1,100 km apart on an Earth-sized world); presets may use any number and layout. The cells carry their own positions, so Planet Forge does not need anyone's grid code.

### `groundCover` (optional)

The tint of living ground, as the orbit globe draws it. Plants and animals as objects come later (Planet Forge PLAN, "Later").

| Field | Meaning |
|---|---|
| `cover` | 0–1: how fully the most habitable ground is covered |
| `colourLinear` | `[r, g, b]`, linear: the pigment as the star lights it |

Absent when the planet has no life.

### `landing` (optional)

Where to land, and what the observer saw there. Absent in presets: Planet Forge then picks a site itself.

| Field | Meaning |
|---|---|
| `latitudeDeg`, `longitudeDeg` | the site, in the body frame |
| `subsolar` | `{ latitudeDeg, longitudeDeg }`: the point under the star at arrival, which sets the time of day and the season |
| `observed` | what the orbit globe showed at the site, optional (below) |

`observed` is what Planet Forge's terrain must agree with at the site (PLAN, PF2):

| Field | Meaning |
|---|---|
| `kind` | `"land"` · `"water"` · `"ice"` |
| `heightKm` | the height there, on the same datum as the cells; approximate (Aion Forge's fine detail adds up to about ±1.2 km) |
| `vegetated` | boolean |
| `colourLinear` | `[r, g, b]`, linear: the ground's colour as the globe drew it |

## In a URL

Aion Forge opens Planet Forge at

```
<planet-forge-address>/#spec=<encoded>
```

where `<encoded>` is the spec's JSON, compressed with `deflate-raw` (the browser's `CompressionStream`) and written in base64url. The part after `#` never reaches a server.

Size: 642 cells with smooth values rounded as an export would round them measured about 14 KB encoded (a Planet Forge test keeps it under 20 KB). That fits comfortably in a URL.

Reading a link stops at the first step that fails, with a plain message: not base64url, not compressed data, not JSON, or the spec's own errors. A spec that unpacks to more than 2 MB is refused, so a hostile link cannot inflate into gigabytes.

## Limits of version 1

- No organisms beyond the ground tint, no civilization, no night sky: each would need new optional fields.
- No giants: a spec describes a planet with a solid surface. Aion Forge shows *Go to the Surface* only for solid worlds.
- Heights in the cells are coarse, one value per cell. Detail between cells is Planet Forge's own, except at the landing site, where `observed` pins it.
