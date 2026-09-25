import type { ViewScale } from "../rendering/UniverseRenderer";
import { SYSTEM_UNITS_PER_AU } from "../rendering/UniverseRenderer";
import { LIGHT_YEARS_PER_UNIT, niceScaleLength, formatLightYears, formatSig } from "./format";

const MAX_BAR_PX = 110;

/** A map-style scale bar for the current view: light-years in the galaxy, AU in a planetary system. */
export function ScaleBar({ scale }: { scale: ViewScale | null }) {
  if (!scale || !(scale.unitsPerPixel > 0)) return null;

  const perPixel = scale.mode === "galaxy"
    ? scale.unitsPerPixel * LIGHT_YEARS_PER_UNIT
    : scale.unitsPerPixel / SYSTEM_UNITS_PER_AU;
  const length = niceScaleLength(perPixel * MAX_BAR_PX);
  const widthPx = length / perPixel;
  const label = scale.mode === "galaxy" ? formatLightYears(length) : `${formatSig(length)} AU`;

  return (
    <div className="scale-bar" aria-label={`Scale: ${label}`}>
      <div className="scale-bar-line" style={{ width: `${widthPx}px` }} />
      <span className="scale-bar-label">{label}</span>
    </div>
  );
}
