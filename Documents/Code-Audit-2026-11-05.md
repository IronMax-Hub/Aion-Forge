# Code Audit — 2026-11-05

Audit of the whole repo (frontend, backend, CI). Report only: no code changed.

**What this repo does:** Aion Forge builds a whole universe from one seed number: a galaxy, its stars, their planets, life, minds and histories. You explore it in a 3D view in the browser or in the phone app. On the desktop, a small local server saves your library, discoveries, experiments and bookmarks in MySQL. The phone app saves nothing.

**Load assumed:** one person at a time on their own machine or phone. Many people at once doesn't apply here. "Load" here means the long life survey (over a minute of work spread across up to 8 workers) and the phone's GPU.

**What I checked and found healthy:**
- **Determinism:** the simulation has no `Math.random` or clock calls. The exact-math rule is enforced by lint. `galaxy.ts` is excused from that rule, and its output only draws the dust cloud: the simulation uses only its type, which a seed decides. The worker pool merges chunks in star order, not arrival order.
- **Backend:** every value is passed as a placeholder (no SQL injection). Input is checked with zod. The import runs inside a transaction. The server listens on localhost only.
- **3D view:** a new galaxy frees the old one's GPU memory and clears the old markers.

## Must fix

1. **Saving a universe again wipes its name and favourite** (`backend/src/routes.ts:47-56`, `frontend/src/App.tsx:517-552`)
   - **What this is:** "Save universe" sends the whole record. The server writes it with `INSERT … ON DUPLICATE KEY UPDATE`, which means "add it, or overwrite the one already there".
   - **Problem:** The save button always sends the default name (`AF-U-…`), empty notes and favourite = off, and overwrites every column. Rename a saved universe, star it, open it again from the Library and press Save: the name goes back to `AF-U-…` and the star is gone. Notes brought in from an imported file are wiped the same way. The record's ID comes from the seed alone, so saving the same seed with different constants also replaces the other save.
   - **Fix:** When the record already exists, update only what the rules produce (the counts, summary, config and rules version) and keep `name`, `notes`, `is_favorite` and `created_at`. One test with a stand-in pool can check that the update leaves those four columns out.
   - **If we skip it:** The names and stars you gave your universes disappear without a warning the next time you save one.

## Should fix

2. **After a failed survey, three buttons freeze the app for over a minute** (`frontend/src/App.tsx:173`, `:450-452`, `:456`, `:466`, `:520`)
   - **What this is:** Save, Set baseline and Compare need the survey's counts. They stay greyed out while the survey runs. If no counts are ready, they fall back to `snapshotOf`, which runs the whole survey on the main thread.
   - **Problem:** If a survey worker fails, the error shows, the buttons turn on again and there are still no counts. Clicking any of them runs the over-a-minute survey on the main thread. The page stops responding, and on the phone Android may offer to close the app.
   - **Fix:** Also keep the buttons greyed out when the survey failed: `const snapshotPending = isGenerating || surveyProgress !== null || surveyError !== null;`. Then delete `snapshotOf` and the three `?? snapshotOf(...)` fallbacks, because the counts always come from the worker.
   - **If we skip it:** One worker failure turns into a frozen app.

## Nice to have

3. **Leftover files from the Vite starter template** (`frontend/src/assets/react.svg`, `vite.svg`, `hero.png`, `frontend/public/icons.svg`)
   - **What this is:** Images that came with the project template.
   - **Problem:** Nothing in `src/` or `index.html` uses them. I grepped for each file name.
   - **Fix:** Delete the four files.
   - **If we skip it:** About 30 KB of dead files that every reader wonders about.

4. **Bad or too-large requests are reported as "Database error"** (`backend/src/server.ts:20-31`)
   - **What this is:** The server's error handler, which is the last stop for any error.
   - **Problem:** Express already marks bad JSON (status 400) and a body over 2 MB (status 413). This handler ignores those marks and answers 500 "Database error". A legacy import bigger than 2 MB would show "Database error" on every start, which points you at MySQL instead of the size.
   - **Fix:** Add `if ((err as {status?: number}).status && (err as {status: number}).status < 500) { res.status((err as {status: number}).status).json({ error: (err as Error).message }); return; }` before the 500 line.
   - **If we skip it:** A misleading message in a rare case.

Checks run: frontend tests 712/712 pass (65 files, 7 min), type check and lint clean; backend tests 15/15 pass. None of these tests touches finding 1 or 2.

Verdict: fix 1 first: it loses names and stars you set. Then 2.
Lean: about -10 lines and 4 files possible, 0 dependencies.
Not checked: rendering shaders and the black-hole view (code only, no GPU runs on this machine), the Android project, `stats/`, the encyclopedia and physics-page text, and the science in the simulation rules. I read those areas only for randomness and shared state.
