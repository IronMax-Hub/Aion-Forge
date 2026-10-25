/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "off" in the phone build (.env.android): nothing is saved. */
  readonly VITE_STORAGE?: string;
  /** How finely the black hole close-up is traced (rendering/blackHole/quality.ts): "high" in the phone build. */
  readonly VITE_BLACK_HOLE_QUALITY?: string;
  /** "on" shows the close-up's heat and frame-rate readout, for measuring on the phone. */
  readonly VITE_BLACK_HOLE_STATS?: string;
}
