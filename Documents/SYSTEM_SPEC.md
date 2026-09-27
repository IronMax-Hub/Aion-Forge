# Aion Forge System Specification

Version: 1.0

Purpose:
This document defines the major systems that constitute an Aion Forge universe.

It describes what exists, how those entities relate to one another, and the responsibilities of each layer.

This is not an implementation guide.

It is a specification of reality.

It was written before the code and remains the design intent. Where the current implementation differs, a note says so. How planets, their histories and the planet view actually work is set out in `Worlds-Up-Close.md` and `Worlds-Up-Close-Revision-1.md` (the revision takes precedence).

---

# 1. System Philosophy

Aion Forge is built upon nested systems.

Small systems interact to create larger systems.

Larger systems influence smaller systems.

Complexity emerges through interaction.

No entity exists in isolation.

Reality is hierarchical.

---

# 2. Hierarchy of Existence

The universe is composed of the following layers:

```text
Universe
│
├── Physical Laws
│
├── Timeline
│
├── Galaxies
│   │
│   ├── Stars
│   │   │
│   │   ├── Planetary Systems
│   │   │   │
│   │   │   ├── Planets
│   │   │   │   │
│   │   │   │   ├── Biospheres
│   │   │   │   │   │
│   │   │   │   │   ├── Species
│   │   │   │   │   │   │
│   │   │   │   │   │   ├── Civilizations
│   │   │   │   │   │   │   │
│   │   │   │   │   │   │   └── Historical Events
```

Each level emerges from the conditions established by the level above it.

---

# 3. Universe

## Definition

The Universe is the highest-level entity.

It represents an entire reality generated from a single seed and governed by a consistent set of laws.

Everything that exists belongs to exactly one Universe.

---

## Responsibilities

The Universe is responsible for:

* Maintaining identity.
* Defining initial conditions.
* Holding physical constants.
* Managing time progression.
* Coordinating subsystems.
* Ensuring determinism.

---

## Core Attributes

### Seed

A unique deterministic identifier.

Purpose:

Ensures reproducibility.

Example:

```text
Seed: 1849275021
```

The same seed must always generate the same universe.

---

### Age

Represents elapsed cosmic time.

Example:

```text
0 years
2 billion years
13.7 billion years
```

---

### Scale

Defines the extent of observable space.

Example:

* Small
* Medium
* Large
* Custom

Not built: a universe is one galaxy of 2,000 stars; its extent is set by the Expansion Rate.

---

### Laws

References the universe's physical configuration.

---

# 4. Physical Laws

## Definition

Physical Laws define how reality behaves.

They influence every subsequent system.

Changing laws creates fundamentally different universes.

---

## Responsibilities

Physical Laws determine:

* attraction,
* expansion,
* stability,
* energy transfer,
* emergence probabilities.

---

## Example Constants

### Gravity Strength

Influences:

* clustering,
* star formation,
* planetary orbits.

---

### Expansion Rate

Influences:

* galaxy separation,
* large-scale structure.

---

### Stellar Ignition Threshold

Influences:

* star abundance,
* lifespan distribution.

---

### Entropy Rate

Influences:

* decay,
* stability,
* system persistence.

---

### Emergence Sensitivity

Influences:

* how easily complexity develops.

---

### Intelligence Modifier

Influences:

* how readily complex biospheres give rise to intelligence and civilization.

---

# 5. Timeline

## Definition

The Timeline records the progression of reality.

---

## Responsibilities

The Timeline:

* advances time,
* records milestones,
* enables observation,
* provides narrative context.

---

## Characteristics

### Direction

Forward only.

Time travel is outside project scope.

---

### Resolution

May vary.

Examples:

* millions of years,
* thousands of years,
* years.

---

### Event Recording

Major events should be captured.

Minor events may be aggregated.

---

# 6. Galaxies

## Definition

Galaxies are large-scale stellar structures formed through cosmic processes.

They emerge from physical laws and initial conditions.

---

## Responsibilities

Galaxies organize stars.

They influence:

* stellar density,
* habitability opportunities,
* cosmic environments.

---

## Core Attributes

### Position

Spatial coordinates.

---

### Type

Examples:

* Spiral
* Elliptical
* Irregular
* Ring (not built)

---

### Mass

Represents galactic scale.

---

### Age

Elapsed time since formation.

---

### Stellar Population

Collection of stars.

Implementation note: each universe currently holds a single galaxy, so position and mass are not modelled; the galaxy is described by its type and scale.

---

# 7. Stars

## Definition

Stars are energy-producing celestial bodies.

They are the primary drivers of planetary environments.

---

## Responsibilities

Stars:

* illuminate systems,
* generate heavy elements,
* influence habitability,
* eventually die.

---

## Core Attributes

### Mass

Determines lifecycle.

---

### Age

Determines evolutionary stage.

---

### Luminosity

Energy output.

---

### Temperature

Surface characteristics.

---

### Lifespan

Expected duration.

---

### State

Examples:

* Protostar
* Main Sequence
* Red Giant
* White Dwarf
* Neutron Star
* Black Hole

---

# 8. Planetary Systems

## Definition

Planetary Systems organize planets around stars.

---

## Responsibilities

They determine:

* orbital stability,
* planetary interactions,
* environmental variation.

---

## Core Attributes

### Host Star

Owning star.

---

### Planet Count

Number of planets.

---

### Stability

Long-term orbital persistence.

---

### Architecture

Examples:

* Compact
* Distributed
* Resonant
* Chaotic

---

# 9. Planets

## Definition

Planets are localized environments capable of developing unique histories.

---

## Responsibilities

Planets provide conditions under which life may emerge.

---

## Core Attributes

### Type

Examples:

* Rocky
* Ocean
* Ice
* Desert
* Gas Giant
* Ice Giant
* Lava
* Rogue

---

### Size

Physical scale.

---

### Atmospheric Conditions

Environmental characteristics.

---

### Temperature Range

Habitability influence.

---

### Resource Availability

Potential developmental support.

---

### Habitability Score

General measure of life's viability.

---

### Physical Properties

Mass (from small rocky worlds to 13 Jupiter masses), radius from a measured mass–radius relation, surface gravity, escape velocity, orbital period, axial tilt, rotation period, and whether the planet is tidally locked to its star. Water is set by where the planet formed relative to the snow line.

---

### Geography (solid planets)

Continents, ocean basins and elevation on a grid of cells covering the sphere.

---

### World History (solid planets)

Climate over billions of years: the star brightens, volcanoes outgas CO₂ while tectonics lasts, land and seafloor weathering draw it down, and oceans may freeze over or boil away in a runaway greenhouse. Today's surface (ocean, ice and land shares), surface pressure, temperature and atmosphere class are what that history leaves. Life reads from it.

---

### Formation and Fate

Planets form beyond the distance at which the young star's light would boil away dust. A star that swells into a red giant engulfs any planet inside its radius; those planets no longer exist.

---

# 10. Biospheres

## Definition

Biospheres represent planetary ecosystems.

They emerge only under favorable conditions.

---

## Responsibilities

Biospheres sustain and shape life.

---

## Core Attributes

### Complexity

Degree of biological sophistication.

---

### Diversity

Variety of life.

---

### Stability

Resistance to collapse.

---

### Adaptability

Capacity for evolutionary change.

---

# 11. Species

## Definition

Species are evolving biological entities.

---

## Responsibilities

Species:

* adapt,
* compete,
* cooperate,
* survive,
* perish.

---

## Core Attributes

### Population

Number of individuals.

---

### Intelligence

Problem-solving capability.

---

### Curiosity

Drive toward exploration.

---

### Cooperation

Collective tendencies.

---

### Aggression

Conflict tendencies.

---

### Adaptability

Evolutionary flexibility.

---

### Resilience

Resistance to catastrophe.

---

# 12. Civilizations

## Definition

Civilizations emerge from sufficiently advanced species.

They represent organized collective behavior.

---

## Responsibilities

Civilizations create history.

They shape planetary outcomes.

---

## Core Attributes

### Technological Development

Capability advancement.

---

### Social Cohesion

Internal unity.

---

### Resource Efficiency

Sustainability.

---

### Expansion Tendencies

Exploration behavior.

---

### Risk Profile

Self-destructive potential.

---

### Cultural Identity

Collective values.

---

### Survival Probability

Likelihood of persistence.

---

# 13. Historical Events

## Definition

Historical Events provide narrative structure.

They transform simulation into story.

---

## Responsibilities

Events document meaningful change.

---

## Event Categories

Some examples below are design intent and are not yet generated: galaxy mergers, impact events and climate shifts.

### Cosmic

Examples:

* Galaxy mergers
* Black hole formation

---

### Stellar

Examples:

* Supernovae
* Stellar collapse

---

### Planetary

Examples:

* Impact events
* Climate shifts

---

### Biological

Examples:

* Emergence of life
* Mass extinctions

---

### Civilizational

Examples:

* First language
* Industrialization
* Spaceflight
* Collapse

---

# 14. Observer

## Definition

The Observer is the user.

The Observer exists outside reality.

---

## Responsibilities

The Observer may:

* define laws,
* select seeds,
* initiate universes,
* inspect timelines,
* explore outcomes.

---

## Restrictions

The Observer should not directly manipulate outcomes.

The Observer influences conditions.

Reality determines consequences.

---

# 15. System Relationships

The systems of Aion Forge should follow this principle:

```text
Laws influence environments.

Environments influence opportunities.

Opportunities influence emergence.

Emergence influences history.

History influences futures.
```

No level should bypass those relationships casually.

---

# 16. Emergence Flow

The intended flow of complexity is:

```text
Seed
↓
Physical Laws
↓
Universe
↓
Galaxies
↓
Stars
↓
Planets
↓
Biospheres
↓
Species
↓
Civilizations
↓
Historical Events
↓
Stories
```

Presentation sits outside this flow. The views that draw the universe, down to a planet seen from orbit, read it and never write to it.

The ultimate output of Aion Forge is not data.

It is stories generated by reality itself.

---

# Closing Statement

Aion Forge is built upon the belief that extraordinary outcomes need not be explicitly authored.

Galaxies need not be designed.

Civilizations need not be scripted.

Stories need not be written.

When simple systems interact across immense spans of time, they may give rise to beauty, tragedy, wonder, and meaning.

This specification defines the stage.

Emergence writes the play.
