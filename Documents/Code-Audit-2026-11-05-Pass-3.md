# Code Audit, third pass — 2026-11-05

Whole repo again. This pass searched every source file for common edge-case mistakes: taking the largest or smallest of a list that may be empty, adding up a list with no starting value, sorting numbers as text, timers and listeners that are never removed, and number inputs that can go out of range. It also read the CI setup against the project's real pull requests. Report only: no code changed. The five findings from the second pass are still open; they are repeated at the end so this list is complete.

**What this repo does:** Aion Forge builds a whole universe from one seed number (galaxy, stars, planets, life, minds, histories) and shows it in 3D in the browser or the phone app. On the desktop, a local server saves your Library, discoveries, experiments and bookmarks in MySQL.

**Load assumed:** one person on their own computer or phone.

**Healthy in this pass:**
- **Empty lists:** every "largest or smallest of a list" either has an empty-list guard or works on a list that can't be empty, such as all planets of a galaxy or a crowded niche taken from living lineages.
- **Timers and listeners:** the timeline replay, the ambient sound beds and the renderer's mouse and touch handlers are all cleaned up.
- **Numeric inputs:** the Great Filter seed count is clamped to 5–50.

## Should fix

1. **"Legendary Events" is always 0** (from pass 2; `simulation/experiment.ts:30`, `:130-136`, `:229-234`; `simulation/persistence.ts:114-121`, `:156`)
   - **What this is:** A count in every universe snapshot (the record of its counts), used for summaries, comparisons and the Library's "featured" list.
   - **Problem:** It is never measured, so it is always 0. Every saved universe with civilizations reads "Their history unfolded quietly.", and comparisons show a "0 → 0" row.
   - **Fix:** Delete the summary sentence, the comparison row, the surprise and the featured-score line. Keep the stored field.
   - **If we skip it:** The Library states something it never measured.

## Nice to have

2. **"Many seeds" near the top seed wraps round to seed 0** (`frontend/src/ui/GreatFilterPanel.tsx:219`, `:251`)
   - **What this is:** The Great Filter panel can survey the universe on screen and the next 4–49 seeds, to tell luck from laws.
   - **Problem:** It counts up with `seed + i` and never stops at the largest seed. Start at seed 4,294,967,290 with 10 seeds, and seeds past 4,294,967,295 are really seeds 0–3, because the simulation only reads a seed's low 32 bits. Those results are labelled with seed numbers that don't exist, and the status line shows them too.
   - **Fix:** `(seed + i) % (MAX_SEED + 1)`, importing `MAX_SEED` from `simulation/rng`. One line.
   - **If we skip it:** A rare run mixes in the first few universes under false labels.

3. **CI skips pull requests between feature branches** (`.github/workflows/ci.yml:9-11`)
   - **What this is:** GitHub runs the type check, lint and tests (CI) on pushes to `development` and on pull requests into it.
   - **Problem:** Pull requests into any other branch get no checks. PR 7 (black-hole-render → galaxy-planet-validation) and PR 5 (black-hole-render → Galaxy-Through-Time) were merged without CI.
   - **Fix:** Delete `branches: [development]` under `pull_request`, so every pull request is checked. Keep the push filter.
   - **If we skip it:** Breakage merged between feature branches is found only when it reaches `development`.

4. **"Random" only picks from the first quarter of all seeds** (from pass 2; `App.tsx:79-81`)
   - **What this is:** The Random button picks the next seed.
   - **Problem:** It picks from 0 to 999,999,999, but seeds go up to 4,294,967,295.
   - **Fix:** `Math.floor(Math.random() * (MAX_SEED + 1))`.
   - **If we skip it:** Three in four universes are never offered by chance.

5. **A second copy of the random-number generator** (from pass 2; `rendering/UniverseRenderer.ts:40-51`)
   - **What this is:** `mulberry32` places the nebula clouds.
   - **Problem:** It is `createRNG` from `simulation/rng.ts` again, with the same output.
   - **Fix:** Delete it and call `createRNG` at line 503.
   - **If we skip it:** Two copies of one formula.

6. **Unused starter-template images** (from pass 1; `src/assets/react.svg`, `vite.svg`, `hero.png`, `public/icons.svg`)
   - **What this is:** Files that came with the Vite project template.
   - **Problem:** Nothing uses them.
   - **Fix:** Delete the four files.
   - **If we skip it:** About 30 KB of dead files.

7. **Bad requests reported as "Database error"** (from pass 1; `backend/src/server.ts:20-31`)
   - **What this is:** The server's last-stop error handler.
   - **Problem:** Bad JSON and bodies over 2 MB are answered as 500 "Database error".
   - **Fix:** Pass errors marked below 500 through with their own status. I'd still leave this one: nothing in the app sends such a request today.
   - **If we skip it:** A misleading message in a case that doesn't happen now.

Verdict: no must-fix; fix 1 first, then 2 and 3 (one line each).
Lean: about -40 lines and 4 files possible, 0 dependencies.
Not checked: the science inside each simulation module (712 passing tests cover their behaviour), shaders and the black-hole view (code only, no GPU runs on this machine), `stats/`, the Android build files, and the encyclopedia and physics-page wording. Tests were not rerun in this pass.
