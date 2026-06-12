/**
 * Public audio API for Aion Forge.
 *
 * Import from here — never from engine/ambient/sounds directly in UI code.
 */

export { audioEngine }      from "./engine";
export type { AudioPreferences } from "./engine";
export { ambientLayer }     from "./ambient";
export { discovery, ui, lab, timeline, civLayer } from "./sounds";
