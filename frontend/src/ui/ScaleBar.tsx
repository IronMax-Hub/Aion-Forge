import type { ViewScale } from "../rendering/UniverseRenderer";
import { SYSTEM_UNITS_PER_AU } from "../rendering/UniverseRenderer";
import { LIGHT_YEARS_PER_UNIT, niceScaleLength, formatLightYears, formatSig } from "./format";

const MAX_BAR_PX = 110;

/** Real-world length of one screen pixel in the view's unit, and how to label a length in that unit. */
function unitOf(scale: ViewScale): { perPixel: number; label: (length: number) => string } {
  switch (scale.mode) {
    case "galaxy": return { perPixel: scale.unitsPerPixel * LIGHT_YEARS_PER_UNIT, label: formatLightYears };
    case "system": return { perPixel: scale.unitsPerPixel / SYSTEM_UNITS_PER_AU, label: (l) => `${formatSig(l)} AU` };
    case "planet": return { perPixel: scale.unitsPerPixel * (scale.kmPerUnit ?? 0), label: (l) => `${formatSig(l)} km` };
  }
}

/** A map-style scale bar for the current view: light-years in the galaxy, AU in a planetary system, km in orbit. */
export function ScaleBar({ scale }: { scale: ViewScale | null }) {
  if (!scale || !(scale.unitsPerPixel > 0)) return null;
  const { perPixel, label: labelFor } = unitOf(scale);
  if (!(perPixel > 0)) return null;

  const length = niceScaleLength(perPixel * MAX_BAR_PX);
  const widthPx = length / perPixel;
  const label = labelFor(length);

  return (
    <div className="scale-bar" aria-label={`Scale: ${label}`}>
      <div className="scale-bar-line" style={{ width: `${widthPx}px` }} />
      <span className="scale-bar-label">{label}</span>
    </div>
  );
}
