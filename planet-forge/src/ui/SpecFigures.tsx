import type { ReactNode } from "react";
import type { PlanetSpec } from "../spec/schema";
import { figure, surfaceSummary } from "./format";

const colour = ([r, g, b]: readonly number[]) => `${figure(r, 3)}, ${figure(g, 3)}, ${figure(b, 3)}`;

const SOURCE_LABEL: Record<PlanetSpec["source"], string> = {
  "aion-forge": "Aion Forge",
  preset: "Preset",
  custom: "Custom",
};

function Section({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <section className="figures">
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="figure-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A loaded spec's figures, grouped as the spec is. */
export function SpecFigures({ spec }: { spec: PlanetSpec }) {
  const { star, orbit, body, air, surface, groundCover, landing, origin } = spec;
  const s = surfaceSummary(surface.cells);
  const gases = Object.entries(air.gases).sort(([, a], [, b]) => b - a);

  return (
    <div className="spec-figures">
      <Section title="Planet" rows={[
        ["Source", SOURCE_LABEL[spec.source]],
        ...(origin ? [["From", `galaxy ${origin.galaxySeed} · star ${origin.starId} · planet ${origin.planetIndex} · rules v${origin.rulesVersion}`] as [string, ReactNode]] : []),
        ["Seed", spec.seed],
        ["Spec version", spec.specVersion],
      ]} />
      <Section title="Star" rows={[
        ["Temperature", `${figure(star.temperatureK)} K`],
        ["Luminosity", `${figure(star.luminositySolar)} L☉`],
        ["Radius", `${figure(star.radiusSolar)} R☉`],
      ]} />
      <Section title="Orbit" rows={[
        ["Distance", `${figure(orbit.distanceAU)} AU`],
        ["Year", `${figure(orbit.periodYears)} years`],
      ]} />
      <Section title="Body" rows={[
        ["Radius", `${figure(body.radiusEarth)} R⊕`],
        ["Mass", `${figure(body.massEarth)} M⊕`],
        ["Gravity", `${figure(body.gravityG)} g`],
        ["Rotation", body.tidallyLocked ? `locked to its star (${figure(body.rotationHours)} h)` : `${figure(body.rotationHours)} h`],
        ["Axial tilt", `${figure(body.axialTiltDeg)}°`],
      ]} />
      <Section title="Air" rows={[
        ["Pressure", `${figure(air.pressureBar)} bar`],
        ["Gases", gases.length === 0 ? "none" : gases.map(([gas, share]) => `${gas} ${figure(share * 100, 3)}%`).join(" · ")],
        ["Cloud cover", `${figure(air.cloudCover * 100, 3)}%`],
      ]} />
      <Section title="Surface" rows={[
        ["Cells", `${surface.cells.length}: ${s.count.land} land · ${s.count.water} water · ${s.count.ice} ice`],
        ["Heights", `${figure(s.lowKm, 3)} to ${figure(s.highKm, 3)} km; sea level ${figure(surface.seaLevelKm, 3)} km`],
        ["Temperatures", `${figure(s.coldK)} to ${figure(s.warmK)} K`],
        ["Water", `freezes at ${figure(surface.freezingK, 5)} K, boils at ${figure(surface.boilingK, 5)} K${surface.steam ? "; the oceans are steam" : ""}`],
      ]} />
      {groundCover && (
        <Section title="Ground cover" rows={[
          ["Cover", `${figure(groundCover.cover * 100, 3)}%`],
          ["Colour (linear)", colour(groundCover.colourLinear)],
        ]} />
      )}
      {landing && (
        <Section title="Landing site" rows={[
          ["Site", `${figure(landing.latitudeDeg, 3)}°, ${figure(landing.longitudeDeg, 3)}°`],
          ["Star overhead at", `${figure(landing.subsolar.latitudeDeg, 3)}°, ${figure(landing.subsolar.longitudeDeg, 3)}°`],
          ...(landing.observed ? [
            ["Seen from orbit", `${landing.observed.kind}${landing.observed.vegetated ? ", vegetated" : ""}, ${figure(landing.observed.heightKm, 3)} km`],
            ["Colour (linear)", colour(landing.observed.colourLinear)],
          ] as [string, ReactNode][] : []),
        ]} />
      )}
    </div>
  );
}
