# Code Audit, second pass — 2026-11-05

Whole repo again, after fixes 1 and 2 of the first pass (`Code-Audit-2026-11-05.md`). This pass went deeper into what the first one skipped: the simulation's random-number setup, experiment comparison, the Library summary, the Android plugins, audio preferences and the renderer's marker labels. Report only: no code changed.

**What this repo does:** Aion Forge builds a whole universe from one seed number (galaxy, stars, planets, life, minds, histories) and shows it in 3D in the browser or the phone app. On the desktop, a local server saves your Library, discoveries, experiments and bookmarks in MySQL.

**Load assumed:** one person on their own computer or phone.

**Healthy in this pass:**
- **Random-number setup:** `rng.ts` gives each part of the simulation its own stream, mixed in a fixed order, with exact integer math only.
- **Android plugins:** the screen-on flag is changed on the UI thread, and the heat reading handles Android versions that can't answer.
- **Saved settings:** audio preferences and drawer state survive a broken or blocked browser store.
- **Bookmarks:** the star classes match the server's list exactly.
- **Marker labels:** recomputed only when the camera moves, and cheap at the expected counts.

## Should fix

1. **"Legendary Events" is always 0, so the Library and the experiments say things that aren't true** (`frontend/src/simulation/experiment.ts:30`, `:130-136`, `:229-234`; `simulation/persistence.ts:114-121`, `:156`)
   - **What this is:** A universe's snapshot carries a count of "legendary events". The snapshot is the record of its counts, used for saving and comparing. `buildSnapshot` always sets this count to 0, because the timeline is only built on request.
   - **Problem:** Every saved universe with civilizations gets the summary "Their history unfolded quietly.", whatever happened. Every comparison shows a "Legendary Events 0 → 0" row. The surprise "A sparse universe produced a richer history…" and the Library's "featured" bonus for many events can never happen.
   - **Fix:** Delete the four uses: the summary sentence, the comparison row, that surprise and the featured score line. Leave the stored field and its database column, always 0, so saved records and files keep their shape.
   - **If we skip it:** The Library states something it never measured, and the comparison table carries a row that never moves.

## Nice to have

2. **"Random" only picks from the first quarter of all seeds** (`frontend/src/App.tsx:79-81`)
   - **What this is:** The Random button picks the next universe's seed.
   - **Problem:** It picks from 0 to 999,999,999, but seeds go up to 4,294,967,295 (`MAX_SEED`). Three out of four universes, such as seed 3,000,000,000, can only be reached by typing the number in.
   - **Fix:** `Math.floor(Math.random() * (MAX_SEED + 1))`, importing `MAX_SEED` from `simulation/rng`. One line. (`Math.random` is fine here: it only chooses which seed to open, and the universe itself still comes from the seed.)
   - **If we skip it:** Most of the possible universes are never offered by chance.

3. **A second copy of the random-number generator in the renderer** (`frontend/src/rendering/UniverseRenderer.ts:40-51`)
   - **What this is:** `mulberry32` places the nebula clouds around each galaxy.
   - **Problem:** It is the same algorithm as `createRNG` in `simulation/rng.ts`, with the same output for the same seed. The rendering code already uses `createRNG` (`systemView.ts`, `planet/life.ts`).
   - **Fix:** Delete `mulberry32` and call `createRNG(...)` at line 503. The nebulae look exactly the same.
   - **If we skip it:** Two copies of one formula, and a reader has to check that they really match.

4. **Still open from the first pass: leftover starter-template images** (`frontend/src/assets/react.svg`, `vite.svg`, `hero.png`, `frontend/public/icons.svg`)
   - **What this is:** Files from the Vite project template.
   - **Problem:** Nothing uses them.
   - **Fix:** Delete the four files.
   - **If we skip it:** About 30 KB of dead files.

5. **Still open from the first pass: bad requests reported as "Database error"** (`backend/src/server.ts:20-31`)
   - **What this is:** The server's last-stop error handler.
   - **Problem:** Bad JSON (status 400) and a body over 2 MB (status 413) are answered as 500 "Database error".
   - **Fix:** Pass errors already marked below 500 straight through, with their own status and message, before the 500 line.
   - **If we skip it:** A misleading message in a rare case.

Verdict: no must-fix left; fix 1 next, because the Library shows a false sentence.
Lean: about -40 lines and 4 files possible, 0 dependencies.
Not checked: the science inside each simulation module (`worldHistory`, `evolution/`, `climate`, `geography` — 712 passing tests cover their behaviour), shaders and the black-hole view (code only, no GPU runs on this machine), `stats/`, and the encyclopedia and physics-page text. Tests were not rerun in this pass; the last run had all 712 frontend and 16 backend tests passing.
