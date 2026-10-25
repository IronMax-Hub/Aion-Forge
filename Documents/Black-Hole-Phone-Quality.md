# Plan: a sharper black hole on the phone

Branch: `black-hole-render`. Status: done (2026-10-25). Measured on the owner's phone: Medium for a thin disc, Standard for a hot flow, no heat. The readout is off in the phone build (`VITE_BLACK_HOLE_STATS=on` brings it back).

Goal: the phone build draws the black hole close-up more crisply, using the phone's faster GPU, without making it hot. The computer keeps today's rendering exactly.

Only presentation changes. Nothing in `src/simulation/` changes: the same seed gives the same black hole on both devices, with the same physics. The phone shows it in finer detail.

---

## Why the phone has no lag

- The computer's GPU is a GeForce G210 (2009). The close-up was tuned for it: `BlackHoleView.ts` traces at half the screen's resolution (`RESOLUTION_SCALE = 0.5`) and stretches the result over the view.
- On the phone (pixel ratio capped at 2), that works out to about 986×444 traced pixels, roughly the same work per frame as on the computer.
- The phone's GPU (Snapdragon 7s Gen 3) is many times faster than the G210, so most of it sits idle. That headroom is what this plan spends.

## Can it hurt the phone?

No. A web app cannot damage the hardware. When Android gets hot it slows the chip down by itself and, in the extreme, closes the app. The real costs are heat, battery drain, and stutter once it slows down. This plan stays well below that point and backs off by itself if the phone warms up.

---

## Steps

### BH1: two quality settings
- **Standard:** today's exact numbers, used on the computer, which looks the same as now.
- **High** (the phone):
  - draws at full resolution instead of half;
  - takes finer, more numerous steps along each ray near the hole, so the photon ring (the thin bright ring around the shadow) and the fainter rings inside it come out sharp instead of soft;
  - draws the background stars as small sharp points (they were widened on purpose so half resolution would not break them up);
  - adds finer detail to the streaks in the disc.
- The phone build turns High on with one line in `frontend/.env.android`, the same way it already turns saving off. One shader serves both settings: the settings become constants set when it is compiled.

### BH2: frame-rate limit
The biggest lever on heat. The screen runs at up to 120 Hz, and today the close-up is traced every frame. Limit it to **60 fps while the view is being dragged** and **30 fps when it is still**. The disc turns once every 24 s at its inner edge (slower further out), so 30 fps still looks smooth.

### BH3: heat guard (phone only)
Android reports how hot the phone is: none, light, moderate, severe and higher (`PowerManager.getCurrentThermalStatus`). A small Capacitor plugin, alongside the existing `KeepAwakePlugin`, passes this status to the app.
- At **moderate**, the close-up drops one level of sharpness.
- At **severe**, it falls back to Standard.
- When the phone cools, it steps back up.

### BH4 (optional, left out of the first version): glow around the bright disc
A soft glare around the brightest part of the disc, as a camera or the eye sees it. It is the closest thing to the Interstellar look, but it costs the phone more and it is a choice of look rather than physics. Added only if the sharpened view still feels flat.

### BH5: measure before fixing the numbers
Measure first (constitution §11). With USB debugging on and the phone plugged in, `adb` (already installed) reads Android's heat status, the battery temperature and frame times while the close-up runs for about 10 minutes at each setting. If it runs warm, High is lowered before anything is committed.

---

## Left out on purpose
- **A spinning (Kerr) black hole.** Real shadows are lopsided because black holes spin. That is a physics change for both devices and needs a spin value in the simulation, so it deserves its own plan.
- **Choosing the setting from the GPU automatically.** More general, but harder to understand and test. A build flag says plainly which device gets what.

## Decisions for the owner
| | Question | Recommendation |
|---|---|---|
| BH-A | How does the phone get High? | Phone build flag in `.env.android`. |
| BH-B | Heat guard (BH3)? | Yes. |
| BH-C | Glow (BH4)? | Not in the first version. |
| BH-D | Frame-rate limits | 60 fps while dragging, 30 fps when still. |

---

## As built (2026-10-25)

**Never rendered on the owner's computer above Standard.** Rendering High in the browser pane froze the whole machine (GeForce G210) and needed a forced shutdown. Medium and High are checked from code only; the phone measures them.

- `rendering/blackHole/quality.ts`: the three levels, the build's level (`VITE_BLACK_HOLE_QUALITY`, `high` in `.env.android`), and `qualityForThermalStatus` (moderate: one level lower; severe or worse: Standard).
- The shader's six tuned constants (`MAX_STEPS`, `STEP_SCALE`, `MIN_STEP`, `MAX_STEP`, `STREAK_OCTAVES`, `STAR_SIZE`) are now set per level when it is compiled. A test proves Standard gets exactly the original values, so the desktop is unchanged.
- `BlackHoleView`: traces at the level's resolution; on Medium and High skips frames beyond 60 fps (camera moving) or 30 fps (still), keeping the last one on screen; `setQuality` rebuilds the shader once when the level changes.
- **Speed guard** (added after the freeze): a level traced fewer than 12 times a second for 3 s in a row (after 3 s of warm-up) drops one level, and the readout says so. A level too heavy for the GPU cannot leave the close-up stalled.
- `ThermalPlugin.java` + `native/thermal.ts`: Android's thermal status, thermal headroom (Android 11+) and battery temperature, read every 5 s while the close-up is open.
- **Stats readout** (`VITE_BLACK_HOLE_STATS=on` in this build only): top left of the close-up. A tap on **Level** cycles standard → medium → high.

| Level | Traced pixels on the phone | Ray steps per frame, start view | …closest view (6 r_s) | Frame limit (moving / still) | Star width |
|---|---|---|---|---|---|
| Standard | 986×444 (0.44 M) | 10.7 M | 17.1 M | none | 1.0 |
| Medium | 1479×666 (0.99 M) | 29.9 M | 48.6 M | 60 / 30 | 0.9 |
| High | 1972×888 (1.75 M) | 70.8 M | 117.4 M | 60 / 30 | 0.75 |

Steps counted by replaying the shader's stepping on the CPU (an upper bound: a thin disc ends some rays early). No ray reaches its step limit at any level.

Star widths: a lensed star near the Einstein ring is stretched into an arc (real lensing). Narrower than about one traced pixel, the arc breaks into dashes, so each finer level keeps stars about 1.3–1.5 traced pixels wide.

### Reference black holes (owner's choice)
| Seed | Galaxy | Black hole | What it shows |
|---|---|---|---|
| 13 | elliptical | 135 million M☉, feeding at 1.7 % of Eddington | **thin disc**, peak 166,000 K: the heavier case (disc crossings, Doppler, streaks) |
| 42 | elliptical | 45 million M☉, feeding at 0.09 % of Eddington | **hot flow**: the faint cloud, summed along every step |

### What to measure on the phone
For each seed (13, then 42), open the close-up and for each level (tap Level):
1. Leave it still for about 3 minutes, then drag it around for about 1 minute.
2. Note **Rate**, **Heat** (status and headroom), **Battery** °C, and any **Guard** line, at the start and the end. A photo or screen recording of the readout is enough.
3. Say whether High looks sharper than Standard, and whether anything looks wrong (stars as dashes, black dots, flicker).

Then the numbers are fixed, the readout is turned off (`VITE_BLACK_HOLE_STATS`), and this is committed.

### First measurements (owner's screen recording, 2026-10-25, about 3 minutes)
| Seed | Standard | Medium (30 still / 60 moving) | High (30 / 60) |
|---|---|---|---|
| 13, thin disc | 83 fps | 26–34 still, 44–58 moving | 32 with the hole small on screen, 13–18 close up |
| 42, hot flow | 5–25 | 7–13 | 3–5 (speed guard stepped it down) |

- **Heat:** status "none" throughout, headroom 0.33–0.45 (1.0 = throttling), battery 34.2 → 36.0 °C. The heat guard never acted.
- **High is GPU-bound** on this phone at full resolution. Medium nearly holds its limit on the thin disc.
- **The speed guard's 12 fps threshold is too low:** High at 13 fps stayed on.
- **Seed 42 was measured while the life survey ran** (all CPU cores busy), so its numbers are not clean. The hot flow is also costlier per step: it evaluates the streak noise at every step of every ray, the thin disc only at disc crossings.
- **Seen in passing:** a seam across the disc where the streak noise's angle wraps (±180°). Present at every level, the desktop included; a separate fix.
- The 72 fps Medium reading came right after a level switch: the frame counter mixes levels for a second.

**Proposed next:** phone level Medium; speed guard at 20 fps; skip the hot flow's noise where its gas is too thin to show (all levels, imperceptible); reset the frame counter on a level switch; re-measure with the survey finished.

### Second build (2026-10-25, owner approved the proposals)
- **Phone level: Medium** (`.env.android`). High stays available on the readout's Level button.
- **Speed guard at 20 fps** (was 12), and it warms up afresh after every level change, so a switch is never mistaken for slowness.
- **Hot flow cheaper, at every level (the desktop too):** a step whose glow is below `HOT_FLOW_NEGLIGIBLE` (5·10⁻⁸, under a millionth of full brightness after its largest shift and streaks) skips the shift and the streak noise. Replayed on the CPU: 88 % of steps skip at the start view, 28 % at the closest; the most light any ray loses is 2.6·10⁻⁶ (linear), about a hundredth of one screen brightness step.
- **Frame counter** starts afresh on a level change, so the readout never mixes two levels.
- To measure: wait until "Surveying life…" has finished, then as before for seeds 13 and 42.

### Disc seam fixed (2026-10-25, every level, the desktop too)
The streak noise's x coordinate is the angle around the disc (6 cells per turn); where `atan` wraps from +π to −π it jumped 6 cells, so the pattern did not meet itself and a straight seam crossed the disc (seen in the first recording). The noise now repeats after exactly one turn (`valueNoiseWrapX`: the lattice wraps every 6, 12, 24… cells as each octave doubles), so it closes on itself. CPU port of old and new, across the wrap for seeds 13, 42, 7 and 1001 at radii 3–20: the jump fell from 0.14 on average (0.59 at worst, of a range near 1) to 0.0000. The streaks keep their look; their exact pattern differs from before.

### Second measurements (owner's recording, 2026-10-25 16:21, survey finished first)
| Seed | Standard | Medium (30 still / 60 moving) | High |
|---|---|---|---|
| 13, thin disc | 66–75 fps | 27–30 still, 58 moving | 14–15 (guard → Medium) |
| 42, hot flow | 33–34 | 12–23 (guard → Standard) | 5 (guard → Medium) |

- Heat: status "none", headroom 0.29–0.41, battery 34.2 → 36.0 °C over about 4 minutes.
- The disc seam is gone (seed 13 face-on: rings unbroken).
- The speed guard works, but its drop outlasted the visit: after seed 42 fell to Standard, seed 13 opened at Standard.
- The hot flow costs about 2.5× the thin disc at the same level: every ray crosses the whole cloud, while most stop at the opaque disc.

**Proposed to finish:** Medium for the thin disc; the hot flow one level lower (Standard on the phone); each close-up starts from the build's level; readout off; commit.

### Third build (2026-10-25 16:30)
- Medium stays the phone's level.
- **A hot flow is traced one level lower** (`qualityForAccretion`): Standard on the phone, Standard on the desktop (it cannot go lower).
- **Each visit to the close-up starts from the build's level**; a speed-guard drop no longer carries over.
- The readout stays on for checking.

---

## Proposal: clearer lensing and a less regular disc (owner's request, not built yet)

Both change the picture on every level, the desktop included, and both stay physical and seeded. Neither will be rendered on the owner's computer; the phone checks them with the readout.

### L1: the host galaxy as light in the sky, so the lensing reads at a glance
Today the sky behind the black hole is near-black with sparse stars (`sky()`: a haze of 0.0016 and two star layers). Lensing only shows where a star happens to sit near the shadow, so the eye reads the glowing gas instead.
The camera sits at the galaxy's centre, so the galaxy's own stars should fill the sky as a glow: for a **spiral** a bright band along its plane (the disc of the galaxy seen from inside, like the Milky Way from Earth); for an **elliptical** a smooth glow brightest towards nothing in particular; for an **irregular**, patchy. Lensing then visibly bends that band into the shadow's familiar doubled outline and a thin bright Einstein ring, at every pixel instead of only where stars fall. One more, denser and fainter star layer makes the stretched arcs near the ring readable as well.
- Driven by the galaxy's type and seed, which the simulation already has. Nothing is authored per galaxy.
- Cost: the sky is looked up once per ray, so about one more noise sample and one hash per pixel: small next to the trace.

### D1: sheared filaments and clumps in the disc
Today's streaks are noise stretched along the orbit, so they form even concentric bands.
- **Trailing filaments:** gas in a Keplerian disc is sheared (inner gas orbits faster), so any clump winds into a tight trailing spiral. Sampling the streaks along φ + k·ln r instead of φ gives that winding, with k the pitch of the spiral. One addition per sample.
- **Clumps and gaps:** a second, rounder noise varies the gas's brightness and opacity, so some patches glow brighter and some are thin enough to see through. This is the uneven, turbulent look (real discs are turbulent through the magneto-rotational instability).
- Cost: only where a ray crosses the disc, a few times per ray, so small for a thin disc. The hot flow keeps today's streaks, as it is already the costly case.

### Checks
Code only: the CPU port of the noise (as for the seam) checks continuity and value ranges; the readout measures frame rate on the phone with seeds 13 (disc) and 42 (hot flow), and seed 7 or another spiral for L1's band.

### L1 and D1 built (2026-10-25 16:44, owner approved both)
- **L1:** `galaxyGlow()` adds the host galaxy's starlight to the sky, from its type (`galaxyKind`) and a seeded orientation (`galaxyFrameFor`: the galaxy's pole spread evenly over directions against the disc's axis). Spiral: a band round the sky (half-height sine 0.16) with a dust lane; elliptical: a glow deepest along the longest of axes 1 : 0.75 : 0.55; irregular: cloud patches. A third star layer (200 per radian, 40 % of cells) about doubles the stars; each is at least 0.7 traced pixels wide (`pixelAngle`), its light kept the same, so none flickers.
  On screen (of 255): spiral band 65–76 (34–65 in the dust lane, near black 20° off it); elliptical 15–51; irregular 20–65; the old haze was 6–9.
- **D1:** thin disc only. Streaks sampled along φ + 4·ln r (trailing spirals, pitch about 14°); `clumps()` (20 round cells per turn, two octaves, closing round the circle) scales opacity ×0.35–1.2 and brightness ×0.6–1.35. CPU port: no seam (jump 0.0000), mean opacity ×0.74, mean brightness ×0.95.
- **Checks, none rendered on the owner's computer:** shader compiled and linked at all three levels in WebGL 1 and 2 by headless Chrome on SwiftShader (CPU), with no drawing; unit tests for the galaxy's axes.
- **Seeds to look at:** 13 (elliptical, thin disc), 42 (elliptical, hot flow), **7 (spiral, thin disc: the band)**, 6 (spiral, hot flow).
- Cost: the sky is looked up once per escaping ray, now with about 3× its old noise work; the clumps add one noise per disc crossing. Expect a few fps less; the readout will show it.

### Measurements with L1 and D1 (owner's four recordings, 2026-10-25 16:50–17:00)
| Seed | Galaxy, gas | Traced (build level Medium) | Rate |
|---|---|---|---|
| 7 | spiral, thin disc | Medium | 32–33 fps (its limit); High 15–17 → guard |
| 6 | spiral, hot flow | Standard | 55–57, 28–30 very close in |
| 13 | elliptical, thin disc | Medium | 31–33, 25–26 close up while moving; High 12–18 → guard |
| 42 | elliptical, hot flow | Standard | 36–39 |

- No cost visible from L1 and D1 (seed 13 Medium was 27–30 before, seed 42 Standard 33–34).
- Heat "none" throughout, headroom ≤ 0.45, battery steady at 36.4–37.7 °C.
- Each visit opened at Medium; both hot flows traced at Standard; the guard stepped High down every time.
- Seen: the spiral band bends visibly round the shadow (seed 6); trailing filaments clear in seed 13; the strands look even and the clumps faint (an option: fewer, larger clumps).
