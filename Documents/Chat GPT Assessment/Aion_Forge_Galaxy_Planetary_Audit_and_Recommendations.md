# Aion Forge --- Galaxy & Planetary Systems Technical Audit

## Findings, scientific review, recommendations, and validation plan

**Prepared for:** Aion Forge development team\
**Intended reader:** Co-developer / Claude\
**Repository:** `IronMax-Hub/Aion-Forge`\
**Audited branch:** `black-hole-render`\
**Validation branch:** `galaxy-planet-validation`\
**Audit baseline commit:** `583ad8b2c75460f7bd8b07997136b836d1df4697`\
**Audit scope:** Galaxy generation, stellar populations,
planetary-system generation and dynamics, moon stability, relevant
rendering consistency, and existing test coverage.\
**Status:** Static code review and scientific/numerical reasoning.
Runtime tests, production builds, shader compilation, APK validation,
and database validation have **not** been executed.

------------------------------------------------------------------------

## 1. Executive summary

This document consolidates the detailed galaxy and planetary-system
audit performed in this chat. It is intended to be a handoff document:
use it as an engineering review input, not as an instruction to blindly
rewrite the simulation.

Aion Forge already has a meaningful procedural foundation. The reviewed
code includes deterministic random generation, binary-star and
barycentric concepts, stellar and planetary generation, orbital
calculations, moon generation, and a rendering layer separated from much
of the simulation data. Several local physical relationships and
boundary conditions already have tests.

The most important concerns are not that the simulation lacks
complexity. They are that a few foundational assumptions can bias entire
generated populations or cause the visual representation to disagree
with the simulation's own physical calculations.

### Highest-priority findings

1.  **The stellar mass sampler is substantially too top-heavy** compared
    with a canonical Kroupa-like initial mass function (IMF). It
    produces too many massive stars and too few low-mass stars. This
    affects the entire downstream population: luminosity, stellar
    lifetimes, remnants, enrichment, and the distribution of possible
    planetary hosts.
2.  **The stellar-age assignment is not a cosmic star-formation
    history.** Sampling each star's age uniformly from zero to its own
    lifetime creates an artificial relationship between age and
    evolutionary stage. For stars whose lifetimes are shorter than the
    modeled universe age, the implementation effectively imposes an
    approximately 85% main-sequence / 10% giant / 5% remnant split
    through its phase thresholds, rather than deriving the present-day
    population from formation times and stellar evolution.
3.  **The physical orbital radius and displayed orbital radius can
    disagree.** The reviewed physics path adjusts effective orbital
    distance using `gravityStrength`, while the rendering path uses the
    raw orbital radius. This can make the visible orbit inconsistent
    with the orbit used in physical calculations.
4.  **Circumbinary orbital periods appear to use the primary star's mass
    rather than the total binary mass.** For a first-order Keplerian
    P-type orbit, the central mass should be the combined mass of the
    binary.
5.  **Some generated large rocky-planet moons are not checked against
    the planet's Hill stability region.** This can create moons at
    distances where stellar perturbations should make long-term prograde
    stability implausible.

### Overall recommendation

Treat the first five items above as a focused **population-and-orbit
correctness milestone**. Do not begin by adding more visual effects or
more procedural variety. First make sure that:

-   generated stellar populations have defensible mass and age
    distributions;
-   the same physical orbit is represented consistently by simulation
    and renderer;
-   circumbinary periods use the appropriate central mass;
-   generated moons respect a conservative stability envelope;
-   tests measure population-level behavior and cross-module invariants,
    not just isolated formulas.

The medium-priority findings are important, but can be staged after the
foundational corrections. These include galaxy morphology, retaining
ejected planets as rogue-body records, multi-planet stability, resonance
semantics, white-dwarf orbital evolution, disk mass budgets, and
metallicity effects.

------------------------------------------------------------------------

## 2. Scope, method, and confidence

### 2.1 Scope reviewed

The review concentrated on:

-   Stellar mass sampling and stellar population generation.
-   Stellar ages, lifetimes, and evolutionary-stage assignment.
-   Galaxy morphology and how visible galaxy structure relates to
    generated stars.
-   The semantics and actual use of `gravityStrength`.
-   Planetary orbital radii and orbital periods.
-   Circumbinary planetary systems.
-   Planetary moon generation and Hill stability.
-   Ejected planets and unstable planetary architectures.
-   Resonance labeling and multi-planet stability assumptions.
-   White-dwarf host systems and post-main-sequence mass loss.
-   Planetary disk mass budgets and metallicity scaling.
-   Existing test coverage and missing population-level invariants.

### 2.2 Review method

The findings were derived from static inspection of the source paths
identified below, mathematical checks of the relevant formulas, and
comparisons against standard first-order astrophysical expectations. The
review did **not** run the application or execute the repository's test
suite.

The principal source paths and locations noted during review include:

-   `frontend/src/simulation/star.ts`
-   `frontend/src/simulation/planetBasics.ts`
-   `frontend/src/simulation/planetPhysics.ts`
-   `frontend/src/simulation/moons.ts`
-   `frontend/src/rendering/systemLayout.ts`
-   `frontend/src/rendering/UniverseRenderer.ts`

Line ranges below refer to the reviewed branch snapshot and should be
re-confirmed against the current branch before editing. If code has
changed since the audit baseline, treat the line numbers as navigation
hints rather than immutable references.

### 2.3 Confidence labels

-   **High:** The implementation behavior is directly identifiable in
    the reviewed code and the mathematical consequence is clear.
-   **Medium:** The issue is visible in the reviewed implementation, but
    its final impact depends on model assumptions, intended abstraction
    level, or downstream behavior.
-   **Recommendation:** A proposed improvement rather than proof that
    the current code is defective.

### 2.4 Important limitations

This is a **static audit**, not an astrophysical validation certificate.
Aion Forge is a procedural simulation and may intentionally simplify
real astrophysics for performance, readability, or gameplay.
Simplifications are acceptable when they are explicit, internally
consistent, and communicated honestly.

No claims are made here that:

-   the app currently builds successfully;
-   unit tests pass;
-   shaders compile;
-   the Android APK works;
-   runtime numerical behavior has been observed;
-   database behavior has been validated.

Those activities were not performed in this chat.

------------------------------------------------------------------------

## 3. Branch and validation status

At the user's request, a new branch was created from
`black-hole-render`:

-   **New branch:** `galaxy-planet-validation`
-   **Base branch:** `black-hole-render`
-   **Baseline commit:** `583ad8b2c75460f7bd8b07997136b836d1df4697`

The GitHub comparison showed the branches were identical at creation
time:

-   `status: identical`
-   `ahead_by: 0`
-   `behind_by: 0`

The intent of the branch is to provide a safe place for the next
validation and correction phase.

### 3.1 What was and was not executed

  ------------------------------------------------------------------------------
  Activity                     Status                  Notes
  ---------------------------- ----------------------- -------------------------
  Create                       Complete                Created from
  `galaxy-planet-validation`                           `black-hole-render`

  Verify branch baseline       Complete                Identical at the time of
                                                       comparison

  Static source review         Complete                Findings documented here

  `npm test` / Vitest          Not run                 Repository checkout was
                                                       unavailable in the
                                                       execution environment

  TypeScript/Vite production   Not run                 No local source
  build                                                checkout/dependencies

  ESLint                       Not run                 No local source
                                                       checkout/dependencies

  Shader                       Not run                 No dedicated shader
  compilation/validation                               validation script was
                                                       identified in
                                                       `frontend/package.json`

  APK build or device check    Not run                 Explicitly excluded by
                                                       user

  Database inspection or       Not run                 Explicitly excluded by
  operations                                           user

  Source code modifications    None                    No implementation changes
                                                       were made

  Git commit / push            None                    No commit or push was
                                                       performed
  ------------------------------------------------------------------------------

### 3.2 Available frontend scripts observed

The reviewed `frontend/package.json` exposed these scripts:

``` json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "stats": "node stats/run.mjs",
    "android": "tsc -b && vite build --mode android && cap sync android && cd android && ./gradlew assembleDebug"
  }
}
```

There was no dedicated shader-validation script in that manifest. Shader
validation therefore needs to be added as a separate validation task or
performed through an appropriate GLSL/WebGL validation toolchain.

**Important:** The existence of a package script is not evidence that it
succeeds. The commands above are suggested execution steps, not reported
test results.

------------------------------------------------------------------------

## 4. Findings at a glance

There are **16 findings** in the consolidated deep audit: **5 High** and
**11 Medium**.

  --------------------------------------------------------------------------
  ID                Severity          Area              Finding
  ----------------- ----------------- ----------------- --------------------
  GAL-001           High              Stellar           Stellar mass sampler
                                      population        is too top-heavy
                                                        relative to a
                                                        Kroupa-like IMF

  GAL-002           High              Stellar           Stellar ages are
                                      population        sampled against each
                                                        star's own lifetime
                                                        rather than
                                                        formation history

  SYS-001           High              Orbit / rendering Physics and
                                                        rendering use
                                                        inconsistent
                                                        orbital-radius
                                                        representations

  SYS-002           High              Circumbinary      P-type orbital
                                      systems           period uses primary
                                                        mass rather than
                                                        total binary mass

  SYS-003           High              Moons             Large rocky-planet
                                                        moons can be placed
                                                        beyond a
                                                        conservative
                                                        Hill-stability
                                                        region

  GAL-003           Medium            Stellar           Low
                                      population        ignition-threshold
                                                        values can cause
                                                        endpoint clamping
                                                        and mass pile-ups

  GAL-004           Medium            Galaxy morphology Procedural visible
                                                        morphology and
                                                        generated stellar
                                                        distribution are not
                                                        guaranteed to share
                                                        one density model

  GAL-005           Medium            Simulation        `gravityStrength`
                                      controls          documentation/UI
                                                        semantics do not
                                                        match its reviewed
                                                        use

  SYS-004           Medium            Rogue planets     Ejected/unstable
                                                        planets are reduced
                                                        to counts rather
                                                        than retained as
                                                        body records

  SYS-005           Medium            Multi-planet      Pairwise mutual-Hill
                                      stability         spacing is not a
                                                        long-term
                                                        multi-planet
                                                        stability guarantee

  SYS-006           Medium            Resonances        "Resonant"
                                                        architecture is
                                                        based on approximate
                                                        spacing, not
                                                        demonstrated
                                                        resonance dynamics

  SYS-007           Medium            White dwarfs      White-dwarf systems
                                                        do not appear to
                                                        account for
                                                        mass-loss-driven
                                                        orbital expansion

  SYS-008           Medium            Circumbinary      Moon Hill-radius
                                      moons             calculation uses
                                                        primary mass where
                                                        total binary mass is
                                                        appropriate

  SYS-009           Medium            Disk/system       Planet masses can be
                                      budget            sampled
                                                        independently
                                                        without a host-disk
                                                        mass budget

  SYS-010           Medium            Metallicity       A common metallicity
                                                        multiplier is
                                                        applied to small and
                                                        giant planet masses

  COV-001           Medium            Test coverage     Tests lack
                                                        population-level and
                                                        cross-system
                                                        invariant coverage
  --------------------------------------------------------------------------

------------------------------------------------------------------------

# 5. Detailed findings and recommendations

## GAL-001 --- Stellar mass sampler is too top-heavy

`<badge severity="high">`{=html}High priority`</badge>`{=html}

**Relevant code:** `frontend/src/simulation/star.ts`, approximately
lines 38--48.

### Observed behavior

The reviewed stellar mass sampler produces a distribution that is much
more weighted toward high-mass stars than a canonical Kroupa-like
initial mass function over an approximate 0.1--100 solar-mass range.

The audit's approximate distribution comparison was:

  -----------------------------------------------------------------------
  Stellar mass range   Current sampler estimate     Kroupa-like reference
                                                                 estimate
  ------------------- ------------------------- -------------------------
  Below 0.5 M☉                            26.7%                     72.9%

  Above 8 M☉                              10.2%                     0.71%

  Above 25 M☉                              2.8%                     0.14%
  -----------------------------------------------------------------------

These figures are approximate analytical comparisons of the reviewed
sampler and a reference IMF, not results from a Monte Carlo run of the
application.

### Why it matters

The IMF is one of the most consequential distributions in a galaxy
simulation. If the generated population has too many massive stars:

-   The galaxy becomes too bright for its number of stars.
-   Massive, short-lived stars are overrepresented.
-   Supernova and compact-remnant progenitor rates are biased upward.
-   The number of low-mass, long-lived red-dwarf stars is too small.
-   The distribution of possible planetary hosts becomes unrealistic.
-   Metal enrichment and feedback histories can become distorted if
    those are modeled later.
-   The visual galaxy can look more luminous and more blue-white than
    expected for its stellar mass.

This is not a cosmetic issue. It changes the population from which
almost every later system is generated.

### Recommendation

Replace the current sampler with a documented, piecewise IMF sampler. A
Kroupa-like broken power law is a reasonable starting point:

-   One power-law slope below approximately 0.5 M☉.
-   A steeper slope above approximately 0.5 M☉.
-   Explicit lower and upper mass bounds.
-   Correct inverse-CDF sampling for each segment.
-   A clearly documented convention for whether the distribution is a
    number-weighted IMF or mass-weighted distribution.

Do not simply clamp or reshape the current output until the histogram
looks visually plausible. Implement the intended probability
distribution and test it statistically.

### Suggested acceptance criteria

1.  Generate a large seeded sample (for example, at least 100,000 stars
    in a dedicated statistical test).
2.  Compare cumulative fractions in several mass bins against the chosen
    reference IMF.
3.  Use tolerances derived from expected sampling error, not arbitrary
    exact percentages.
4.  Assert that the sampler never emits values outside configured mass
    bounds.
5.  Test behavior near segment boundaries, especially around 0.5 M☉.
6.  Record the IMF model and parameters in developer-facing simulation
    documentation.

### Implementation caution

A Kroupa IMF is a model choice, not the only possible IMF. The team
should select one reference distribution and version it. If Aion Forge
later supports different galaxy environments or star-formation
conditions, the IMF can become a configurable population model.

------------------------------------------------------------------------

## GAL-002 --- Stellar ages do not represent a star-formation history

`<badge severity="high">`{=html}High priority`</badge>`{=html}

**Relevant code:** `frontend/src/simulation/star.ts`, approximately
lines 604--610.

### Observed behavior

The reviewed code assigns an age using a form equivalent to:

``` ts
age = rng() * min(lifespan, universeAgeBY)
```

The stellar evolutionary phase boundaries use approximate thresholds
around 85% and 95% of the assigned lifespan.

For stars whose lifetimes are shorter than the modeled universe age,
this means their assigned age is sampled uniformly from zero to their
own lifespan. The phase thresholds then effectively produce an
artificial distribution of approximately:

-   85% main-sequence stars;
-   10% giant-phase stars;
-   5% remnants.

This is an artifact of the age-sampling method, not a result derived
from a galaxy's formation history.

### Why it matters

A present-day galaxy population is not generated by independently
choosing each star's age from zero to its own lifetime. Stars form at
different times, and the stars visible today are the survivors of that
formation history.

The current approach can cause:

-   An artificial and nearly fixed evolutionary-stage mix for
    short-lived stars.
-   Too many young massive stars relative to a realistic old population.
-   Remnant populations that do not reflect the galaxy's age.
-   Incorrect relationships between stellar mass, age, and evolutionary
    stage.
-   A mismatch between a galaxy's modeled age and the age distribution
    of its stars.

### Recommendation

Separate **formation time**, **current age**, and **stellar evolution**.

A more defensible model:

1.  Define the simulation's current cosmic epoch or galaxy age.
2.  Define a star-formation history (SFH), even if simplified.
3.  Sample each star's formation time from that SFH.
4.  Calculate the star's current age from the current epoch minus
    formation time.
5.  Calculate its lifetime and evolutionary state from mass and
    metallicity.
6.  If it has already ended its life, represent the appropriate remnant
    or post-supernova outcome.
7.  If the simulation models only currently luminous stars, explicitly
    define how remnants and extinct progenitors are represented.

### Practical staged implementation

Aion Forge does not need a full cosmological galaxy-formation model
immediately. A staged approach is sufficient:

-   **Stage 1:** Use a constant star-formation rate over a configured
    galaxy age.
-   **Stage 2:** Add simple declining, burst, or multi-epoch
    star-formation histories.
-   **Stage 3:** Add galaxy-type-dependent histories (e.g. old, quenched
    elliptical versus actively star-forming spiral).
-   **Stage 4:** Add metallicity evolution and more detailed stellar
    tracks if the simulation scope justifies them.

### Suggested acceptance criteria

-   Star ages must never exceed the current modeled epoch.
-   Formation times must be earlier than or equal to the current epoch.
-   A star's phase must follow from its age, mass, and chosen evolution
    model.
-   Changing the SFH must change the population in a predictable
    direction.
-   Old populations should naturally contain remnants of short-lived
    stars.
-   Tests should assert broad population trends, not one exact random
    sample.

------------------------------------------------------------------------

## SYS-001 --- Physics and rendering disagree about orbital radius

`<badge severity="high">`{=html}High priority`</badge>`{=html}

**Relevant code:** - `frontend/src/simulation/planetBasics.ts`,
approximately lines 29--31. - `frontend/src/rendering/systemLayout.ts`,
approximately lines 65--72. -
`frontend/src/rendering/UniverseRenderer.ts`, approximately lines
667--671.

### Observed behavior

The reviewed physics path calculates an effective orbital distance using
a relationship equivalent to:

``` ts
effectiveOrbitAU = orbitalRadius / sqrt(gravityStrength)
```

The rendering path uses the raw `orbitalRadius`.

Therefore, the renderer and simulation can be using different orbital
distances for the same planet.

### Numerical consequence

    `gravityStrength`   Physics effective radius / raw displayed radius
  ------------------- -------------------------------------------------
                 0.25                                            2.000×
                 1.00                                            1.000×
                 2.00                                            0.707×

At `gravityStrength = 0.25`, for example, the physical calculations can
treat the orbit as twice as large as the orbit shown on screen. At
`gravityStrength = 2`, the physics effective radius can be only about
70.7% of the displayed radius.

### Why it matters

This creates a direct contradiction between what the user sees and what
the simulation calculates.

Potential consequences include:

-   Orbital periods that do not match the displayed orbit.
-   Incorrectly interpreted habitable-zone placement.
-   Inconsistent temperature or irradiation calculations.
-   Confusing educational explanations.
-   A user observing a planet's orbit and receiving a report card whose
    physical values correspond to a different distance.

### Recommendation

Establish one canonical orbital representation and make all subsystems
consume it.

A clean design would distinguish:

-   `semiMajorAxisAU`: the physical orbital semi-major axis;
-   `displayOrbitRadius`: a renderer-only layout radius, if visual
    compression or spacing is needed;
-   `simulationScale` or `gravityModelParameter`: an explicitly named
    parameter that affects physics only if that is intended.

Do not overload a generic `orbitalRadius` field with both physical and
display meanings.

If `gravityStrength` is meant to alter the physical gravitational
environment, derive orbital behavior from a coherent gravitational
model. If it is only a visual or gameplay control, it must not silently
change physical distances used by unrelated calculations.

### Suggested acceptance criteria

-   The report card, orbital-period calculation, irradiation
    calculation, and orbit renderer all trace back to the same physical
    semi-major axis.
-   If visual orbit spacing is intentionally nonphysical, the conversion
    is explicit and isolated in the rendering layer.
-   A test changes `gravityStrength` and verifies that physical values
    and displayed values behave according to the documented contract.
-   The UI clearly explains whether a control affects physics,
    visualization, or both.

------------------------------------------------------------------------

## SYS-002 --- Circumbinary orbital period uses the wrong central mass

`<badge severity="high">`{=html}High priority`</badge>`{=html}

**Relevant code:** `frontend/src/simulation/planetPhysics.ts`,
approximately lines 120--134.

### Observed behavior

The reviewed orbital-period calculation uses `star.mass` even for a
planet orbiting a binary-star system.

For a sufficiently distant circumbinary (P-type) orbit, the first-order
Keplerian approximation uses the **total mass of both stars**:

\[ P\^2 = `\frac{4\pi^2 a^3}{G(M_1+M_2)}`{=tex} \]

For a single-star orbit, the central mass is simply the host star's
mass. For a circumbinary orbit, it is the combined mass.

### Numerical consequence

For an equal-mass binary, using only one component's mass instead of the
total mass produces a period that is too long by:

\[ `\sqrt{2}`{=tex} `\approx 1.414`{=tex} \]

That is approximately a 41.4% overestimate.

### Recommendation

Make the central gravitational mass explicit in the orbital calculation:

``` ts
const centralMassSolar = isCircumbinary
  ? primary.mass + secondary.mass
  : primary.mass;
```

Then use the correct central mass in the Keplerian period calculation.

The exact implementation should respect the existing unit system and
binary-system data model. Avoid duplicating subtly different period
formulas across modules.

### Suggested acceptance criteria

-   Single-star period tests remain unchanged.
-   Equal-mass binary tests use total mass and match the expected
    analytical result.
-   Unequal-mass binary tests use the sum of component masses.
-   The orbital period shown in the UI is consistent with the physical
    semi-major axis and central mass.
-   The test suite distinguishes P-type circumbinary planets from S-type
    planets orbiting one component of a binary.

------------------------------------------------------------------------

## SYS-003 --- Large rocky-planet moons can exceed a conservative Hill-stability region

`<badge severity="high">`{=html}High priority`</badge>`{=html}

**Relevant code:** `frontend/src/simulation/moons.ts`, approximately
lines 225--249.

### Observed behavior

The reviewed generator can place large rocky-planet moons at
approximately 30--60 planetary radii without a corresponding
Hill-stability check.

A moon's orbital stability is constrained by the host planet's Hill
sphere and by the details of its orbit. The Hill radius is
approximately:

\[ R_H = a_p`\left`{=tex}(`\frac{m_p}{3M_*}`{=tex}`\right`{=tex})\^{1/3}
\]

where:

-   (a_p) is the planet's semi-major axis around its star;
-   (m_p) is the planet mass;
-   (M\_\*) is the relevant stellar mass (or the appropriate central
    mass for the system model).

For prograde moons, a conservative stable region is substantially
smaller than the full Hill radius. A rough first-order upper envelope
often used for intuition is around 0.5 (R_H), with more conservative
values depending on eccentricity and other assumptions.

### Example from the audit

For an Earth-mass planet at 0.1 AU from a Sun-like star:

-   Hill radius is approximately 23.5 Earth radii.
-   A rough 0.5 Hill-radius envelope is approximately 11.8 Earth radii.

A generated moon at 30--60 planetary radii would be well outside that
conservative region in this example.

### Why it matters

The generator can produce visually impressive moon systems that are not
dynamically credible under the rest of the simulation's assumptions.

### Recommendation

Calculate a maximum stable moon distance for each generated planet and
constrain moon orbits accordingly.

At minimum:

1.  Compute the planet's Hill radius.
2.  Apply a conservative prograde stability fraction.
3.  Reduce the allowed fraction for eccentric planetary orbits.
4.  Account for the relevant central mass in circumbinary systems.
5.  Reject or regenerate moons outside the allowed region.
6.  Consider the Roche limit as an inner boundary for sufficiently close
    moons.

The exact stability fraction should be documented as an approximation,
not presented as a universal constant.

### Suggested acceptance criteria

-   No generated regular prograde moon exceeds the configured fraction
    of the planet's Hill radius.
-   The allowed moon distance decreases when the planet moves closer to
    its star, all else equal.
-   The allowed distance increases with planet mass, all else equal.
-   Binary-host systems use the correct central mass.
-   Tests cover close-in planets, low-mass planets, eccentric orbits,
    and circumbinary hosts.

------------------------------------------------------------------------

## GAL-003 --- Low stellar-ignition thresholds can create endpoint pile-ups

**Severity:** Medium\
**Relevant code:** Stellar mass generation in
`frontend/src/simulation/star.ts`; UI range observed around 0.01--2.

### Observed behavior

When `stellarIgnitionThreshold` is set below 1, the reviewed
mass-sampling path can clamp values to an endpoint. At a threshold
around 0.5, approximately half of the relevant draws can be clamped to
the maximum. At a threshold around 0.01, the effect can dominate almost
the entire sample.

The result is a mass pile-up rather than a smoothly transformed
distribution.

### Why it matters

A control that appears to change the minimum mass or ignition threshold
can unexpectedly create a large spike at one mass. This makes the
control difficult to reason about and can distort the stellar
population.

### Recommendation

Define the intended semantics of `stellarIgnitionThreshold`:

-   Is it a minimum mass for hydrogen fusion?
-   Is it a multiplier on a distribution?
-   Is it a threshold for including stars in the generated population?
-   Is it a gameplay parameter?

Then implement it in the probability distribution itself rather than
applying a clamp that collapses many samples to one endpoint.

If the intended parameter changes the lower bound, re-normalize the
truncated distribution. If it changes a physical threshold, use it as a
classification boundary, not a mass remapping shortcut.

### Suggested acceptance criteria

-   Histograms remain smooth apart from intentional physical
    distribution breaks.
-   No unexplained delta-function-like spike appears at the maximum.
-   Boundary values 0.01, 0.5, 1, and 2 are explicitly tested.
-   UI labels explain the actual meaning of the control.

------------------------------------------------------------------------

## GAL-004 --- Visible galaxy morphology and generated stars are not guaranteed to share a density field

**Severity:** Medium

### Observed behavior

The reviewed galaxy morphology is a procedural approximation:

-   Spiral arms are generated without a fully explicit bulge/halo
    decomposition.
-   Elliptical galaxies do not appear to use a Sérsic-like radial
    profile.
-   Irregular galaxies use procedural clumping.
-   Visible particles and generated stars are not guaranteed to be
    sampled from the same underlying density field.

### Why it matters

The galaxy can look one way while its actual generated stellar
population follows another spatial distribution. This is particularly
important if users can zoom into a galaxy and inspect its stars or
planetary systems.

### Recommendation

Introduce a shared galaxy-density model that can be queried by both:

1.  the visual particle renderer; and
2.  the stellar-position sampler.

For a staged model:

-   **Spiral:** disk + central bulge + optional halo, with radial and
    vertical density profiles; spiral-arm modulation applied to the
    disk.
-   **Elliptical:** a radial profile such as a simplified Sérsic
    distribution.
-   **Irregular:** a configurable set of clumps plus a diffuse
    component.
-   **Dwarf:** lower-mass, lower-density distributions with optional
    irregularity.

The first implementation does not need a high-fidelity galaxy dynamics
solver. It needs a shared, documented density function so the visible
and generated structures agree statistically.

### Suggested acceptance criteria

-   Star-position histograms broadly trace the galaxy's rendered
    density.
-   Spiral galaxies have a distinguishable disk and central component.
-   Elliptical profiles are centrally concentrated without artificial
    spiral structure.
-   Irregular galaxies remain clumpy but statistically coherent.
-   A deterministic seed reproduces the same galaxy density and star
    placement.

------------------------------------------------------------------------

## GAL-005 --- `gravityStrength` semantics are unclear or inconsistent

**Severity:** Medium

### Observed behavior

The reviewed documentation describes `gravityStrength` as affecting
galaxy density and stellar mass distribution, but the inspected
galaxy/star generation path did not appear to use it for those purposes.
Its reviewed use was in the planetary effective-orbit calculation.

### Why it matters

A UI control or simulation parameter should not promise an effect that
the simulation does not implement. This can confuse both users and
future developers.

### Recommendation

Choose one of these contracts:

**Option A --- Physical gravity parameter:**\
Define exactly which gravitational model it modifies, and propagate it
consistently through orbital periods, orbital velocities, stability
calculations, and other dependent quantities.

**Option B --- Galaxy density parameter:**\
Use a name such as `galaxyDensityScale` and apply it to the galaxy
density model.

**Option C --- Visual scale parameter:**\
Use a renderer-specific name and keep it out of physical calculations.

Avoid retaining a broad name like `gravityStrength` if its actual effect
is a narrow distance adjustment.

### Suggested acceptance criteria

-   Parameter names, comments, UI labels, and implementation agree.
-   Tests identify all modules expected to respond to the parameter.
-   No unrelated physical quantity changes as an accidental side effect.

------------------------------------------------------------------------

## SYS-004 --- Ejected planets are counted but not retained as rogue-body records

**Severity:** Medium

### Observed behavior

The reviewed generation path tracks ejected or unstable planets as
counts rather than retaining complete rogue-planet body records. A
`rogue` value exists in the `PlanetType` domain, but the reviewed
generator path does not appear to emit full rogue-planet objects for
these outcomes.

### Why it matters

A count loses information that could support future simulation and
discovery features:

-   Planet mass and composition.
-   Original host system.
-   Ejection mechanism or reason.
-   Ejection epoch.
-   Current position and velocity.
-   Thermal history after ejection.
-   Whether the object retains moons.
-   Whether it is a free-floating planetary-mass object or a former
    planet.

### Recommendation

Represent ejected planets as explicit bodies with stable IDs and
provenance.

A possible data shape:

``` ts
interface RoguePlanetRecord {
  id: string;
  originSystemId: string;
  massEarth: number;
  radiusEarth: number;
  composition: PlanetComposition;
  ejectionReason: "dynamical_instability" | "stellar_encounter" | "binary_perturbation";
  ejectionEpochBY: number;
  position: Vector3;
  velocity: Vector3;
  thermalState: RogueThermalState;
}
```

Adapt this to the project's existing types rather than introducing
duplicate or incompatible models.

### Suggested acceptance criteria

-   Ejected planets remain inspectable entities.
-   Rogue planets have stable IDs and provenance.
-   Their thermal model no longer assumes ordinary stellar irradiation
    from the original host.
-   A discovery entry can distinguish a bound planet from a
    free-floating rogue planet.

------------------------------------------------------------------------

## SYS-005 --- Pairwise mutual-Hill spacing is not a long-term multi-planet stability guarantee

**Severity:** Medium

### Observed behavior

The reviewed planetary spacing filter uses a mutual-Hill separation
criterion of approximately (2`\sqrt{3}`{=tex}). This is a useful
first-pass criterion in the idealized two-planet, circular, coplanar
case, but it does not guarantee long-term stability for arbitrary
multi-planet systems.

### Why it matters

A system can pass all pairwise checks and still become unstable over
long integrations due to:

-   Multiple interacting planets.
-   Eccentricities.
-   Inclinations.
-   Resonance overlap.
-   Binary perturbations.
-   Large planet-to-star mass ratios.

### Recommendation

Keep the current criterion as a fast generation filter, but label it
accurately as a first-pass spacing check.

Then add a second validation tier:

-   A calibrated empirical stability score for generated systems; or
-   Short N-body integrations for selected systems; or
-   A hybrid approach where only borderline/high-mass systems receive
    more expensive validation.

### Suggested acceptance criteria

-   The code and UI do not describe the pairwise criterion as proof of
    long-term stability.
-   Tests include multi-planet edge cases.
-   The generator can reject or flag systems with high instability risk.
-   Expensive N-body validation is bounded and does not run
    indiscriminately for every generated system.

------------------------------------------------------------------------

## SYS-006 --- "Resonant" architecture is based on spacing, not demonstrated resonance

**Severity:** Medium

### Observed behavior

The reviewed architecture logic labels some systems as resonant while
drawing adjacent semi-major-axis ratios in a range around 1.5--1.7. This
is near the 2:1 period-ratio architecture, but spacing alone does not
establish a mean-motion resonance.

### Why it matters

A true mean-motion resonance involves dynamical behavior, typically
demonstrated through resonant angles that librate rather than circulate.
A near-2:1 period ratio can be non-resonant.

### Recommendation

Until resonance dynamics are implemented, use a label such as:

-   `near_2_to_1_spacing`
-   `near_resonant_architecture`
-   `compact_near_2_to_1_system`

If the simulation later supports resonance behavior, add:

-   Period-ratio checks.
-   Resonant-angle definitions.
-   Eccentricity and inclination conditions.
-   A libration/circulation test over a suitable integration interval.

### Suggested acceptance criteria

-   UI labels distinguish "near resonance" from "confirmed resonance".
-   The data model records the basis for the label.
-   Tests do not infer resonance from semi-major-axis ratio alone.

------------------------------------------------------------------------

## SYS-007 --- White-dwarf systems do not appear to account for orbital expansion after stellar mass loss

**Severity:** Medium

### Observed behavior

The reviewed white-dwarf system path appears to preserve progenitor mass
and raw orbital radius without applying the orbital response expected
from stellar mass loss.

For slow, approximately isotropic mass loss and an orbit that remains
adiabatic, a first-order relation is:

\[ a_f `\approx `{=tex}a_i `\frac{M_i}{M_f}`{=tex} \]

where (M_i) and (M_f) are the initial and final stellar masses.

This is a simplified approximation; real outcomes can be more complex.

### Why it matters

A planet orbiting a white dwarf should not generally be treated as if
the host star retained its main-sequence mass. The host's mass loss can
expand or destabilize orbits and can alter the fate of planets and minor
bodies.

### Recommendation

Track at least:

-   Progenitor mass.
-   Current remnant mass.
-   Initial semi-major axis.
-   Current semi-major axis.
-   Whether the orbit is assumed to evolve adiabatically.
-   Whether the planet is engulfed, destabilized, or survives.

For a first version, apply a documented adiabatic expansion
approximation to surviving wide orbits. Do not silently overwrite the
original orbit; preserve it as history/provenance.

### Suggested acceptance criteria

-   White-dwarf systems use remnant mass for current orbital periods.
-   Surviving orbits reflect the chosen mass-loss approximation.
-   Engulfment and instability rules are consistent with the
    stellar-evolution phase.
-   Tests cover low- and high-mass progenitors.

------------------------------------------------------------------------

## SYS-008 --- Circumbinary moon Hill-radius calculation uses primary mass

**Severity:** Medium

**Relevant code:** Moon stability calculations in
`frontend/src/simulation/moons.ts`.

### Observed behavior

The reviewed regular-moon Hill-limit calculation uses the primary star's
mass in a circumbinary context. For a planet orbiting the binary
barycenter, the first-order central mass should be the combined binary
mass.

### Numerical consequence

For an equal-mass binary, using only one component's mass can
overestimate the Hill radius by:

\[ 2\^{1/3} `\approx 1.26`{=tex} \]

That is roughly a 26% overestimate.

### Recommendation

Centralize the definition of the system's effective central mass and use
it consistently for:

-   Planet orbital periods.
-   Planet Hill radii.
-   Moon stability.
-   Other calculations that treat the binary as a distant central mass.

Do not fix the orbital-period path and forget the moon-stability path.
These calculations should share the same system-level mass abstraction.

### Suggested acceptance criteria

-   Circumbinary moon limits use total binary mass.
-   Single-star behavior remains unchanged.
-   Equal-mass and unequal-mass binary tests cover the calculation.
-   The same effective central mass helper is reused where appropriate.

------------------------------------------------------------------------

## SYS-009 --- Planet masses are not constrained by a shared protoplanetary disk budget

**Severity:** Medium

### Observed behavior

The reviewed generator samples planet masses independently and does not
appear to enforce a shared disk mass budget.

A system with eight planets each near the upper configured mass of 4,000
Earth masses would contain approximately:

\[ 8 `\times 4000`{=tex} M\_`\oplus `{=tex}`\approx 0.096`{=tex}
M\_`\odot`{=tex} \]

That is close to the mass of a 0.1-solar-mass host star. Such a system
is outside the comfortable assumptions of the simplified Keplerian and
Hill-approximation model.

### Why it matters

Independent planet-mass sampling can create systems whose total
planetary mass is implausibly large relative to the host and whose
dynamics should no longer be treated as a collection of low-mass test
bodies.

### Recommendation

Introduce a disk mass budget:

1.  Sample or derive a disk mass from stellar mass and a configurable
    distribution.
2.  Allocate a fraction to solids and a fraction to gas.
3.  Generate planet cores and gas envelopes within that budget.
4.  Enforce a maximum total planet-to-star mass ratio for the simplified
    orbital model.
5.  If a system exceeds that ratio, either reject it, flag it for a more
    advanced dynamical model, or use a different generation regime.

The initial version can be statistical and approximate. The important
improvement is that planet masses are no longer completely independent
of one another.

### Suggested acceptance criteria

-   Total planetary mass is bounded by a documented disk budget.
-   The maximum allowed planet-to-star mass ratio is explicit.
-   Tests cover low-mass stars and high-mass giant-planet systems.
-   Systems outside the simplified model's valid regime are flagged
    rather than silently accepted.

------------------------------------------------------------------------

## SYS-010 --- Metallicity scaling is too uniform across planet classes

**Severity:** Medium

### Observed behavior

The reviewed model applies a common metallicity multiplier to small and
giant planet masses.

### Why it matters

Observed exoplanet population trends are not identical for all planet
classes. Giant-planet occurrence has a comparatively strong relationship
with host-star metallicity, while small-planet occurrence is generally
less strongly dependent in broad population studies.

A single multiplier can make small-planet populations respond too
strongly to metallicity and can conflate planet occurrence with planet
mass.

### Recommendation

Separate at least three concepts:

-   Planet occurrence probability.
-   Planet core/solid mass.
-   Gas-envelope acquisition or giant-planet formation probability.

Use class-dependent metallicity response functions. Keep the first
version simple and configurable; avoid pretending that one multiplier
captures all planet-formation physics.

### Suggested acceptance criteria

-   Small-planet and giant-planet populations respond differently to
    metallicity.
-   The relationship is documented as a procedural approximation.
-   Tests verify monotonic trends where intended without requiring an
    exact observational fit.

------------------------------------------------------------------------

## COV-001 --- Existing tests do not cover key population-level and cross-system invariants

`<badge severity="medium">`{=html}Coverage gap`</badge>`{=html}

### Positive observations

The reviewed test coverage already includes several useful local checks:

-   Deterministic seeded generation.
-   Planet mass-radius relationships.
-   Regular moon orbital periods.
-   Dust-sublimation placement.
-   Engulfment behavior.
-   Some local physical invariants.
-   Binary separation / barycentric behavior.
-   Holman--Wiegert S/P boundary formulas and reference tests.

This is a good foundation. The goal should be to extend the test
strategy, not replace useful tests that already exist.

### Missing coverage identified

The reviewed tests did not adequately cover:

-   IMF distribution statistics.
-   Stellar age and evolutionary-stage population fractions.
-   Remnant population behavior under different star-formation
    histories.
-   Physical orbit versus rendered orbit consistency.
-   Circumbinary period calculations using total binary mass.
-   Large-moon Hill stability.
-   Circumbinary moon Hill limits using total binary mass.
-   Retention of ejected planets as explicit rogue records.
-   Multi-planet stability beyond pairwise spacing.
-   Resonance classification semantics.
-   White-dwarf mass-loss orbital evolution.
-   Disk mass budgets.
-   Population-level metallicity response.

### Recommendation

Organize tests into four tiers:

1.  **Unit tests:** individual formulas, conversions, and boundary
    conditions.
2.  **Property tests:** invariants that must hold across many generated
    systems.
3.  **Population/statistical tests:** distributions such as IMF, age,
    and planet occurrence.
4.  **Integration/visual-consistency tests:** simulation values agree
    with renderer inputs and UI report-card values.

Avoid making every test depend on one exact random seed and one exact
output. Prefer statistically justified ranges and deterministic seeds
for reproducibility.

------------------------------------------------------------------------

# 6. Positive architectural observations

The audit also identified existing design choices worth preserving.

## 6.1 Deterministic random generation

Seeded random streams are valuable for reproducibility, debugging, and
comparing simulation changes. Preserve deterministic generation when
refactoring the IMF, star-formation history, planet masses, and galaxy
density model.

Where practical, use separate random streams or derived seeds for
independent subsystems so that changing one generator does not
unexpectedly reshuffle every other generated property.

## 6.2 Simulation/rendering separation

The code has a meaningful separation between simulation data and
rendering code. That separation should be strengthened rather than
collapsed.

The orbit mismatch identified in SYS-001 is an example of why the
boundary needs a clear contract: the renderer should receive an explicit
physical orbit and, if necessary, a separately computed display-space
orbit.

## 6.3 Binary-star and barycentric foundations

The reviewed binary-star and barycentric animation concepts are a useful
foundation. The binary separation and barycentric treatment appeared
coherent in the reviewed paths, and the Holman--Wiegert S/P boundary
formulas had reference tests.

Preserve those tested behaviors while fixing circumbinary total-mass
handling in the orbital-period and moon-stability paths.

## 6.4 Existing local physical checks

Planet mass-radius relations, regular moon periods, dust-sublimation
placement, engulfment, and other local checks provide a base on which
broader property and population tests can be built.

------------------------------------------------------------------------

# 7. Recommended implementation roadmap

The following sequence is designed to reduce scientific inconsistency
while minimizing the risk of changing many systems at once.

## P0 --- Correct foundational population and orbit behavior

**Goal:** Fix errors that affect large portions of generated content or
create contradictions between physics and visuals.

  ----------------------------------------------------------------------------
                  Order Work item            Related findings Expected outcome
  --------------------- -------------------- ---------------- ----------------
                      1 Implement and        GAL-001          Credible stellar
                        statistically test a                  mass
                        documented IMF                        distribution

                      2 Separate formation   GAL-002          More defensible
                        time, age, and                        present-day
                        evolutionary state                    stellar
                                                              population

                      3 Fix                  GAL-003          No artificial
                        ignition-threshold                    mass pile-ups
                        remapping and                         
                        endpoint clamping                     

                      4 Define canonical     SYS-001          Display and
                        physical orbit                        physics agree
                        fields and renderer                   
                        conversion                            

                      5 Use total binary     SYS-002          Correct
                        mass for                              first-order
                        circumbinary periods                  P-type period

                      6 Enforce conservative SYS-003          Reject
                        moon Hill-stability                   implausibly
                        limits                                distant regular
                                                              moons

                      7 Use total binary     SYS-008          Consistent
                        mass in circumbinary                  binary-host moon
                        moon stability                        limits
  ----------------------------------------------------------------------------

**P0 exit criteria:**

-   All new unit/property tests pass.
-   Statistical IMF tests are within documented tolerances.
-   Physical and rendered orbit contracts are explicit.
-   Circumbinary calculations use a shared central-mass abstraction.
-   Moon generation respects a documented conservative stability
    boundary.
-   No existing binary/barycentric regression tests are broken.

## P1 --- Preserve dynamical outcomes and improve system architecture

**Goal:** Make generated systems more coherent and make the simulation's
terminology honest.

  ------------------------------------------------------------------------
                  Order Work item        Related findings Expected outcome
  --------------------- ---------------- ---------------- ----------------
                      1 Retain ejected   SYS-004          Rogue planets
                        planets as rogue                  become
                        records                           discoverable
                                                          entities

                      2 Add a            SYS-005          Fewer unstable
                        second-tier                       systems accepted
                        multi-planet                      as stable
                        stability check                   

                      3 Rename           SYS-006          Accurate system
                        near-resonant                     labels
                        architectures or                  
                        implement                         
                        resonance checks                  

                      4 Model            SYS-007          More coherent
                        white-dwarf                       remnant systems
                        mass-loss                         
                        orbital response                  
  ------------------------------------------------------------------------

**P1 exit criteria:**

-   Ejected bodies have stable IDs and provenance.
-   Pairwise spacing is described as a filter, not a guarantee.
-   Resonance labels are supported by the level of dynamics actually
    implemented.
-   White-dwarf systems distinguish progenitor properties from current
    remnant properties.

## P2 --- Improve galaxy structure and planet-formation population coherence

**Goal:** Make large-scale galaxy populations and planetary systems more
internally consistent.

  ---------------------------------------------------------------------------
                  Order Work item           Related findings Expected outcome
  --------------------- ------------------- ---------------- ----------------
                      1 Create shared       GAL-004          Rendered and
                        galaxy density                       generated galaxy
                        functions                            structure agree

                      2 Clarify or split    GAL-005          Parameters have
                        `gravityStrength`                    honest, testable
                        semantics                            contracts

                      3 Add a               SYS-009          Planet masses
                        protoplanetary disk                  are constrained
                        mass budget                          as a system

                      4 Separate            SYS-010          More defensible
                        metallicity effects                  population
                        by planet class and                  trends
                        formation channel                    

                      5 Expand              COV-001          Regressions
                        population-level                     become
                        test suite                           detectable
  ---------------------------------------------------------------------------

**P2 exit criteria:**

-   Galaxy star-position statistics trace the intended morphology.
-   Every global control has documented and tested effects.
-   Planetary mass totals respect a defined disk budget.
-   Metallicity influences planet classes through separate documented
    models.
-   Population-level tests run reproducibly.

------------------------------------------------------------------------

# 8. Proposed validation and test matrix

The following matrix can be translated into Vitest tests or the
project's existing test organization. Names are suggestions, not claims
that these tests already exist.

  ---------------------------------------------------------------------------------------------------------
  Test area               Suggested test                                            Expected invariant
  ----------------------- --------------------------------------------------------- -----------------------
  IMF                     `stellarMassSampler.matchesReferenceIMFWithinTolerance`   Sampled mass-bin
                                                                                    fractions fall within
                                                                                    statistical tolerance

  IMF                     `stellarMassSampler.respectsMassBounds`                   No values outside
                                                                                    configured bounds

  IMF                     `stellarMassSampler.hasNoEndpointPileup`                  No unexplained clamped
                                                                                    mass spike

  SFH                     `stellarAge.neverExceedsCurrentEpoch`                     Age is physically
                                                                                    bounded

  SFH                     `stellarPhase.derivesFromAgeAndLifetime`                  Phase follows the
                                                                                    selected evolution
                                                                                    model

  SFH                     `stellarPopulation.respondsToFormationHistory`            Burst/declining
                                                                                    histories change
                                                                                    population as expected

  Orbit                   `orbitRenderer.usesCanonicalPhysicalOrbit`                Rendered orbit
                                                                                    conversion is explicit
                                                                                    and consistent

  Orbit                   `orbitalPeriod.singleStarMatchesKepler`                   Single-star formula
                                                                                    remains correct

  Binary                  `orbitalPeriod.circumbinaryUsesTotalMass`                 P-type period uses
                                                                                    (M_1+M_2)

  Binary                  `orbitalPeriod.equalMassBinaryRegression`                 Equal-mass result
                                                                                    matches analytical
                                                                                    expectation

  Moon                    `moonOrbit.respectsConservativeHillLimit`                 Regular moons remain
                                                                                    within configured
                                                                                    stability fraction

  Moon                    `moonOrbit.circumbinaryUsesTotalMass`                     Binary central mass is
                                                                                    correct

  Rogue                   `ejectedPlanet.retainsBodyRecord`                         Ejection does not
                                                                                    reduce the body to a
                                                                                    count only

  Stability               `planetarySystem.flagsBorderlineMultiPlanetSystems`       Multi-planet risk is
                                                                                    not hidden by pairwise
                                                                                    checks

  Resonance               `architecture.nearTwoToOneIsNotConfirmedResonance`        Spacing alone does not
                                                                                    establish resonance

  White dwarf             `whiteDwarf.survivingOrbitExpandsAfterMassLoss`           Chosen mass-loss
                                                                                    approximation is
                                                                                    applied

  Disk                    `planetarySystem.respectsDiskMassBudget`                  Total planet mass
                                                                                    respects budget

  Metallicity             `planetPopulation.usesClassSpecificMetallicityResponse`   Small and giant
                                                                                    populations do not
                                                                                    share an accidental
                                                                                    common multiplier

  Galaxy                  `galaxy.starPositionsTraceRenderedDensity`                Star positions follow
                                                                                    intended morphology

  Determinism             `generation.sameSeedProducesSamePopulation`               Same inputs and seed
                                                                                    reproduce the same
                                                                                    output
  ---------------------------------------------------------------------------------------------------------

## 8.1 Statistical-test guidance

Population tests should avoid brittle exact-value assertions. For
example:

-   Use a fixed seed so failures are reproducible.
-   Generate enough samples for the tested distribution.
-   Compare against the selected theoretical CDF or bin expectations.
-   Choose tolerances using binomial or sampling uncertainty.
-   Keep reference distributions and parameters in test fixtures.
-   Report the observed and expected fractions on failure.

A test that only checks that masses are positive will not catch a
severely biased IMF.

## 8.2 Cross-module consistency tests

The most valuable tests for this audit are not all isolated formula
tests. Some should verify that different modules agree:

-   The physical semi-major axis used for period calculation is the one
    used for irradiation.
-   The renderer receives an explicit display conversion from the same
    physical orbit.
-   The report card displays the physical orbital distance, not a
    display-space radius.
-   Circumbinary periods and moon stability use the same total central
    mass.
-   Stellar remnant mass and current orbital period use the same
    current-epoch model.

------------------------------------------------------------------------

# 9. Suggested engineering design contracts

These are recommended contracts to reduce future ambiguity.

## 9.1 Stellar population contract

A generated star should be explainable in terms of:

-   Initial mass.
-   Current mass.
-   Formation time.
-   Current age.
-   Metallicity.
-   Evolutionary state.
-   Remnant type, if applicable.
-   The IMF and SFH model versions used to generate it.

Do not conflate initial mass with current mass for evolved stars.

## 9.2 Orbital contract

A planet's physical orbit should have one canonical representation,
ideally including:

-   Semi-major axis.
-   Eccentricity.
-   Inclination.
-   Orbital period.
-   Central system identity.
-   Effective central mass used by the approximation.

Renderer-specific radii and offsets should be derived separately.

## 9.3 Binary-system contract

A binary host should expose a shared helper or property for:

-   Primary mass.
-   Secondary mass.
-   Total mass.
-   Binary separation.
-   Binary eccentricity.
-   Barycenter.
-   Planet orbit type (S-type or P-type).

This avoids each calculation independently guessing whether it should
use the primary or total mass.

## 9.4 Moon-system contract

A generated moon should be checked against:

-   Roche limit or an appropriate inner bound.
-   Hill radius.
-   Conservative prograde stability fraction.
-   Planetary eccentricity.
-   Host-system type.
-   Relevant central mass.
-   Any modeled tidal or migration assumptions.

The generator should distinguish regular moons from captured or
transient objects if those are introduced later.

## 9.5 Discovery/provenance contract

For future discovery features, preserve why an object exists:

-   Which system generated it.
-   Which formation model created it.
-   Whether it was ejected or captured.
-   Whether it is a remnant or survivor.
-   Which simulation rules/version were applied.

This will make the discovery catalogue more meaningful and will help
debug procedural outliers.

------------------------------------------------------------------------

# 10. Suggested task breakdown for Claude

Claude should treat this as a staged engineering task, not as permission
to rewrite the entire simulation in one pass.

## Phase 0 --- Reconfirm current source state

1.  Check out `galaxy-planet-validation`.
2.  Confirm the current HEAD and compare it with the audit baseline.
3.  Re-open every cited source location.
4.  Identify any code changes made since the audit.
5.  Map each finding to the current implementation and current tests.
6.  Produce a short implementation plan before changing code.

## Phase 1 --- Implement P0 in isolated changes

Suggested order:

1.  Add reference IMF utilities and tests.
2.  Add or refactor stellar age/SFH logic.
3.  Correct ignition-threshold behavior.
4.  Define canonical orbit data and renderer conversion.
5.  Correct circumbinary period central mass.
6.  Correct moon Hill-stability constraints.
7.  Correct circumbinary moon central mass.

For each change:

-   Keep deterministic seeded behavior.
-   Add tests before or alongside the implementation.
-   Avoid unrelated visual/UI changes.
-   Preserve existing binary and barycentric behavior.
-   Document any intentional approximation.

## Phase 2 --- Run local validation

At minimum, from `frontend/`:

``` bash
npm ci
npm test
npm run build
npm run lint
```

If dependencies are already installed and lockfile state is known, use
the repository's normal reproducible install process.

For shaders:

1.  Inventory shader source files and runtime compilation paths.
2.  Identify GLSL version and WebGL target.
3.  Run a compatible static shader compiler/validator if available.
4.  Test shader compilation in the actual WebGL context.
5.  Exercise representative galaxy, star, planet, and black-hole
    rendering paths.
6.  Capture shader compile/link errors separately from TypeScript/Vite
    build results.

A TypeScript build does not prove that runtime GLSL compiles.

## Phase 3 --- P1/P2 implementation

Only after P0 tests are stable, move to rogue planets, system stability,
resonance semantics, white-dwarf evolution, galaxy density, disk
budgets, and metallicity.

## Phase 4 --- Report results

For every finding, report:

-   Status: fixed / partially fixed / deferred / not applicable.
-   Files changed.
-   Tests added or changed.
-   Commands executed.
-   Pass/fail output.
-   Known limitations.
-   Any change to the scientific assumptions.

Do not report a finding as fixed merely because a code path was edited.
It is fixed only when the implementation and corresponding validation
support that claim.

------------------------------------------------------------------------

# 11. Guardrails and non-goals for this validation branch

The user's requested validation scope explicitly excluded APK and
database checks at this stage.

Therefore, the immediate validation phase should focus on:

-   Frontend unit tests.
-   TypeScript/Vite production build.
-   Lint.
-   Shader validation and runtime shader compilation where feasible.
-   Simulation-level numerical and population tests.

Do not include the following unless separately requested:

-   Android APK build or device installation.
-   Database inspection, migration, seeding, or mutation.
-   Production service calls.
-   External service integrations.
-   Any unrelated deployment activity.

The branch was created as a clean copy of the audited branch. No code
modifications were made as part of the audit or branch creation.

------------------------------------------------------------------------

# 12. Scientific references and implementation reading list

These are recommended reference topics for the developer implementing
the changes. The audit did not use live web research in this session, so
the list is intentionally given as established reference works/topics
rather than as a claim that a particular online edition was consulted.

1.  **Kroupa initial mass function** --- broken power-law stellar
    initial mass distribution and its normalization.
2.  **Chabrier initial mass function** --- alternative commonly used
    IMF, especially useful for comparison at low stellar masses.
3.  **Stellar evolution tracks** --- mass-, age-, and
    metallicity-dependent lifetimes and evolutionary states.
4.  **Star-formation histories** --- constant, declining, burst, and
    multi-component histories for different galaxy populations.
5.  **Kepler's third law for two-body and circumbinary approximations**
    --- central mass and semi-major-axis consistency.
6.  **Hill sphere and satellite stability** --- distinction between the
    Hill radius and the smaller stable region for prograde satellites.
7.  **Holman & Wiegert critical semimajor-axis fits** --- S-type and
    P-type stability boundaries for planets in binary systems.
8.  **Mutual Hill stability** --- assumptions and limitations of the
    two-planet circular/coplanar criterion.
9.  **Mean-motion resonance dynamics** --- resonant angles, libration,
    and the distinction between near-commensurate period ratios and true
    resonance.
10. **Adiabatic stellar mass loss** --- orbital expansion and the
    limitations of the simple (a_f/a_i `\approx `{=tex}M_i/M_f)
    approximation.
11. **Planet-metallicity correlations** --- differences between
    giant-planet occurrence and small-planet population trends.
12. **Protoplanetary disk mass distributions** --- constraints on total
    planetary system mass relative to the host star.

The implementation should record which reference model and approximation
it adopts. The aim is not to make Aion Forge a full research-grade
astrophysics code in one step; it is to make the chosen approximations
coherent and testable.

------------------------------------------------------------------------

# 13. Final recommendations

If only a small amount of development time is available, prioritize
these five changes:

1.  **Fix the IMF.** It is the largest population-level bias found in
    the review.
2.  **Fix stellar age assignment.** The current approach can impose
    artificial evolutionary-stage fractions.
3.  **Unify physical and rendered orbital distance.** A simulation
    should not display an orbit different from the one its physics uses
    without explicitly identifying that transformation.
4.  **Use total binary mass for circumbinary calculations.** Apply this
    consistently to periods and moon stability.
5.  **Constrain large moons by Hill stability.** Prevent obviously
    implausible moon placements at generation time.

After these are validated, move to rogue planets, multi-planet
stability, resonance semantics, white-dwarf orbital evolution, galaxy
density coherence, disk mass budgets, and metallicity response.

The most important engineering principle is this:

> **Aion Forge should prefer a smaller number of internally consistent,
> explainable astrophysical rules over a larger number of visually
> impressive but disconnected procedural effects.**

The project already has useful foundations. The next step is to
strengthen the scientific and numerical contracts between the galaxy
generator, stellar evolution, planetary-system generator, orbital
physics, and renderer. Doing that will make future features---including
discovery rarity, civilization emergence, unusual planetary systems, and
black-hole environments---more credible because they will be built on a
coherent underlying universe.

------------------------------------------------------------------------

## Appendix A --- Key numerical checks captured during the audit

  ------------------------------------------------------------------------
  Check                           Approximate result Interpretation
  --------------------- ---------------------------- ---------------------
  Current sampler stars                        26.7% Too few low-mass
  below 0.5 M☉                                       stars versus
                                                     Kroupa-like reference

  Kroupa-like stars                            72.9% Reference comparison
  below 0.5 M☉                                       used in audit

  Current sampler stars                        10.2% Strongly top-heavy
  above 8 M☉                                         

  Kroupa-like stars                            0.71% Reference comparison
  above 8 M☉                                         used in audit

  Current sampler stars                         2.8% Excessive
  above 25 M☉                                        massive-star tail

  Kroupa-like stars                            0.14% Reference comparison
  above 25 M☉                                        used in audit

  Equal-mass binary                           +41.4% Period overestimated
  period error if only                               by factor √2
  one component mass is                              
  used                                               

  Equal-mass binary                             +26% Hill radius
  Hill-radius error if                               overestimated by
  only one component                                 factor 2\^(1/3)
  mass is used                                       

  Earth-mass planet at            \~23.5 Earth radii Approximate example
  0.1 AU around 1 M☉:                                
  Hill radius                                        

  Same example: 0.5               \~11.8 Earth radii Conservative
  Hill-radius envelope                               illustrative bound

  Eight planets at                        \~0.096 M☉ Nearly 0.1 solar mass
  4,000 M⊕ each                                      in planets
  ------------------------------------------------------------------------

These values are intended to explain the review's reasoning. Recalculate
them in automated tests using the final chosen units, constants, and
model assumptions.

## Appendix B --- Audit status vocabulary

Use the following status vocabulary in future audit updates:

-   **Confirmed:** Current code and tests demonstrate the finding.
-   **Fixed + tested:** Implementation changed and relevant tests pass.
-   **Fixed, validation pending:** Code changed but required validation
    has not run.
-   **Partially addressed:** Some cases are fixed; known gaps remain.
-   **Deferred:** Accepted as a known limitation for a later milestone.
-   **Not applicable:** The current implementation or intended model
    makes the finding irrelevant; document why.
-   **Reopened:** A later change reintroduced the behavior.

This vocabulary will help the team distinguish actual validation from
implementation progress.
