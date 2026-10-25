/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "off" in the phone build (.env.android): nothing is saved. */
  readonly VITE_STORAGE?: string;
}
