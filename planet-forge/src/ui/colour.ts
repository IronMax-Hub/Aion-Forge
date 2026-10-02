// Colours between the form's colour picker (sRGB hex) and the spec (linear RGB).
// Presentation only: the spec stores what the picker gives, rounded.

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** "#rrggbb" to linear [r, g, b]. */
export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => toLinear(c / 255)) as [number, number, number];
}

/** Linear [r, g, b] to "#rrggbb". */
export function linearToHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(toSrgb(c) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear [r, g, b] to sRGB bytes. */
export function linearToBytes(rgb: readonly number[]): [number, number, number] {
  return rgb.map((c) => Math.round(toSrgb(c) * 255)) as [number, number, number];
}
