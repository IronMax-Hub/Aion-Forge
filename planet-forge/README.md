# Planet Forge

Forge a planet from its description, then stand on it.

**Status: planned. Nothing is built yet.** The plan is in [`PLAN.md`](PLAN.md); the first phase, PF0, sets up this app.

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
