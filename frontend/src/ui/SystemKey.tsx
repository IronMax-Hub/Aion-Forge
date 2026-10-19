// The system view's key: its scale, what is and is not drawn to scale, and
// what a binary's lines and marks mean (legibility pass, 19 Oct 2026).
//
// Why it exists: orbits are drawn to scale but bodies are enlarged, and star
// colours are boosted; the view says so rather than let proportions mislead.
// A binary's view also holds several kinds of line (the two stars' ellipses,
// orbits round one star, orbits round both) and a mark for the centre of mass.
//
// Presentation only: it reads the system and its star and draws nothing in 3D.

import type { PlanetarySystem } from "../simulation/planet";
import type { Star } from "../simulation/star";
import { starDisplayCss } from "../rendering/starColour";
import type { ViewScale } from "../rendering/UniverseRenderer";
import { ScaleBar } from "./ScaleBar";

const SWATCH_W = 28;
const SWATCH_H = 10;

/** A CSS colour for a star, as the view draws it. */
const starColour = starDisplayCss;

function LineSwatch({ colour, dashed = false }: { colour: string; dashed?: boolean }) {
  return (
    <svg width={SWATCH_W} height={SWATCH_H} aria-hidden="true">
      <line x1="1" y1={SWATCH_H / 2} x2={SWATCH_W - 1} y2={SWATCH_H / 2} stroke={colour} strokeWidth="1.5" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

function CentreSwatch() {
  const c = SWATCH_W / 2;
  const m = SWATCH_H / 2;
  return (
    <svg width={SWATCH_W} height={SWATCH_H} aria-hidden="true">
      <line x1={c - 5} y1={m} x2={c + 5} y2={m} stroke="var(--col-text-2)" strokeWidth="1.2" />
      <line x1={c} y1={m - 5} x2={c} y2={m + 5} stroke="var(--col-text-2)" strokeWidth="1.2" />
      <circle cx={c} cy={m} r="3" fill="none" stroke="var(--col-text-2)" strokeWidth="1" />
    </svg>
  );
}

/** The key for the system view of `star`'s system: its scale, what is drawn to scale, and a binary's lines and marks. */
export function SystemKey({ system, star, scale }: { system: PlanetarySystem; star: Star; scale: ViewScale | null }) {
  const companion = star.companion;
  const aroundBoth = system.planets.some((p) => p.orbitsBothStars);
  const aroundOne = system.planets.some((p) => !p.orbitsBothStars);
  const hasMoons = system.planets.some((p) => p.moons.length > 0);
  return (
    <aside className="system-key" aria-label="Key to the system view">
      <ScaleBar scale={scale} />
      <ul className="system-key-notes">
        <li>Orbits to scale; stars, planets and moons drawn enlarged{hasMoons ? ", moon distances compressed" : ""}.</li>
        {companion && <li>A binary's two stars are drawn apart or closer when they would overlap or leave the view.</li>}
        <li>Star colours follow temperature, saturation boosted for legibility.</li>
      </ul>
      {companion && <>
        <div className="system-key-title">Binary · e {companion.eccentricity.toFixed(2)} · fastest at closest approach</div>
        <ul>
          {aroundBoth ? (
            <li>
              <span className="system-key-swatch">
                <LineSwatch colour={starColour(star.temperature)} /><LineSwatch colour={starColour(companion.temperature)} />
              </span>
              Each star's orbit round their centre of mass, in its colour
            </li>
          ) : (
            <li>
              <span className="system-key-swatch"><LineSwatch colour={starColour(companion.temperature)} /></span>
              The companion's orbit round the star
            </li>
          )}
          <li><span className="system-key-swatch"><CentreSwatch /></span>Centre of mass</li>
          {aroundOne && <li><span className="system-key-swatch"><LineSwatch colour="var(--col-text-3)" /></span>A planet orbiting one star</li>}
          {aroundBoth && <li><span className="system-key-swatch"><LineSwatch colour="#8a7f6a" dashed /></span>A planet orbiting both stars</li>}
        </ul>
      </>}
    </aside>
  );
}
