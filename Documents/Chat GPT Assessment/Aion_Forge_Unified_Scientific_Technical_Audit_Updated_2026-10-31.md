# Aion Forge --- Unified Scientific & Technical Audit

## Consolidated findings, recommendations, and implementation roadmap

**Repository:** `IronMax-Hub/Aion-Forge`\
**Audited branch:** `black-hole-render`\
**Validation branch:** `galaxy-planet-validation`\
**Audit baseline:** `583ad8b2c75460f7bd8b07997136b836d1df4697`\
**Audience:** Aion Forge development team and co-developer Claude.

> **Evidence note:** This document combines the static source audit
> performed in this ChatGPT session with Claude's independent assessment
> and supplied probe results. Claude's reported runtime measurements and
> test-suite results have not been independently reproduced here.
> Reconfirm findings and source locations against the current branch
> before editing.

------------------------------------------------------------------------

# 1. Executive summary

The two assessments are complementary.

-   The first audit focused on galaxy generation, stellar populations,
    planetary-system generation, orbital mechanics, moon stability, and
    simulation/rendering consistency.
-   Claude's independent assessment extended the review into climate
    limits, numerical convergence, stellar evolution and remnants,
    planetary structure, black-hole disc normalization, brown-dwarf
    companions, and scientific communication around life and
    civilization.

Together, they identify risks that propagate through the simulation:

1.  Stellar population assumptions affect which stars host planetary
    systems.
2.  Stellar age, luminosity, and remnant models affect planetary
    irradiation and system evolution.
3.  Orbital and planetary-structure assumptions affect climate and
    habitability.
4.  Climate errors propagate into water stability, life, minds, and
    civilization statistics.
5.  Numerical integration errors can make outcomes depend on timestep.
6.  UI labels can make speculative outputs appear scientifically
    established.

**Core recommendation:** establish a scientific validation layer
alongside the existing software test suite. Passing unit tests does not
prove that the model is scientifically calibrated. Aion Forge needs
population-level statistical tests, numerical convergence tests,
physical-domain checks, and cross-module consistency tests.

## Highest priorities

  -----------------------------------------------------------------------
  Priority                Work                    Reason
  ----------------------- ----------------------- -----------------------
  Critical                Climate runaway and     Habitability, life and
                          greenhouse limits       civilization depend on
                                                  climate

  Critical                Numerical convergence   Results may depend on
                                                  timestep

  Critical                IMF and star-formation  Stellar populations
                          history                 underpin the generated
                                                  universe

  High                    Giant-star and remnant  Extreme
                          models                  luminosities/radii
                                                  distort planetary
                                                  environments

  High                    Orbital and binary-mass Physics, reports and
                          consistency             rendering must agree

  High                    Planet structure and    Prevent implausible
                          moon stability          planetary systems

  High                    Scientific labels and   Separate established
                          explicit assumptions    physics from
                                                  speculation
  -----------------------------------------------------------------------

> Aion Forge should prefer a smaller number of internally consistent,
> explainable astrophysical rules over a larger number of visually
> impressive but disconnected procedural effects.

------------------------------------------------------------------------

# 2. Provenance and validation status

## 2.1 First audit

The first audit was a static source review of `black-hole-render`. It
identified 16 findings: 5 High and 11 Medium.

Main source paths reviewed:

-   `frontend/src/simulation/star.ts`
-   `frontend/src/simulation/planetBasics.ts`
-   `frontend/src/simulation/planetPhysics.ts`
-   `frontend/src/simulation/moons.ts`
-   `frontend/src/rendering/systemLayout.ts`
-   `frontend/src/rendering/UniverseRenderer.ts`

Line numbers in the earlier audit are navigation hints tied to the
recorded baseline and must be reconfirmed.

## 2.2 Claude's independent assessment

Claude supplied findings C1--C3, S1--S5, P1/P2/P5, BH2, G1, B2, L1/L2,
and Physics-page documentation issues, along with probe descriptions and
reported outputs.

## 2.3 Branch status

A branch named `galaxy-planet-validation` was created from
`black-hole-render`. At creation, GitHub reported the branches
identical, with baseline SHA:

`583ad8b2c75460f7bd8b07997136b836d1df4697`

No source modifications were made during the audit or branch creation.
No commit or push was performed.

## 2.4 Evidence distinction

  -----------------------------------------------------------------------
  Item                                Status
  ----------------------------------- -----------------------------------
  First audit source findings         Static review and mathematical
                                      reasoning

  First audit IMF comparison          Approximate analytical comparison

  Claude's probe results              Reported by Claude; not
                                      independently rerun here

  Claude's 60-file / 665-test result  Reported by Claude; not
                                      independently rerun here

  Build, lint, shader validation in   Not run
  this chat                           

  APK and database validation         Not run; excluded from requested
                                      scope
  -----------------------------------------------------------------------

Do not present Claude's reported measurements as independently
reproduced results.

------------------------------------------------------------------------

# 3. Consolidated finding register

## 3.1 Climate and numerical modelling

  -----------------------------------------------------------------------------------
  ID                Severity          Finding                       Origin
  ----------------- ----------------- ----------------------------- -----------------
  C1                Critical          Runaway greenhouse /          Claude
                                      outgoing-longwave-radiation   
                                      (OLR) limit needs explicit    
                                      treatment                     

  C2                Critical          Temperature-dependent         Claude
                                      water-vapour feedback,        
                                      steam-atmosphere handling,    
                                      surface-temperature bounds,   
                                      and high-CO₂ greenhouse       
                                      limits need review            

  C3                Critical          Climate/world-history results Claude
                                      need timestep-convergence     
                                      tests and adaptive substeps   
                                      around transitions            
  -----------------------------------------------------------------------------------

## 3.2 Stellar population and evolution

  --------------------------------------------------------------------------------
  ID                Severity          Finding                    Origin
  ----------------- ----------------- -------------------------- -----------------
  S1 / GAL-001      Critical          Stellar mass sampler is    Both
                                      substantially too          
                                      top-heavy relative to a    
                                      Kroupa- or Chabrier-like   
                                      IMF                        

  S2 / GAL-002      Critical          Stellar ages are sampled   Both
                                      against each star's own    
                                      lifetime rather than a     
                                      per-galaxy-type            
                                      star-formation history     

  S3                High              Giant-star luminosity and  Claude
                                      radius need                
                                      mass/evolution-dependent   
                                      bounds                     

  S4                High              Main-sequence              Claude
                                      mass--luminosity and       
                                      mass--radius relations     
                                      should be piecewise        

  S5                High              White dwarfs and neutron   Claude
                                      stars need                 
                                      remnant-specific radii,    
                                      temperatures and           
                                      luminosities; white-dwarf  
                                      cooling needs review       

  GAL-003           Medium            Low ignition-threshold     First audit
                                      values can cause endpoint  
                                      clamping and mass pile-ups 

  GAL-005           Medium            `gravityStrength`          First audit
                                      semantics and              
                                      implementation appear      
                                      inconsistent               
  --------------------------------------------------------------------------------

## 3.3 Galaxy morphology and companions

  -----------------------------------------------------------------------
  ID                Severity          Finding           Origin
  ----------------- ----------------- ----------------- -----------------
  GAL-004           Medium            Rendered galaxy   First audit
                                      morphology and    
                                      generated star    
                                      positions do not  
                                      necessarily share 
                                      one density model 

  G1                Medium            Galaxy particle   Claude
                                      x/z scatter       
                                      should be         
                                      independent where 
                                      intended          

  B2                Medium            Brown-dwarf       Claude
                                      companion         
                                      generation and    
                                      classification    
                                      need review       
  -----------------------------------------------------------------------

## 3.4 Planetary systems and orbital physics

  ----------------------------------------------------------------------------
  ID                Severity          Finding                Origin
  ----------------- ----------------- ---------------------- -----------------
  SYS-001           High              Physical orbital       First audit
                                      radius and rendered    
                                      orbital radius can     
                                      disagree               

  SYS-002           High              Circumbinary period    First audit
                                      calculation uses       
                                      primary mass rather    
                                      than total binary mass 

  SYS-003           High              Large rocky-planet     First audit
                                      moons can be generated 
                                      beyond a conservative  
                                      Hill-stability region  

  SYS-004           Medium            Ejected/unstable       First audit
                                      planets are counted    
                                      rather than retained   
                                      as rogue-body records  

  SYS-005           Medium            Pairwise mutual-Hill   First audit
                                      spacing is not a       
                                      long-term multi-planet 
                                      stability guarantee    

  SYS-006           Medium            "Resonant"             First audit
                                      architecture is        
                                      inferred from near-2:1 
                                      spacing, not           
                                      demonstrated resonance 

  SYS-007           Medium            White-dwarf systems do First audit
                                      not account adequately 
                                      for mass-loss-driven   
                                      orbital expansion      

  SYS-008           Medium            Circumbinary moon Hill First audit
                                      calculation uses       
                                      primary mass instead   
                                      of total binary mass   

  SYS-009           Medium            Planet masses are      First audit
                                      sampled without a      
                                      shared disk mass       
                                      budget                 

  SYS-010           Medium            Metallicity response   First audit
                                      is applied too         
                                      uniformly across small 
                                      and giant planet       
                                      classes                

  P1                High              Planetary mass--radius Claude
                                      model needs a          
                                      rocky-planet relation  
                                      and domain-aware       
                                      composition treatment  

  P2                High              Envelope/composition   Claude
                                      treatment should be    
                                      probabilistic; orbit   
                                      populations should     
                                      account for host-star  
                                      properties             

  P5                Low               A planetary-physics    Claude
                                      comment needs          
                                      correction             

  BH2               Medium            Black-hole             Claude
                                      accretion-disc         
                                      temperature            
                                      normalization needs an 
                                      independent numerical  
                                      check                  
  ----------------------------------------------------------------------------

## 3.5 Scientific communication and coverage

  -----------------------------------------------------------------------------------
  ID                Severity          Finding                       Origin
  ----------------- ----------------- ----------------------------- -----------------
  L1                High              Life, minds and civilization  Claude
                                      outputs should be labelled    
                                      speculative/model-dependent   

  L2                High              Abiogenesis rate should be    Claude
                                      exposed as an explicit        
                                      assumption                    

  COV-001           Medium            Tests lack key                First audit
                                      population-level and          
                                      cross-system invariants       

  DOC-001           Medium            Physics-page statements about Claude
                                      IMF and runaway limit need to 
                                      match implementation          
  -----------------------------------------------------------------------------------

Severity is proposed for planning. Revalidate each item against the
current branch before implementation.

------------------------------------------------------------------------

# 4. Detailed findings and recommendations

## 4.1 Climate and numerical modelling

### C1 --- Runaway greenhouse and OLR limit

The climate model needs an explicit runaway-greenhouse treatment. In
simplified climate models, outgoing longwave radiation can approach a
limiting value as water vapour becomes a major atmospheric constituent.

Claude cites approximately 280 W/m². Treat this as a representative
model value, not a universal constant.

**Important distinction:** approximately 280 W/m² refers to a
representative outgoing-longwave-radiation limit, not a universal
absorbed-radiation threshold. The actual limit depends on atmospheric
composition, pressure, clouds, temperature profile, gravity and model
assumptions.

**Recommendations**

1.  Distinguish incoming stellar radiation, reflected radiation,
    absorbed flux and outgoing longwave radiation.
2.  Compare absorbed energy with the maximum sustainable OLR in the
    selected climate model.
3.  Represent runaway/steam outcomes explicitly rather than silently
    clipping them into a temperate state.
4.  Document the adopted OLR model and validity domain.
5.  Test below, near and above the chosen threshold.

### C2 --- Water-vapour feedback, steam atmospheres and high-CO₂ limits

Claude identifies temperature-dependent vapour feedback,
steam-atmosphere handling, surface-temperature limits and high-CO₂
greenhouse extrapolation as needing review.

**Recommendations**

-   Make water-vapour feedback temperature-dependent and consistent with
    saturation vapour pressure.
-   Distinguish temperate atmospheres from steam-dominated atmospheres.
-   Do not extrapolate a near-Earth greenhouse approximation to
    arbitrary pressure or insolation.
-   Add a maximum-CO₂ greenhouse treatment or an appropriate
    high-pressure model.
-   Distinguish a physical runaway transition from a numerical safety
    cap.

A hard temperature cap must not make an unstable climate appear stable.
If a numerical cap is reached, report runaway, unresolved or
out-of-domain status.

### C3 --- Numerical convergence

Claude proposes comparing identical initial conditions at 10 and 40
steps/Gyr and adding adaptive substeps around ice transitions.

**Recommendations**

-   Prefer at least three resolutions, for example 10, 20 and 40
    steps/Gyr, or an equivalent timestep-halving study.
-   Compare surface temperature, OLR, water inventory, ice coverage,
    atmospheric state and climate classification.
-   Add adaptive substeps around ice-albedo transitions and other sharp
    state changes.
-   Preserve deterministic reproducibility.

Classify results as:

-   **Converged:** outputs remain within established tolerances as
    timestep decreases.
-   **Attractor:** system approaches a stable state, possibly dependent
    on initial conditions.
-   **Unresolved:** outputs change materially with timestep or solver
    settings.
-   **Out of domain:** the physical approximation is not intended for
    those conditions.

A simulation stopping its evolution is not, by itself, evidence of
numerical convergence.

## 4.2 Stellar population and evolution

### S1 / GAL-001 --- Replace the top-heavy IMF

The first audit's approximate comparison over 0.1--100 solar masses:

  -----------------------------------------------------------------------
  Mass range           Current sampler estimate     Kroupa-like reference
                                                                 estimate
  ------------------- ------------------------- -------------------------
  Below 0.5 M☉                            26.7%                     72.9%

  Above 8 M☉                              10.2%                     0.71%

  Above 25 M☉                              2.8%                     0.14%
  -----------------------------------------------------------------------

Claude's probe reported similar results: M \> 8 M☉ = 10.1%, M \> 20 M☉ =
3.1%, M \< 1 M☉ = 60.4%, and M \< 0.5 M☉ = 26.8%.

The close agreement strengthens the finding. Exact expected fractions
depend on the chosen IMF and mass limits.

**Recommendations**

-   Implement a documented Kroupa- or Chabrier-like IMF.
-   Use correct inverse-CDF sampling and normalization.
-   Test large seeded samples statistically.
-   Version the IMF model and parameters.
-   Avoid arbitrary clamping or visual histogram tuning.

### S2 / GAL-002 --- Model formation time and star-formation history

The reviewed age assignment samples a star's age relative to its own
lifetime. For short-lived stars, this can create an artificial
evolutionary-stage distribution rather than a present-day population
resulting from a formation history.

**Recommendations**

Separate formation time, current age, initial mass, current mass,
metallicity, evolutionary state and remnant state.

Implement in stages:

1.  Constant star-formation history.
2.  Declining and burst histories.
3.  Galaxy-type-dependent histories.
4.  Metallicity evolution and more detailed tracks if justified.

Retain dead stars as aged remnants where appropriate.

### S3 --- Giant-star luminosity and radius

Claude reported maximum giant luminosity of (4.2 `\times 10`{=tex}\^9
L\_`\odot`{=tex}) and maximum giant radius of 670 AU. These values need
investigation for excessive multipliers, unit conversion errors,
classification mistakes or out-of-domain extrapolation.

**Recommendations**

-   Use mass- and evolutionary-stage-dependent relations or tracks.
-   Distinguish relevant giant/supergiant phases where needed.
-   Bound radius and luminosity by documented model domains.
-   Check Stefan--Boltzmann consistency.
-   Flag out-of-domain values rather than silently accepting them.

### S4 --- Piecewise main-sequence relations

A single (L `\propto `{=tex}M\^{3.5}) or (R `\propto `{=tex}M\^{0.8})
relation is not appropriate across all stellar masses.

Use piecewise relations with documented mass/metallicity domains, test
representative reference points, and avoid extrapolating one fit across
brown dwarfs, low-mass stars, Sun-like stars and massive stars.

### S5 --- White dwarfs and neutron stars

Use remnant-specific radii and temperatures. Check luminosity
consistency:

\[ L = 4`\pi `{=tex}R^2`\sigma `{=tex}T^4 \]

Add white-dwarf cooling and distinguish progenitor mass from current
remnant mass. The Stefan--Boltzmann relation is a consistency equation,
not a complete remnant model; radius and temperature need their own
physical prescription.

### GAL-003 --- Ignition-threshold endpoint clamping

Clarify whether `stellarIgnitionThreshold` is a minimum fusion mass,
population truncation, distribution-shape parameter or gameplay control.

If it changes the lower mass bound, re-normalize the truncated IMF. If
it is a classification threshold, use it for classification rather than
mass remapping.

### GAL-005 --- `gravityStrength` semantics

Choose whether this is a physical gravity parameter, galaxy-density
parameter or visual scale parameter. Rename it if needed. Ensure
comments, UI and implementation agree.

## 4.3 Galaxy morphology and companions

### GAL-004 --- Shared galaxy density model

Rendered morphology and generated stellar positions should trace a
shared density model.

Suggested components:

-   Spiral: disk, bulge, optional halo, spiral-arm modulation.
-   Elliptical: centrally concentrated radial profile.
-   Irregular: clumps plus diffuse component.
-   Dwarf: lower-mass density profile with optional irregularity.

Use the same underlying density model for rendering and star placement.

### G1 --- Independent x/z scatter

Check whether particle scatter introduces unintended axis correlations.
Use independent seeded draws where appropriate and test the resulting
distribution.

### B2 --- Brown-dwarf companions

Define clear mass-domain boundaries among giant planets, brown dwarfs
and hydrogen-burning stars. Preserve companion type and apply
appropriate luminosity, radius, temperature and age evolution. Test
classification boundaries and multiple systems.

## 4.4 Planetary systems and orbital mechanics

### SYS-001 --- Physical orbit versus rendered orbit

The first audit found physics using an effective orbit radius adjusted
by `gravityStrength`, while rendering uses raw `orbitalRadius`.

    `gravityStrength`   Effective physics radius / raw displayed radius
  ------------------- -------------------------------------------------
                 0.25                                            2.000×
                 1.00                                            1.000×
                 2.00                                            0.707×

Use one canonical physical semi-major axis. If visual spacing is
nonphysical, derive a separate renderer-only value. Orbital period,
irradiation, temperature, habitability and report-card values should
trace to the canonical physical orbit.

### SYS-002 --- Circumbinary orbital period

For a distant P-type orbit, the first-order Keplerian central mass is
(M_1+M_2). Using one component for an equal-mass binary overestimates
the period by (`\sqrt{2}`{=tex}), about 41.4%.

Centralize the effective central-mass calculation and use it
consistently.

### SYS-003 --- Moon Hill stability

Approximate Hill radius:

\[ R_H = a_p`\left`{=tex}(`\frac{m_p}{3M_*}`{=tex}`\right`{=tex})\^{1/3}
\]

A moon's stable prograde region is smaller than the full Hill radius.
The first audit used approximately 0.5 (R_H) as an illustrative
conservative envelope, not a universal constant.

For an Earth-mass planet at 0.1 AU around a Sun-like star, the audit
estimated a Hill radius of about 23.5 Earth radii and a half-Hill
envelope of about 11.8 Earth radii. Generated moons at 30--60 planetary
radii would exceed that illustrative envelope.

Apply documented inner Roche-related and outer Hill-stability
constraints, account for eccentricity, and use the correct central mass.

### SYS-004 --- Retain rogue planets

Preserve ejected planets as explicit records with stable IDs, mass,
composition, provenance, ejection reason/epoch and thermal state. Do not
reduce them to counts only.

### SYS-005 --- Multi-planet stability

Keep the (2`\sqrt{3}`{=tex}) mutual-Hill criterion as a first-pass
filter for its idealized assumptions. It is not proof of long-term
stability for arbitrary multi-planet systems. Add a second-tier risk
score or selected N-body integrations.

### SYS-006 --- Resonance labels

A semi-major-axis ratio around 1.5--1.7 does not prove mean-motion
resonance. Until resonant-angle libration is evaluated, use labels such
as `near_2_to_1_spacing` or `near_resonant_architecture`.

### SYS-007 --- White-dwarf orbital expansion

For slow, approximately isotropic, adiabatic mass loss, a first-order
approximation is:

\[ a_f `\approx `{=tex}a_i`\frac{M_i}{M_f}`{=tex} \]

Preserve initial and current orbits, progenitor mass, remnant mass and
survival/engulfment state.

### SYS-008 --- Circumbinary moon Hill limit

For an equal-mass binary, using one component instead of total mass can
overestimate the Hill radius by (2\^{1/3}), approximately 26%. Reuse the
same central-mass abstraction as the circumbinary period calculation.

### SYS-009 --- Disk mass budget

The first audit noted that eight planets of 4,000 Earth masses each
total approximately 0.096 solar masses, close to a 0.1-solar-mass host.

Sample a disk budget relative to host mass, allocate solids and gas, and
constrain generated planet masses. Flag systems outside the simplified
model's valid regime.

### SYS-010 --- Metallicity response

Separate planet occurrence probability, solid/core mass, gas-envelope
acquisition and giant-planet formation probability. Avoid applying one
identical metallicity multiplier to small and giant planets.

### P1 --- Planet mass--radius relations

Use a rocky-planet relation within its valid domain. Do not use one
generic relation for all planet classes.

### P2 --- Envelopes and host-star-aware orbital populations

A radius around 1.6--2 Earth radii is a useful population-level
transition region, not an absolute boundary. Use mass, radius, density,
composition and formation assumptions to classify envelopes
probabilistically.

Orbit-scaling relationships must not be conflated:

-   For fixed orbital period, (a `\propto `{=tex}M\^{1/3}).
-   For a simplified habitable-zone distance, (a\_{`\mathrm{HZ}`{=tex}}
    `\propto `{=tex}`\sqrt{L}`{=tex}).

Do not apply one generic stellar-mass multiplier to all orbital
populations.

### P5 --- Physics comment

Reconfirm the exact source location and correct the comment to match the
actual formula, units and assumptions. Do not alter executable behavior
merely to match an incorrect comment.

### BH2 --- Black-hole disc temperature normalization

Independently verify the Shakura--Sunyaev disc temperature profile,
constants, units, inner-boundary assumptions, radial dependence, and
mass/accretion-rate scaling. Add reference-value tests. Visual
plausibility is not numerical validation.

## 4.5 Scientific communication

### L1 --- Speculative life, minds and civilization

Label life, minds and civilization outputs as
speculative/model-dependent. Separate environmental habitability from
abiogenesis, complex life, intelligence and technological civilization.

### L2 --- Explicit abiogenesis assumptions

Expose abiogenesis rate as a named, documented assumption or scenario
parameter. Explain how it affects emergence probabilities. Do not
present generated civilization counts as predictions of the real
universe.

### DOC-001 --- Physics page

Update statements about the IMF, runaway greenhouse, climate validity
ranges, stellar evolution and speculative outcomes to match the
implemented model. Do not claim a model uses a particular IMF until the
implementation and tests support that claim.

------------------------------------------------------------------------

# 5. Claude's reported quantitative probes

These results were supplied by Claude and should be reproduced on
`galaxy-planet-validation` before being treated as final measurements.

## 5.1 Stellar population

Reported classification shares:

  Classification     Share
  ---------------- -------
  Main sequence      90.6%
  Giants              4.8%
  Protostars          2.2%
  White dwarfs        1.9%
  Neutron stars      0.37%
  Black holes        0.18%

Reported mass shares:

  Threshold       Share
  ------------- -------
  M \> 8 M☉       10.1%
  M \> 20 M☉       3.1%
  M \< 1 M☉       60.4%
  M \< 0.5 M☉     26.8%

Reported maximum giant luminosity: (4.2 `\times 10`{=tex}\^9
L\_`\odot`{=tex}).\
Reported maximum giant radius: 670 AU.

## 5.2 Earth-twin climate sweep

Claude supplied a probe using a Sun-like star, Earth-like planet, water
inventory and axial tilt, but the summary did not include the exact
output values.

Reproduce and record absorbed flux, OLR, surface temperature, vapour
abundance, liquid-water fraction, ice coverage, climate classification
and timestep sensitivity.

## 5.3 Step-size convergence

Claude proposed changing `STEPS_PER_GYR` from 10 to 40 in a scratch copy
of `worldHistory.ts`. Extend this to three or more resolutions and
compare multiple climate outputs.

## 5.4 Planetary-system probe

For the first 250 main-sequence stars of seed 42, Claude reported:

  Metric                                     Reported result
  ---------------------------------------- -----------------
  Mean planets per star                                 3.95
  Giant-planet share                                   20.9%
  Hot Jupiters                                             0
  Solid planets above 2.04 M⊕                          30.3%
  Solid planets below 3 g/cm³                            261
  Solids with life                                     39.6%
  Ever-wet worlds with life                            80.5%
  Lava worlds                                            197
  Maximum lava-world surface temperature             8,007 K

Investigate the life fractions, low-density solid classifications and
extreme lava-world temperatures. Do not assume an unusual result is
wrong without tracing the model and its intended domain.

## 5.5 Existing tests

Claude reported 60 test files and 665 passing tests at the audited
commit. This is encouraging, but the reported suite did not catch the
findings above. Add scientific validation without discarding existing
tests.

------------------------------------------------------------------------

# 6. Established, approximate, speculative and illustrative components

  -------------------------------------------------------------------------------
  Category                Examples                  Communication rule
  ----------------------- ------------------------- -----------------------------
  Established equations   Kepler's laws, gravity,   State equations and
                          escape velocity, Hill     assumptions; validate units
                          radius,                   and domain
                          Clausius--Clapeyron,      
                          equilibrium temperature,  
                          Stefan--Boltzmann,        
                          transit-depth formalism   

  Established frameworks  Holman--Wiegert limits,   State approximation and
  with approximations     Gladman criterion, XUV    validity range
                          activity, cosmic          
                          shoreline,                
                          carbon--silicate          
                          weathering, tidal heating 

  Empirical population    IMF, mass--luminosity,    Name reference model and
  relations               mass--radius, metallicity calibration domain
                          trends, planet occurrence 

  Potentially             Generic (L=M\^{3.5}),     Flag for correction or
  out-of-domain           (R=M\^{0.8}), giant ×500  explicit bounds
  approximations          luminosity, remnant       
                          luminosity/temperature,   
                          high-pressure greenhouse  
                          extrapolation,            
                          inappropriate             
                          solid-planet radii        

  Speculative by design   Abiogenesis, evolution    Label
                          engine, minds,            speculative/model-dependent
                          civilizations, Great      
                          Filter gates, tilt        
                          wander, catastrophe       
                          probabilities             

  Illustrative only       Galaxy particle           Do not present as direct
                          morphology, star-colour   physical prediction
                          fit, pair colour          
  -------------------------------------------------------------------------------

An equation can be implemented correctly while being applied outside its
valid domain. Kepler's law can be correct while the supplied central
mass is wrong. The Physics page should distinguish equation correctness
from application assumptions.

------------------------------------------------------------------------

# 7. Unified implementation roadmap

## P0 --- Foundational correctness

-   C1: OLR/runaway greenhouse treatment.
-   C2: Vapour feedback, steam states and high-pressure climate bounds.
-   C3: Timestep convergence and adaptive substeps.
-   S1/GAL-001: IMF.
-   S2/GAL-002: Formation times and galaxy-type SFH.
-   GAL-003: Endpoint clamping.
-   S3: Giant-star luminosity/radius.
-   S4: Piecewise main-sequence relations.
-   S5: Remnant models and white-dwarf cooling.

**Exit criteria:** climate states are physically classified; numerical
convergence is measured; IMF/SFH tests pass; giant/remnant properties
are within documented model domains.

## P1 --- Planet structure and orbit consistency

-   SYS-001: Canonical physical orbit and renderer conversion.
-   SYS-002: Circumbinary total mass.
-   SYS-003/SYS-008: Moon Hill stability and binary central mass.
-   P1/P2: Domain-aware planet structure and envelope probability.
-   SYS-007: White-dwarf orbital response.
-   SYS-009: Disk mass budget.

**Exit criteria:** renderer and physics agree; binary calculations use
total mass; moons respect stability bounds; planetary structure is
domain-aware.

## P2 --- Population and system architecture

-   GAL-004: Shared galaxy density model.
-   G1: Independent particle scatter.
-   B2: Brown-dwarf companions.
-   SYS-004: Rogue records.
-   SYS-005: Multi-planet stability tier.
-   SYS-006: Resonance semantics.
-   SYS-010: Metallicity response.
-   GAL-005: Clarify `gravityStrength`.
-   BH2: Disc temperature normalization.
-   P5: Correct comment.

## P3 --- Scientific validation

-   Population statistics.
-   Climate convergence.
-   Analytical spot checks.
-   Cross-module orbit/irradiation/report-card consistency.
-   Hill-stability properties.
-   Disk-budget properties.
-   Planet mass--radius calibration.
-   Remnant luminosity consistency.
-   Black-hole disc normalization.
-   Shader compile/link and representative rendering checks.

## P4 --- Scientific communication

-   Speculative labels for life, minds and civilizations.
-   Explicit abiogenesis assumptions.
-   Physics-page updates.
-   Model validity domains and versioned assumptions.

------------------------------------------------------------------------

# 8. Test and validation matrix

  ------------------------------------------------------------------------------------------------------------------
  Area                    Suggested test                                             Required invariant
  ----------------------- ---------------------------------------------------------- -------------------------------
  IMF                     `stellarMassSampler.matchesReferenceIMFWithinTolerance`    Mass-bin fractions within
                                                                                     statistical tolerance

  IMF                     `stellarMassSampler.respectsMassBounds`                    No values outside bounds

  IMF                     `stellarMassSampler.hasNoEndpointPileup`                   No unintended clamped spike

  SFH                     `stellarAge.neverExceedsCurrentEpoch`                      Age is bounded

  SFH                     `stellarPhase.derivesFromAgeAndLifetime`                   Phase follows model

  Giant stars             `giantStar.propertiesWithinClassDomain`                    Luminosity/radius/temperature
                                                                                     bounded

  Main sequence           `mainSequenceRelations.matchReferencePoints`               Piecewise fits match reference
                                                                                     points

  Remnants                `whiteDwarf.luminosityMatchesRadiusTemperature`            Stefan--Boltzmann consistency

  Remnants                `whiteDwarf.coolingWithAge`                                Cooling trend follows model

  Climate                 `climate.runawayCriterionIsApplied`                        No false stable state beyond
                                                                                     criterion

  Climate                 `climate.steamAtmosphereIsDistinctState`                   Steam state is not silently
                                                                                     clipped

  Climate                 `climate.highPressureDomainIsBounded`                      No unsupported extrapolation

  Convergence             `worldHistory.resultsConvergeWithSmallerSteps`             Outputs within tolerance

  Convergence             `worldHistory.adaptiveStepsAreDeterministic`               Same seed/input reproduces
                                                                                     result

  Orbit                   `orbitRenderer.usesCanonicalPhysicalOrbit`                 Explicit display conversion

  Binary                  `orbitalPeriod.circumbinaryUsesTotalMass`                  P-type central mass is M1 + M2

  Moon                    `moonOrbit.respectsConservativeHillLimit`                  Regular moons within configured
                                                                                     envelope

  Planet structure        `planetRadius.matchesCompositionModel`                     Radius follows selected
                                                                                     composition model

  Planet structure        `planetEnvelope.classificationIsProbabilistic`             No radius-only absolute
                                                                                     classification

  Rogue                   `ejectedPlanet.retainsBodyRecord`                          Ejected body remains
                                                                                     inspectable

  Stability               `planetarySystem.flagsMultiPlanetRisk`                     Pairwise filter not treated as
                                                                                     guarantee

  Resonance               `architecture.nearTwoToOneIsNotConfirmedResonance`         Spacing alone does not prove
                                                                                     resonance

  White dwarf             `whiteDwarf.survivingOrbitExpandsAfterMassLoss`            Mass-loss approximation applied

  Disk                    `planetarySystem.respectsDiskMassBudget`                   Total planet mass within budget

  Metallicity             `planetPopulation.usesClassSpecificResponse`               Class-specific response

  Galaxy                  `galaxy.starPositionsTraceRenderedDensity`                 Generated stars trace
                                                                                     morphology

  Black hole              `accretionDisk.temperatureNormalizationMatchesReference`   Independent normalization
                                                                                     agrees

  Labels                  `civilizationOutput.isMarkedSpeculative`                   UI does not imply certainty
  ------------------------------------------------------------------------------------------------------------------

### Statistical testing guidance

-   Use fixed seeds.
-   Generate sufficiently large samples.
-   Compare against a chosen reference CDF or bin expectations.
-   Set tolerances using expected sampling error.
-   Report observed and expected values on failure.
-   Avoid brittle assertions against one random sample.
-   Version reference models and parameters.

### Convergence guidance

Compare surface temperature, OLR, absorbed flux, water inventory, ice
coverage, atmospheric state and climate classification. A numerically
converged result can still be scientifically uncertain.

------------------------------------------------------------------------

# 9. Recommended data and architecture contracts

## Stellar record

Preserve initial mass, current mass, formation time, current age,
metallicity, evolutionary state, remnant type and model version.

## Climate result

Expose absorbed flux, OLR, greenhouse state, water-vapour state, surface
temperature, ice/water state, runaway/steam classification, convergence
status and model-domain status.

## Orbital record

Use canonical physical semi-major axis, eccentricity, inclination,
period, host-system identity, orbit type and effective central mass.
Keep renderer-only radii separate.

## Binary record

Expose primary mass, secondary mass, total mass, separation,
eccentricity, barycenter and P-type/S-type context through a shared
abstraction.

## Planet/moon record

Preserve mass, radius, density, composition assumptions, envelope
state/probability, formation channel, Roche/Hill constraints and
stability classification.

## Speculative outcome record

Carry explicit speculative status, abiogenesis/emergence assumptions,
environmental prerequisites, seed/model version and scenario/uncertainty
label.

------------------------------------------------------------------------

# 10. Instructions for Claude

Claude should treat this document as an audit and planning
specification, not as permission to rewrite the simulation in one pass.

## Phase 0 --- Reconfirm

1.  Check out `galaxy-planet-validation`.
2.  Confirm HEAD and compare it with the recorded baseline.
3.  Re-open every finding in current source.
4.  Re-run Claude's probes and record exact outputs.
5.  Confirm the reported 60-file / 665-test result.
6.  Map findings to files and tests.
7.  Identify dependencies and propose an implementation plan before
    editing.

## Phase 1 --- Climate and stellar foundations

1.  Inspect climate model assumptions and valid domains.
2.  Implement OLR/runaway treatment.
3.  Separate steam/runaway states from stable temperate states.
4.  Bound high-pressure/CO₂ behaviour.
5.  Add timestep convergence probes.
6.  Implement selected IMF.
7.  Implement formation-time/SFH sampling.
8.  Correct giant and main-sequence relations.
9.  Add remnant models and white-dwarf cooling.
10. Add population-level tests.

## Phase 2 --- Planetary structure and orbital correctness

1.  Define canonical physical orbital elements.
2.  Fix renderer conversion.
3.  Correct circumbinary total-mass calculations.
4.  Correct moon Hill-stability checks.
5.  Add domain-aware mass--radius relations.
6.  Add probabilistic envelope classification.
7.  Add host-star-aware orbit population rules.
8.  Add disk mass budget.
9.  Add white-dwarf orbital expansion.

## Phase 3 --- Population and system improvements

Implement shared galaxy density, particle scatter, brown-dwarf
companions, rogue records, multi-planet stability, resonance semantics,
metallicity response and black-hole disc normalization.

## Phase 4 --- Scientific communication

Label speculative outcomes, expose abiogenesis assumptions, update
Physics page and document model validity domains.

## Phase 5 --- Validation and reporting

From `frontend/`, run the reproducible project commands:

``` bash
npm ci
npm test
npm run build
npm run lint
```

For shaders, inventory source files, identify GLSL/WebGL targets, run a
compatible validator, test actual WebGL compile/link, and exercise
representative galaxy/star/planet/black-hole rendering paths. A
TypeScript build does not prove runtime GLSL compiles.

For every finding report status, files changed, tests added, commands
executed, pass/fail output and remaining limitations. Do not mark a
finding fixed merely because code was edited.

------------------------------------------------------------------------

# 11. Scope guardrails

The initial validation request excluded APK and database checks. Unless
separately authorized, keep the work limited to frontend tests,
TypeScript/Vite build, lint, shader validation, simulation tests and
static review.

Do not perform Android APK builds, device installation, database
inspection/migration/seeding/mutation, production service calls,
external integrations or unrelated deployment activity.

------------------------------------------------------------------------

# 12. Scientific references and reading list

References supplied or implied by the assessments; verify exact
assumptions and applicability before implementation:

-   Chabrier 2003, PASP 115, 763 --- IMF.
-   Chen & Kipping 2017, ApJ 834, 17 --- Planet mass--radius.
-   Duchêne & Kraus 2013, ARA&A 51, 269 --- Stellar multiplicity.
-   Eker et al. 2015, AJ 149, 131 --- Main-sequence mass--luminosity.
-   Fulton et al. 2017, AJ 154, 109 --- Exoplanet radius distribution.
-   Gladman 1993, Icarus 106, 247 --- Mutual-Hill stability.
-   Goldblatt et al. 2013, Nature Geoscience 6, 661 --- Runaway
    greenhouse/radiation limits.
-   Gough 1981, Solar Physics 74, 21 --- Solar luminosity evolution.
-   Hamano et al. 2013, Nature 497, 607 --- Magma ocean and steam
    atmospheres.
-   Holman & Wiegert 1999, AJ 117, 621 --- Binary planetary stability.
-   Humphreys & Davidson 1979, ApJ 232, 409 --- Massive
    stars/supergiants.
-   Hurley et al. 2000, MNRAS 315, 543 --- Stellar evolution
    prescriptions.
-   Kasting et al. 1993, Icarus 101, 108 --- Habitable zones.
-   Kopparapu et al. 2013, ApJ 765, 131 --- Habitable-zone limits.
-   Kroupa 2001, MNRAS 322, 231 --- IMF.
-   Leconte et al. 2013, Nature 504, 268 --- Climate/runaway greenhouse.
-   Levesque et al. 2005, ApJ 628, 973 --- Red supergiants.
-   Meadows et al. 2018, Astrobiology 18, 630 --- Biosignatures.
-   Peale et al. 1979, Science 203, 892 --- Tidal heating.
-   Pierrehumbert 2010, *Principles of Planetary Climate*.
-   Raghavan et al. 2010, ApJS 190, 1 --- Solar-type multiplicity.
-   Ribas et al. 2005, ApJ 622, 680 --- Stellar activity evolution.
-   Sana et al. 2012, Science 337, 444 --- Massive-star multiplicity.
-   Shakura & Sunyaev 1973, A&A 24, 337 --- Accretion-disc model.
-   Spiegel & Turner 2012, PNAS 109, 395 --- Abiogenesis-rate framing.
-   Walker et al. 1981, JGR 86, 9776 --- Carbon--silicate weathering.
-   West et al. 2008, AJ 135, 785 --- Stellar activity.
-   Wright et al. 2011, ApJ 743, 48 --- Stellar activity and rotation.
-   Zahnle & Catling 2017, ApJ 843, 122 --- Atmospheric escape.
-   Zeng et al. 2016, ApJ 819, 127 --- Planet mass--radius/composition.

This is a reading list, not a claim that every paper was independently
re-opened during this audit. The implementation should identify the
exact reference model used.

------------------------------------------------------------------------

# 13. Final recommendations

If development capacity is limited, prioritize:

1.  Climate runaway and validity limits.
2.  Numerical convergence.
3.  IMF and star-formation history.
4.  Giant-star and remnant evolution.
5.  Canonical orbital model and binary total-mass corrections.
6.  Planet structure, envelopes and moon stability.
7.  Galaxy morphology, disk budgets, metallicity, rogue bodies and
    system stability.
8.  Scientific labels and documentation.

The subsystems are connected. Climate depends on stellar luminosity and
orbital distance. Habitability depends on climate and atmospheric
evolution. Life and civilization depend on habitability plus explicit
speculative assumptions. An upstream defect can multiply into a
misleading discovery catalogue.

Aion Forge will become more compelling not merely by generating more
extraordinary objects, but by making each object explainable: why it
formed, which assumptions govern it, how stable it is, what is known
about its climate, and which conclusions remain speculative.

------------------------------------------------------------------------

# Appendix A --- Probe descriptions supplied by Claude

These snippets are reproduction guides, not guaranteed drop-in code.
Confirm current signatures and required fields.

## A1. Stellar population

``` ts
const g = galaxy.buildGalaxyConfig(seed, config.makeConfig(seed));
const pop = star.generateStarsFor(g);
```

Claude listed seeds `42`, `7777`, `100000`, `1`, `2`, `3`. Count
classification shares, mass shares, giant luminosity and stellar radius.

## A2. Earth-twin climate sweep

Claude supplied this outline:

``` ts
const cfg = config.makeConfig(4242, { emergenceSensitivity: 0 });
const planet = {
  id: 0,
  key: '1-0',
  hostStarId: 1,
  orbitalRadius: a,
  mass: 1,
  size: 1,
  formationAtmosphere: 'moderate',
  atmosphere: 'moderate',
  moons: [],
  /* other fields default */
};

const phys = planetPhysics.derivePhysics(planet, sun, 4242, cfg);
phys.waterInventory = 0.08;
phys.axialTiltDeg = 23.4;

const h = worldHistory.runWorldHistory(
  planet,
  phys,
  geography.buildGeography(planet, phys, 4242),
  sun,
  4242,
  cfg
);
```

Supplied Sun-like star:

``` ts
const sun = {
  mass: 1,
  age: 4.6,
  lifespan: 10,
  temperature: 5772,
  luminosity: 1,
  evolutionaryStage: 'main-sequence',
  metallicity: 0
};
```

Confirm actual types before using.

## A3. Step-size convergence

Claude proposed changing `STEPS_PER_GYR` from 10 to 40 in a scratch copy
of `worldHistory.ts`. Prefer three or more resolutions and compare
multiple outputs.

## A4. Planetary systems

Claude proposed:

``` ts
planet.generatePlanetsFor(s, 42, cfg)
```

for the first 250 main-sequence stars of seed 42. Reported outputs are
in Section 5.4.

## A5. Physics spot checks

-   `interiorHeat.tidalHeatFlow` for Io, Europa and Enceladus using real
    orbital elements.
-   `binary.sTypeLimitAU` for Alpha Centauri.
-   `binary.pTypeLimitAU` for Kepler-16.
-   `metallicity.gasMetallicity` gradient.
-   Independent Shakura--Sunyaev (T\_{`\max`{=tex}}).
-   `atmosphericEscape.airRetained` for ten Solar System bodies.
-   `climate.boilingPointK` at seven pressures.

Record exact inputs, units, expected references and observed outputs.

------------------------------------------------------------------------

# Appendix B --- Audit status vocabulary

-   **Confirmed:** Current code and tests demonstrate the finding.
-   **Fixed + tested:** Implementation changed and relevant tests pass.
-   **Fixed, validation pending:** Code changed but validation has not
    run.
-   **Partially addressed:** Some cases are fixed; gaps remain.
-   **Deferred:** Accepted as a known limitation for later.
-   **Not applicable:** Current implementation or intended model makes
    the finding irrelevant; explain why.
-   **Reopened:** A later change reintroduced the behavior.

This vocabulary keeps implementation progress separate from validated
correctness.

---

# 13. Independent critique update — 31 October 2026

This section incorporates Claude's subsequent review of the original ChatGPT audit pack and its source-level rechecks. It is an addendum to the earlier consolidated audit, not a claim that this ChatGPT session independently reran Claude's probes or reopened the repository. The source branch and commit references below are those stated in the supplied assessment.

## 13.1 Review outcome and corrections

Claude's overall assessment was that the audit pack was largely accurate and useful, while identifying one false positive, several over-rated severities, and important scientific issues that the original source audit had not examined deeply enough.

- **AF-015 is withdrawn.** The claim that a no-op `PATCH` necessarily returns 404 because `affectedRows` is zero is incorrect for the stated `mysql2` configuration: its default `FOUND_ROWS` behavior means a matched row can count as affected even when the values do not change. Do not implement a fix for AF-015; remove it from any derivative issue list.
- **SYS-001 severity is Medium, not High.** Physics uses `effectiveOrbitAU`, while the renderer uses raw `orbitalRadius`; at the default `gravityStrength = 1` they agree. The discrepancy appears when the gravity slider changes.
- **AF-001 is Medium, not High.** A crashed worker can leave a survey hanging because the worker abstraction has no `onerror`, timeout, or replacement path.
- **GAL-004, SYS-005, SYS-009, SYS-010, SCI-005, SCI-006, and the documented reduced-order climate/stellar limitations should generally remain scope/documentation items rather than being promoted automatically to implementation blockers.**
- Claude independently recomputed the principal numerical checks in the original audit: the IMF fractions, the stellar-threshold pile-up, the `sqrt(gravityStrength)` orbit factor, the equal-mass binary period discrepancy, the Earth Hill-radius example, and the black-hole disc temperature discrepancy.

## 13.2 Black-hole ray and emission-frame findings

Claude's follow-up review identified two issues that should be treated as substantive scientific corrections rather than merely visual tuning.

### BH-001 — Camera ray initial direction is not expressed in the local observer frame

In `frontend/src/shaders/blackHole.frag.glsl` around line 298, the ray setup uses `vel = dir`. The subsequent Binet-style path integration may be correct for the chosen orbit equation, but the initial angle is treated as a flat-coordinate Euclidean direction. For a static observer in Schwarzschild spacetime, the local angle and coordinate angle are related by:

\[
\tan\alpha = \frac{\tan\psi}{\sqrt{1-1/r}}
\]

Claude reports a shadow-size discrepancy of approximately 1.5% at the default 34 Schwarzschild radii and approximately 9.5% at the closest 6-radii view. The exact correction depends on the intended observer frame (static, freely falling, or orbiting); define that frame before changing the mapping.

### BH-002 — Doppler projection uses a coordinate-space direction

Around line 333, the shader calls `shiftFactor(p, rp, -normalize(nextVel))`. Claude's assessment is that this direction is not transformed into the local gas/emitter frame. The local radial direction is stretched by the Schwarzschild factor, while the along-orbit photon projection is exact in the simplified case. Claude estimates mixed-direction projection errors near `r = 3` can reach roughly 18%. Treat this as a frame-consistency issue and validate with a CPU reference implementation before adjusting shader output.

### BH-003 — Accretion-disc peak temperature calibration

`blackHole.ts` around line 65 uses a peak-temperature calibration of `5e5 K` for a `10^8 M☉` black hole. Claude and the earlier audit independently estimate a physically representative value closer to `1.4–1.6e5 K`, making the current value approximately 3.1–3.6 times too high. Recheck the assumptions (accretion rate, efficiency, inner-disc radius, and mass scaling) before changing the constant.

### BH-004 — Ray-tracer numerical test coverage

There is no numerical test of the shader ray tracer. A CPU port of the integration and frame conversions can provide deterministic tests without requiring a GPU or running shader compilation on a constrained machine.

The Newtonian Shakura–Sunyaev disc model is a deliberate approximation rather than a full Novikov–Thorne relativistic disc. Documenting this hybrid model is reasonable; do not represent it as a fully relativistic emission solution.

## 13.3 Consolidated engineering findings

The following engineering findings were reported by Claude's source review. They supplement the scientific and simulation findings in the earlier sections.

| ID | Finding | Suggested severity | Suggested response |
|---|---|---:|---|
| AF-001 | A crashed survey worker can leave a survey pending; `ChunkWorkerLike` lacks an error, timeout, and replacement path. | Medium | Add worker error handling, bounded timeout/failure reporting, and a controlled replacement or job failure path. |
| AF-002 | No explicit worker cap; `surveyPool.ts` can create up to seven workers on an eight-core device. | Low | Cap concurrency with a conservative device-aware limit. |
| AF-003 | Superseded surveys continue running and can queue behind older work. | Low–Medium | Cancel or invalidate obsolete work and prioritize the newest request. |
| AF-004 | `importLocalData.ts` accesses `localStorage` without guarding unavailable/throwing storage. | Low | Guard access and surface a recoverable import error. |
| AF-005 | Backend routes lack test coverage. | Low–Medium | Add focused route/API tests with external dependencies stubbed. |
| AF-006 | Startup schema writes are deliberate for the local application model. | Informational | Document the intended local-app behavior; no change solely from this observation. |
| AF-007 | Fourteen tracked files are under `frontend/.vite/`; ignore rules do not exclude them. | Low | Remove generated cache files from version control and add ignore rules. |
| AF-008 | README's v10 heading is a historical milestone while current simulation rules are v18. | Low | Label historical milestones clearly and point readers to the current rules version. |
| AF-009 | No `.github/` workflow/CI configuration exists. | Low–Medium | Add a minimal CI workflow for typecheck, lint, and Vitest. |
| AF-011 | Half-float render-target fallback is absent. | Low | Decide the supported-device envelope; add a fallback only if broad device compatibility is a requirement. |
| AF-016 | RNG seed is reduced with `seed >>> 0`, while UI/API accept wider values; seeds separated by `2^32` alias. | Low–Medium | Validate seeds consistently as unsigned 32-bit integers, or deliberately redesign the RNG seed width with compatibility/versioning. |
| AF-017 | Exported seed `0` cannot be imported because `persistence.ts` checks `!parsed.meta?.seed`. | Low | Check for missing/null seed rather than truthiness; add a seed-zero round-trip test. |
| AF-018 | Android plugins are not tested. | Low | Add device/plugin smoke tests where those integrations are in the supported product scope. |

AF-010 was identified as duplicative of the black-hole ray-tracer test gap and should not be tracked as a separate issue. AF-015 is withdrawn as described above.

## 13.4 Reconfirmed galaxy and planetary-system findings

Claude's source review confirmed the following points and clarified their scope:

- **GAL-001 — IMF sampler:** the sampler yields approximately 26.7% of stars below `0.5 M☉` and 10.2% above `8 M☉`, versus approximately 72.9% and 0.71% respectively for the cited Kroupa-like comparison over the stated mass interval. The code comment describing the sampler as heavily weighted toward low-mass stars contradicts its actual distribution. High priority.
- **GAL-002 — Stellar ages:** `age = rng() * min(lifespan, universeAgeBY)` samples age relative to each star's own lifetime, rather than sampling formation times from a galaxy star-formation history. High priority.
- **GAL-003 — Ignition threshold:** `min(0.9999, rng()/threshold)` creates a pile-up near the upper mass clamp when the threshold is below one; at `threshold = 0.5`, about half of draws reach that clamp. Medium priority; off-default but a real parameter-edge defect.
- **GAL-004 — Galaxy morphology:** the morphology is an illustrative approximation and is already presented as such. Keep its limitations documented unless the product scope requires higher-fidelity density profiles.
- **GAL-005 — Gravity documentation:** `gravityStrength` descriptions are inconsistent. `config.ts` describes effects on galaxy shape/density and stellar mass distribution, while the reviewed consumer is `effectiveOrbitAU`; the physics catalogue also says orbital periods do not read it even though `planetPhysics.ts` derives periods from `effectiveOrbitAU`. Correct both descriptions to match actual behavior.
- **SYS-001 — Render/physics orbit mismatch:** confirmed, but the default setting is internally aligned; the discrepancy is exposed by changing gravity strength.
- **SYS-002 — Circumbinary period:** `planetPhysics.ts` uses `star.mass` for all planets, even circumbinary planets. The period should use the total binary mass. `rogues.ts` already uses pair mass, demonstrating an internal inconsistency. High priority.
- **SYS-003 — Large rocky-planet moons:** the 30–60-planet-radius large-moon draw is not checked against the planet's Hill stability region. This can produce unbound or unstable moons for close-in planets. Medium–High priority.
- **SYS-004 — Ejected planets:** unstable/ejected planets are reduced to counts rather than retained as rogue-body records. The rogue type exists but is not emitted by this path. Low–Medium, depending on whether rogue planets are a promised feature.
- **SYS-005 — Multi-planet stability:** a pairwise mutual-Hill spacing filter is not a guarantee of long-term stability. It is acceptable as a first-pass architecture filter if described accurately.
- **SYS-006 — Resonance label:** a semimajor-axis ratio around 1.5–1.7 is a near-2:1 spacing heuristic, not proof of a dynamical resonance. Rename the label or implement resonant-angle/libration checks.
- **SYS-007 — White-dwarf systems:** remnant systems retain progenitor mass and raw orbital distances; `Star.mass` represents birth mass. Include remnant mass and mass-loss-driven orbital response if post-main-sequence planetary systems are in scope.
- **SYS-008 — Circumbinary moon Hill limit:** the moon Hill-limit calculation uses primary-star mass instead of total binary mass. Correct alongside SYS-002.
- **SYS-009 — Disk mass budget:** no protoplanetary disk mass budget is enforced. This is a scope/model limitation; for example, eight planets of `4000 M⊕` total about `0.096 M☉`, already comparable to a `0.1 M☉` host. Add a budget only if formation consistency is a target.
- **SYS-010 — Metallicity:** one multiplier is applied to small- and giant-planet masses, whereas metallicity's strongest observed effect is on giant-planet occurrence. Treat as a model simplification unless the population model is being calibrated.
- **COV-001 — Population tests:** local physical tests do not replace population-level distribution and cross-system invariant tests. Add tests for IMF/age distributions, orbit rendering versus physics, circumbinary periods, moon Hill limits, and rogue-body retention.

## 13.5 Additional climate, composition, stellar, and life findings surfaced by Claude

These were highlighted as important omissions in the original ChatGPT source audit. They are claims from Claude's supplied source review and probes; they have not been independently rerun in this session.

- **C1 — Runaway-greenhouse threshold:** the climate model does not impose a runaway-greenhouse limit tied to incident stellar flux. Claude reports an inner habitable-zone edge near `0.5 AU` for the Sun-like example, rather than the cited conservative value around `0.97 AU`.
- **C2 — Unbounded greenhouse feedback:** greenhouse warming can continue without a physically motivated upper closure; Claude reports steam-world temperatures reaching approximately `8,000 K`. This is a critical numerical/physical safeguard issue.
- **C3 — Timestep sensitivity:** present-day climate outcomes depend materially on the simulation timestep beyond approximately `1.3 AU`; Claude reports the same ocean-world setup diverging between a snowball result at a 25 Myr step and a different outcome at a 100 Myr step. Treat timestep convergence as a release-blocking validation task for climate claims.
- **P1 — Sub-Neptune composition:** planets in the roughly `2–15 M⊕` range can receive solid surfaces, oceans, and life in cases where an envelope-rich sub-Neptune should not be treated as an Earth-like solid-surface world. Claude reports this affects about 30% of generated “solid” planets in its probe. Verify the composition/envelope classification before assigning surface climate or biosphere states.
- **P2 — Stellar-mass/orbit coupling:** orbital architectures reportedly do not adequately scale with stellar mass, reducing compact M-dwarf systems and hot-Jupiter-like outcomes. Coordinate this with SYS-003 and the orbital architecture model rather than applying an isolated visual adjustment.
- **S3 — Giant-star luminosity:** Claude reports every red giant receives a fixed `500×` main-sequence luminosity multiplier. Replace a single multiplier with a mass/age/evolutionary-state relation if stellar evolution fidelity is a goal.
- **L1 — Abiogenesis calibration:** the origin-of-life probability is anchored to Earth alone; Claude reports roughly 80% of worlds that ever have water develop life. This is a strong assumption, not an empirically established frequency. Separate “potentially habitable” from “life emerged” and expose the uncertainty/assumption.

The earlier audit's documented approximations remain relevant: the black-hole disc is Newtonian rather than a full relativistic disc; reduced-order climate, escape, stellar, and black-hole demographic models need clear scope statements; and visual approximations should not be described as fully predictive astrophysical models.

## 13.6 Revised implementation sequence

The following three-batch plan reflects Claude's recommendation, with a priority order that emphasizes scientific validity before engineering polish. It is a planning proposal, not authorization to modify source files.

### Batch A — Simulation-rule corrections (one coordinated rules-version change)

Treat changes that alter generated universes as one coordinated release. Preserve the current v18 baseline and seed outputs before changing anything; then bump `SIMULATION_RULES_VERSION` once for the combined v19 behavior.

1. Climate: implement a runaway-greenhouse/maximum-greenhouse safeguard and bounded temperature feedback; define physically meaningful failure/steam-world states.
2. Climate: run timestep-convergence tests across representative orbital distances, stellar types, and planetary compositions. Do not accept a climate rule solely because one seed looks plausible.
3. Stellar populations: correct the IMF sampler, sample formation times/ages from an explicit galaxy-type star-formation history, and remap the ignition-threshold parameter without endpoint pile-up.
4. Planetary architecture: use total binary mass for circumbinary periods and circumbinary moon Hill limits; cap large rocky-planet moons by stable Hill-region constraints.
5. Stellar remnants: define remnant masses and the orbital response to stellar mass loss for white-dwarf systems.
6. Planet composition: prevent envelope-rich sub-Neptunes from automatically receiving solid surfaces, oceans, or biospheres.
7. Reassess stellar-mass-dependent orbital architecture and giant-star luminosity relations as part of the same population calibration, not as disconnected visual tweaks.
8. Recalibrate abiogenesis as an explicit uncertain model parameter rather than an Earth-derived near-universal rule.

Before/after comparisons should include the same fixed seeds and population summaries. Regenerate the README seed table once, after the final v19 rules are frozen.

### Batch B — Rendering and black-hole numerical correctness (no simulation-rules bump if outputs remain unchanged)

1. Draw planetary orbits using the same effective radius used by the physics model, or remove the gravity-dependent physical conversion if it is not intended to alter orbit radius. The renderer and physics must share one definition.
2. Re-derive the black-hole disc temperature normalization from stated accretion assumptions.
3. Define the camera observer frame and transform initial ray directions consistently.
4. Define the emitter/gas local frame and transform Doppler projection directions consistently.
5. Build a CPU reference implementation for the ray integrator and frame conversions; test limiting cases and compare against known Schwarzschild behavior.
6. Validate final visuals on the target phone/device. Do not require a heavy GPU/shader run on a machine that is explicitly out of scope for that validation.

### Batch C — Engineering hygiene and reliability

1. Add worker error/timeout handling and safe survey failure/replacement behavior.
2. Cancel or invalidate superseded surveys and cap worker concurrency.
3. Guard browser storage access in local-data import.
4. Remove generated `frontend/.vite/` artifacts from tracking and add appropriate ignore rules.
5. Fix seed handling: accept seed zero on import and enforce a consistent `0..2^32-1` range across UI/API, unless a deliberate wider-seed migration is designed.
6. Add minimal CI for typecheck, lint, and Vitest; expand API route coverage with external calls fully faked.
7. Correct `gravityStrength` documentation and the physics catalogue's description of orbital-period dependencies.
8. Document historical README rules versions, device-support expectations, and deliberate local-app startup schema behavior.

## 13.7 Validation matrix for the revised audit

| Area | Required validation | Acceptance evidence |
|---|---|---|
| IMF | Large seeded population; compare mass-bin fractions to the chosen IMF. | Distribution report with sample size, seed, bin edges, and reference curve. |
| Stellar ages/SFH | Compare age and evolutionary-stage distributions by galaxy type. | Distribution tests and documented SFH assumptions. |
| Ignition threshold | Sweep supported threshold range, especially values below 1. | No artificial endpoint pile-up; monotonic, documented parameter behavior. |
| Climate runaway | Sweep incident flux and greenhouse composition. | No unbounded temperatures; transitions to explicit runaway/steam state. |
| Climate convergence | Repeat identical initial conditions at multiple timesteps. | Outcomes converge within stated tolerances or timestep limits are enforced. |
| Planet composition | Sample mass/radius/envelope combinations. | Sub-Neptune envelope worlds do not receive unsupported solid-surface states. |
| Circumbinary dynamics | Compare period and moon Hill calculations against total binary mass. | Analytical benchmark tests, including equal-mass binaries. |
| Moon stability | Sweep planet mass, stellar mass, and orbital distance. | Generated moon orbits remain within chosen conservative stability limits. |
| White-dwarf systems | Evolve progenitor through mass loss. | Remnant mass and orbit expansion follow stated approximation. |
| Orbit rendering | Compare displayed semimajor axis with physics semimajor axis across gravity settings. | No unexplained divergence at any supported slider value. |
| Black-hole camera/Doppler | CPU reference cases for observer/emitter frames and limiting radii. | Numerical tests and documented frame conventions. |
| Seed persistence | Round-trip seeds including 0, max uint32, and out-of-range values. | Exact reproducibility for accepted seeds; clear rejection for invalid values. |
| Workers | Force worker crash, timeout, cancellation, and rapid resubmission. | No permanently pending survey; bounded concurrency and deterministic failure state. |

## 13.8 Instructions for the implementation agent

1. Treat this document as an audit and plan, not permission to change code automatically.
2. Reopen the exact target branch and record the exact commit before implementation. The supplied assessment refers to `black-hole-render` and reports `1294752` as its reviewed revision, while the earlier audit baseline recorded `583ad8b2c75460f7bd8b07997136b836d1df4697`; reconcile this explicitly before making changes.
3. Reproduce Claude's climate, population, and black-hole probes from a clean checkout. Record commands, seeds, sample sizes, units, and outputs.
4. Preserve v18 behavior and population metrics as a baseline before Batch A. Do not mix rendering-only changes with simulation-rule changes.
5. Implement Batch A as one coordinated rules-version bump only after the model assumptions and tests are agreed.
6. Keep every external HTTP call, cloud service, and third-party integration mocked in tests. Tests must not make network calls.
7. Do not generate or install an APK, and do not modify the database, unless the user explicitly authorizes those actions.
8. **Never run `git commit` or `git push`.** This restriction is absolute. Do not attempt either command as part of implementation, testing, cleanup, or delivery.
9. Report changed files, tests run, tests not run, and any remaining uncertainty. Do not describe a static review or a supplied probe as a test independently executed in the current environment.

## 13.9 Evidence and provenance note

The first audit's source-level findings and the Claude critique summarized here have different provenance. Findings attributed to Claude, including reported probe outputs and test counts, are based on the assessment supplied by the user. They should be independently reproduced before being treated as release evidence. Numerical calculations repeated in the earlier audit are useful cross-checks, but a source-level calculation is not a substitute for executing the application or validating it against observational data.
