import { useMemo } from "react";
import type { Star } from "../simulation/star";
import { generateBiosphere } from "../simulation/biosphere";
import type { PlanetarySystem, Planet } from "../simulation/planet";
import { formatSig, formatInt, formatIndex, planetName, planetLifeLabel, starName, spectralType, PLANET_TYPE_LABEL } from "./format";

interface Props {
  system: PlanetarySystem;
  star: Star;
  onSelectPlanet: (planet: Planet) => void;
}

/** Overview of a planetary system: one row per planet, innermost first. */
export function SystemPanel({ system, star, onSelectPlanet }: Props) {
  const spectral = spectralType(star.temperature, star.classification);
  const count = system.planets.length;
  // Each planet's life, read from its world history (generateBiosphere draws nothing); shown under its type
  const lifeLabels = useMemo(
    () => new Map(system.planets.map((planet) => [planet.id, planetLifeLabel(generateBiosphere(planet, star))])),
    [system, star],
  );

  return (
    <div className="inspector" role="region" aria-label={`${starName(star.id)} system`}>
      <div className="inspector-header">
        <div className="inspector-title-block">
          <span className="inspector-id">{starName(star.id)} system</span>
          <span className="inspector-subtitle">
            {count} {count === 1 ? "planet" : "planets"} · host {spectral ?? "remnant"}, {formatSig(star.luminosity)} L☉
          </span>
        </div>
      </div>

      {count === 0 ? (
        <div className="inspector-body">
          <p className="dock-empty-body">No planets formed around this star.</p>
        </div>
      ) : (
        <table className="system-table">
          <thead>
            <tr>
              <th scope="col">Planet</th>
              <th scope="col">Type</th>
              <th scope="col" className="num">a (AU)</th>
              <th scope="col" className="num">T (K)</th>
              <th scope="col" className="num">Hab.</th>
            </tr>
          </thead>
          <tbody>
            {system.planets.map((planet) => (
              <tr key={planet.id}>
                <th scope="row">
                  <button className="system-table-link" onClick={() => onSelectPlanet(planet)}>
                    {planetName(planet.hostStarId, planet.orbitalIndex)}
                  </button>
                </th>
                <td>
                  {PLANET_TYPE_LABEL[planet.type]}
                  {lifeLabels.get(planet.id) !== "—" && (
                    <span className={`system-table-life${lifeLabels.get(planet.id) === "Extinct" ? " extinct" : ""}`}>
                      {lifeLabels.get(planet.id)} life
                    </span>
                  )}
                </td>
                <td className="num">{formatSig(planet.orbitalRadius)}</td>
                <td className="num">{formatInt(planet.temperature)}</td>
                <td className="num">{formatIndex(planet.habitabilityScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {count > 0 && <p className="system-table-hint">Select a planet in the table or in the view to inspect it.</p>}
    </div>
  );
}
