# Planet Forge

Forge a planet from its description, then stand on it.

**Status: PF0 of [`PLAN.md`](PLAN.md).** Planet Forge reads and checks a Planet Spec from its URL and shows its figures. It does not forge terrain yet.

## What it is

Planet Forge takes a description of one planet (its star, its body, its air and its surface) and builds ground you can land on and look around: terrain to the horizon, water, ice or molten rock, and a sky coloured by the star and the air.

It is a separate app from Aion Forge, in the same repository:

- **On its own**, it forges preset planets (Earth-like, lava, ice, ocean, desert) or planets from inputs you type in.
- **From Aion Forge**, the *Go to the Surface* button on a solid planet's panel opens Planet Forge in a new tab with that planet's description, and lands where you chose on the globe.

The two apps share no code. The description they pass between them, the Planet Spec, is defined in [`../contracts/planet-spec/`](../contracts/planet-spec/README.md).

## Principles

Planet Forge follows the repository's [`CLAUDE.md`](../CLAUDE.md). Two points matter most here:

- **The same spec always forges the same planet.** All randomness comes from the spec's seed.
- **Planet Forge describes; it does not simulate.** Aion Forge evolves planets over billions of years. Planet Forge takes a planet as it is and works out what standing on it looks like.

## Running it

Planet Forge has its own packages, separate from Aion Forge's:

```
cd planet-forge
npm install
npm run dev       # http://127.0.0.1:5174
```

Open the page and press *Open the example*, or open a link of the form `http://127.0.0.1:5174/#spec=…`.

| Command | Does |
|---|---|
| `npm run dev` | the development server, on port 5174 (Aion Forge's is 5173) |
| `npm test` | the tests |
| `npm run lint` | ESLint; it also fails if anything imports Aion Forge's code |
| `npm run build` | type check and production build |
| `npm run schema` | writes `../contracts/planet-spec/planet-spec.v1.schema.json` from the checking code; run it after changing the spec, or a test fails |

## Where things are

| Path | Contents |
|---|---|
| `src/spec/schema.ts` | the Planet Spec: its schema, limits and type, the single source of truth |
| `src/spec/check.ts` | checking a spec: errors with their places, warnings for unknown fields |
| `src/spec/url.ts` | a spec in a URL fragment: packing and reading |
| `src/spec/jsonSchema.ts` | the shared JSON Schema file's text, generated from the schema |
| `src/ui/` | the page that shows a spec's figures |
