# Aion Forge on a Phone — Plan

Branch: `apk-build` (from `Galaxy-Through-Time` at 3bdbc87).
Goal: an Android APK the owner can install on their own phone by sideloading. Play Store is out of scope.

Nothing in `src/simulation/` changes. Every step below is packaging, input handling or layout.
The same seed must give the same universe on the phone as on the desktop. Step M6 checks this.

---

## The target phone

The plan is built for one phone, the owner's. Other phones may work but aren't a goal.

| Spec | Value | What it means for Aion Forge |
|---|---|---|
| Chip | Snapdragon 7s Gen 3, 4 nm. 1× Cortex-A720 at 2.5 GHz, 3× A720 at 2.4 GHz, 4× A520 at 1.8 GHz | 8 cores, so the survey pool starts 7 workers (`cores − 1`). The pool hands out chunks to whichever worker is idle (`surveyPool.ts`), so the slower A520 cores just take fewer chunks. Estimate: about 1.5–3× the desk machine's ~20 s, so roughly **30–60 s per universe**. Not measured. |
| GPU | Adreno (the 810 in this chip) | WebGL2, half-float textures and multiple render targets are all supported on Adreno. Far stronger than the desk machine's GeForce 210, so the baked planet surfaces should be fine. |
| RAM | 12 GB |  The WebView gets only part of that, and each survey worker has its own JavaScript heap. M5 measures peak memory. |
| OS | Android 14, HyperOS | Lowest supported version can stay at Capacitor's default. The APK targets API 35 (Android 15) as current tools require; it runs on 14. HyperOS adds its own steps to installing an APK (see M6). |
| Screen | 6.67″, 2712×1220, 446 ppi, curved AMOLED, up to 120 Hz | Device pixel ratio is about 2.75, so landscape is about **986×444 CSS px**. Details below. |
| Cooling | 5,000 mm² vapour chamber | Long sessions should hold up. Heat is still checked in M5. |

### What the screen means for the layout
- **986×444 CSS px in landscape.** Today's top bar (48) and status bar (28) take 76 of the 444 px height. The sidebar (280) and dock (320) take 600 of the 986 px width. With both collapsed, the universe gets the full width.
- **Curved edges.** The outer few millimetres on the long sides bend away and reject touches. In landscape these are the **top and bottom** edges. Nothing tappable goes in the outer 8 px there.
- **Android gesture navigation** uses swipes in from the **left and right** edges for back. So drawers open with buttons, never with an edge swipe, which would fight the back gesture.
- **Punch-hole camera.** In full-screen landscape it sits in the left or right edge, depending on which way the phone is turned. Safe-area insets (`env(safe-area-inset-left/right)`) keep content clear of it.
- **Pixel ratio.** The renderer already caps it at 2 (`UniverseRenderer.ts:354`). That draws 1972×888 = 1.75 megapixels, about the same as the desktop's 1920×966. Native resolution would be 3.3 megapixels.
- **120 Hz.** If the WebView runs `requestAnimationFrame` at 120 Hz, the GPU does twice the work and heats up for no visible gain in a slowly turning galaxy. M5 measures; if so, draw at most 60 frames per second.
- **AMOLED.** The dark graphite theme already suits it. No change.

---

## What the code looks like today (measured, 2026-10-08)

| Area | Today | Problem on this phone |
|---|---|---|
| Layout | Fixed grid: sidebar 280 px, stage, dock 320 px, top bar 48 px, status bar 28 px (`App.css`, `index.css`) | On 986×444, sidebar and dock leave 386 px for the universe. Top and status bars take 17% of the height. |
| Saving | Library, discoveries, experiment log and bookmarks go to `backend/` (Express + MySQL) through `/api` (`api/client.ts`) | No backend on the phone. Owner decision: saving is off there (M1). |
| Fonts | IBM Plex loaded from Google Fonts in `index.html` | Offline, text falls back to the phone's font. |
| Camera | three.js `OrbitControls` | Already handles touch: one finger turns, pinch zooms, two fingers pan. |
| Picking a star | Raycast with a `Points` threshold of 3 world units; click slop 5 px | A fingertip covers about 40–50 CSS px. Stars will be hard to hit. |
| Approaching a planet | Double-click in the system view | Double-tap is hard to discover on a phone. |
| Planet labels | Hover label in the system view (`pointermove`) | No hover on a touch screen. |
| Going back | Escape key (`App.tsx:206`), Escape in `TreeOfLifePanel` | Android uses the back gesture instead. |
| Survey | Pool of `cores − 1` workers, chunks handed to idle workers; ~20 s on the desk machine; progress already reported | Probably 30–60 s here. Memory unknown. |
| Rendering | WebGL2; pixel ratio capped at 2; galaxy of 60k points; baked planet atlas | Should work. Frame time, 120 Hz and heat to be measured. |
| Planet Forge | Separate app, not linked from Aion Forge yet | Nothing to do. |

---

## Wrapper and build

**Capacitor**: copies `frontend/dist` into a native Android project and runs it in the system WebView (Chrome-based, updated through the Play Store). It works fully offline. Cordova is older and offers nothing more. A PWA would need hosting.

**Built locally** (owner decision M-B). This machine has JDK 17 and no Android SDK. Install under `~/Android`:
- JDK 21 (Capacitor 7 needs it),
- Android command-line tools, platform 35, build-tools, platform-tools (`adb`),
- about 2–3 GB in total.

Builds run with `./gradlew assembleDebug`. Gradle signs the debug APK with its own debug key, which is enough for sideloading.

---

## Steps

Each step is committed separately after review, as with earlier plans.

### M0 — Wrapper and first APK (no UI changes)
- Install the tools listed above (asks first: downloads).
- Add Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`) to `frontend/`, and generate `frontend/android/`.
- App id `com.aionforge.app`, name "Aion Forge" (owner decision M-F). Icon made from `public/favicon.svg`.
- Vite `base: './'` so the built files load from inside the APK. Check that workers and `?raw` shader imports still resolve.
- `npm run android` = `vite build && cap sync android && gradlew assembleDebug`.
- Screen (owner decision M-C):
  - `android:screenOrientation="sensorLandscape"`, so either landscape side.
  - Full screen: hide the status and navigation bars (immersive mode). A swipe from the edge shows them briefly.
  - Draw into the camera cutout area, with the web page using safe-area insets (M2).
- Done when: the APK installs on the phone, opens, generates the default universe and shows the galaxy. Layout still cramped.
- **As built (2026-10-08, runs on the owner's phone):** Capacitor 8.5.3, which compiles against API 36 (minSdk 24) with build-tools 35.0.0 and Gradle 8.14.3. Google replaced `sdkmanager` with the `android` CLI (`android --no-metrics sdk install …`); licences are accepted by installing. Vite `base` left at `/`: Capacitor serves the app from the root of `https://localhost`, so absolute paths, workers and shaders load as they are. Full screen is done in `MainActivity.java` (re-hides the bars on regaining focus). The camera cutout stays letterboxed (Android 14 default) until M2 adds safe-area handling. Machine paths live outside the repo: `android/local.properties` (gitignored) and `~/.gradle/gradle.properties` (`org.gradle.java.home`). Icon and splash are still Capacitor's defaults.

### Icon and launch screen (owner request, built with M1)
- Icon: a two-armed spiral galaxy (pale blue arms, amber core and glow) on the app's darkest colour `#07080A`, as an adaptive icon. Generated by `frontend/android/icon/make_icon.py`. The same drawing replaces Vite's default logo as the web favicon, and the page title is now "Aion Forge".
- Launch screen: the galaxy icon on `#07080A` (Android 12+ splash), and the window and WebView backgrounds are the same colour, so the app never flashes white.

### M1 — Saving off on the phone (owner decision M-A)
- The APK build sets a Vite flag (for example `VITE_STORAGE=off`). With it, these are hidden: Save universe, the Library's saved and discoveries tabs, star bookmarks and the experiment log. Nothing calls `/api`, so there are no "cannot reach the API" errors.
- Comparison (set baseline / compare) still works: it lives only in memory.
- Featured universes need no storage. They stay if the Library can show them without the saved tabs. Check during the step.
- Bundle the IBM Plex fonts with the app (`@fontsource/ibm-plex-sans`, `-mono`) instead of loading them from Google. The desktop uses the bundled fonts too, so both look the same.

### M2 — Collapsible layout (desktop and phone)
Owner decision M-D: panels collapse on the desktop too.
- **Everywhere:**
  - The sidebar and dock each collapse to a thin strip with an open button, and reopen from it.
  - Every dock panel (star, system, planet, biosphere, civilization, spectrum, field guide) can collapse to its header bar.
  - On a wide desktop both start open, so the desktop looks as it does today until something is collapsed.
- **Phone** (`@media (pointer: coarse) and (max-height: 500px)`, which matches this phone's 444 px landscape height):
  - Both start closed, so the universe gets all 986 px.
  - **Sidebar** (280 px) opens *over* the stage from the left.
  - **Dock** (320 px) opens over the stage from the right and opens itself when a star or planet is selected. That leaves 666 px of universe beside it. Closing it keeps the selection.
  - Open buttons sit inside the safe area and away from the screen edges, so they don't clash with the back gesture or the curved edges.
  - **Top bar** 48 → 40 px; brand hidden; breadcrumb and seed stay; other actions move into the sidebar.
  - **Status bar** hidden; errors appear as a dismissable strip at the top of the stage. That gives the stage 404 of 444 px.
  - **Overlays** (timeline, library, config, experiment log, comparison, tree of life) open full screen with a close button.
  - **Sizing:** tap targets at least 44 CSS px (about 7 mm here); body text at least 13 px; nothing tappable in the outer 8 px of the top and bottom (curved) edges.
- The open/collapsed state of each drawer and panel is kept in browser storage, as a convenience only.
- **As built (2026-10-08):**
  - `ui/Drawer.tsx` (header bar with hide button; rail with open button) and `ui/layout.ts` (`COMPACT_QUERY`, start state). Rails: 32 px on the desktop, 44 px on the phone, labelled "Universe" and "Selection".
  - **One collapse per drawer, not per panel.** The dock shows one panel at a time (star, system, planet, biosphere or civilization), so hiding the dock hides whichever panel it holds.
  - A hidden dock opens by itself when the selection changes (on the desktop too), so a selection is never made out of sight. It stays hidden while the same thing is selected.
  - Open/hidden is remembered on the desktop only; on the phone both start hidden every time.
  - Phone: the drawers are 280 px and 340 px and slide over the view. The top bar is 44 px and everything still fits, so no actions moved. Buttons are at least 36 px tall; close and hide buttons are 40 px.
  - **Status line floats instead of being hidden.** It lies over the bottom of the view on a dark fade, so survey progress, the scale bar and sound control stay.
  - Tool panels (timeline, parameters, comparison, tree of life) cover the whole screen below the top bar, rails included.
  - Camera cutout: `viewport-fit=cover` plus padding from Capacitor's `--safe-area-inset-*` (or `env()`). Android 14 still letterboxes the cutout. On Android 15+, which draws under it, the padding keeps content clear.
  - `UniverseRenderer` now follows its canvas with a `ResizeObserver` instead of window `resize`, so the view resizes when a drawer opens or hides. The constructor's `setSize` no longer writes inline CSS, which also fixes the old 0×0 canvas in a tab that loads hidden.

### M3 — Touch input
- **Not needed (owner, 2026-10-09):** on the phone, taps already pick stars reliably, the page doesn't zoom, and the planet panel already had an **Approach** button (missed when this plan was written). Nothing below was built.
- **Picking stars:** a tap selects the star nearest the finger within about 24 CSS px. The distance is measured on the screen, not in world units, so it doesn't change with zoom. Mouse picking stays as it is.
- **Click slop:** 10 px for touch, 5 px for mouse.
- **Planets in the system view:** the first tap focuses the planet and shows its label, replacing hover. The planet panel gets an **"Approach"** button, replacing double-click on touch. Double-click still works with a mouse.
- **Camera:** keep `OrbitControls` touch gestures. Turn off the page's own double-tap and pinch zoom (`touch-action: none` on the canvas, viewport `user-scalable=no`), so they don't fight the camera.
- **Hover-only things:** `:hover` styles and the 21 `title` tooltips get a visible equivalent on touch, or are dropped.
- **Lists:** the field guide and tree of life select a row on tap (already works). Check that each list scrolls with a finger inside its panel.

### M4 — Android back gesture
- The back gesture runs the same "close overlays in priority order, then go back" logic as Escape (`App.tsx:206`). That logic moves into one function that both call.
- In the galaxy view with nothing open, back exits the app.
- Uses `@capacitor/app` (`backButton` event), only inside the APK.
- **As built:** `stepBack()` in `App.tsx` closes, in order: the tree of life, a tool panel (`closeTopPanel()`, shared with Escape), an open Universe drawer (phone only). Then it walks back civilization → biosphere → planet → out of orbit → system → galaxy → no star selected. With nothing left, back leaves the app. Escape on the desktop keeps its old, shorter behaviour; it now calls the shared `closeTopPanel()`.

### M5 — Performance on this phone
Measure first; change only what measurement shows (constitution §11). Measured over USB with Chrome's remote debugging (`chrome://inspect`) into the app's WebView. The debug APK allows this.

| Measure | Expected | If it's worse |
|---|---|---|
| Survey time, seed 100000 | 30–60 s | Check that all 7 workers are busy. Nothing in the simulation changes. |
| Peak memory during survey | Unknown | If the WebView is killed or runs out of memory: cap the pool on the phone (try 4, the number of big cores). The pool size doesn't change results, because chunks are merged in star order. |
| Frame rate, galaxy / system / orbit | ≥ 30 fps everywhere | Cap frames at 60 if the WebView runs at 120 Hz. Lower the pixel-ratio cap from 2 to 1.5. Smaller bake faces in orbit view. |
| Heat after 10 min of orbit view | Warm, no throttling | Same levers as frame rate. |
| Bake time on approach | About 0.8 s on desktop | Fewer, larger strips if it stutters. |

- **Keep the screen on during the survey** (owner decision M-C): set while the survey runs, cleared when it ends (Capacitor keep-awake plugin or Android `FLAG_KEEP_SCREEN_ON`).
- **Backgrounding:** if the app goes to the background during the survey, Android may pause the WebView. Check that the survey continues or resumes when the app is brought back, and doesn't restart from zero.

- **Measured on the owner's phone (2026-10-09), seed 100000, by stopwatch and a temporary timing readout (not kept):**

  | Build / setting | First chunk done | Survey total |
  |---|---|---|
  | App, default HyperOS battery saver | ~2:30 | ~4:30 |
  | Phone's Chrome browser | — | ~2:00 |
  | App, Battery saver **No restrictions**, 7 workers, first survey after launch | 74–77 s | 138–145 s |
  | Same, 4 workers | — | 159 s |
  | Same, 7 workers, after another survey in the session | 11 s | 84 s |

  - **HyperOS's default battery saver for new apps more than doubled the time.** "No restrictions" is now an install step (`frontend/android/README.md`).
  - **7 workers beat 4,** so the little cores help; the pool stays at `cores − 1`.
  - **The first survey after launch pays a one-time ~60 s warm-up:** first-round chunks run ~5× slower than later ones. The desktop shows the same pattern at a fraction of a second (1.2 s vs 0.9 s per chunk). Likely the engine's background optimizing compiler starved of CPU while all cores run workers; **not confirmed** (needs USB profiling). Left as an optional later investigation.
  - Interface and rendering: smooth (owner); no change needed.
- **As built:** while a survey runs, the status line shows elapsed seconds (`Surveying life… 0% · 45 s`, desktop too), and the screen stays on through the app's own small `KeepAwake` plugin (`KeepAwakePlugin.java`, `src/native/keepAwake.ts`; does nothing in a browser).

### M6 — Same universe on the phone, tests, install guide
- On the phone, generate seeds 100000 and 271828. Compare counts and a hash of all planets with the desktop. The engine uses `detmath`, and the phone's WebView runs the same V8 engine as desktop Chrome, so they should match. A mismatch would be a bug, not something to tune away.
- `npm test`, `npx eslint .` and `npx tsc -b --noEmit` pass. The desktop layout is checked in the browser.
- `frontend/android/README.md`: how to build, where the APK ends up (`android/app/build/outputs/apk/debug/app-debug.apk`), and how to install it on HyperOS:
  - **Simplest:** copy the APK to the phone, open it in the file manager, and allow "Install unknown apps" for the file manager. HyperOS may show an extra security scan or warning; that's normal for a sideloaded app.
  - **Over USB (`adb install`):** turn on developer options, USB debugging, and **"Install via USB"**. On Xiaomi phones, "Install via USB" may need a Mi account sign-in, sometimes with a SIM card in the phone. USB debugging is also what M5's measurements use.

---

## Decisions

| # | Question | Answer |
|---|---|---|
| M-A | Saving on the phone | **Off on the phone.** |
| M-B | Where to build | **Locally** (Android SDK + JDK 21 under `~/Android`). |
| M-C | Screen | **Landscape either side, full screen, keep awake during surveys.** |
| M-D | Collapsible panels on the desktop too? | **Desktop too** (open by default on wide screens; on the phone, drawers open over the stage). |
| M-E | Target phone | **Snapdragon 7s Gen 3, Android 14 / HyperOS, 2712×1220** (the owner's phone; see above). |
| M-F | App id and name | **`com.aionforge.app`, "Aion Forge".** |

## Risks
- **Survey time and memory** are estimates until M5. A worse outcome is a 1–2 minute survey; the cure is pool size, not changes to the simulation.
- **HyperOS** is strict about background apps and sideloading. It may kill the app during a long survey in the background (M5 checks), and installing needs the steps in M6.
- **120 Hz** may double GPU work and heat for no gain; M5 checks.
- **Two layouts to keep working:** every future panel must work collapsed, docked and in a phone drawer. M2 puts the drawer behaviour in one component and one CSS block, so new panels get it for free.
