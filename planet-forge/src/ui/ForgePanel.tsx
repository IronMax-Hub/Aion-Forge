import { useState } from "react";
import type { SketchInputs } from "../forge/inputs";
import { derivedFigures, inputProblems } from "../forge/inputs";
import { PRESETS } from "../forge/presets";
import { NumberField } from "./NumberField";
import { hexToLinear, linearToHex } from "./colour";
import { figure, years } from "./format";

interface Props {
  /** Forge from a preset, unchanged (its committed spec), or from your own inputs. */
  onForge: (forge: { presetId: string } | { inputs: SketchInputs }) => void;
}

const GAS_LABELS: [keyof SketchInputs["air"]["gases"], string][] = [
  ["N2", "N₂"], ["O2", "O₂"], ["CO2", "CO₂"], ["CH4", "CH₄"], ["H2O", "H₂O"],
];
const DEFAULT_GROUND_COLOUR: [number, number, number] = [0.05, 0.12, 0.03];
const MAX_SEED = 2 ** 32;

/** The "Forge a planet" panel: presets, the inputs, and the figures that follow from them. */
export function ForgePanel({ onForge }: Props) {
  const [inputs, setInputs] = useState<SketchInputs>(() => structuredClone(PRESETS[0].inputs));
  // The preset the inputs are, until they are changed
  const [presetId, setPresetId] = useState<string | null>(PRESETS[0].id);
  const f = derivedFigures(inputs);
  const problems = inputProblems(inputs);

  const edit = (change: (draft: SketchInputs) => void) => {
    setInputs((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
    setPresetId(null);
  };

  const pick = (id: string) => {
    setInputs(structuredClone(PRESETS.find((p) => p.id === id)!.inputs));
    setPresetId(id);
  };

  const forge = () => onForge(presetId ? { presetId } : { inputs });

  return (
    <section className="forge-panel" aria-label="Forge a planet">
      <h2>Forge a planet</h2>

      <div className="presets" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`preset${presetId === p.id ? " selected" : ""}`} aria-pressed={presetId === p.id}
            onClick={() => pick(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted small">{presetId ? "A preset, unchanged." : "Your own planet: a change to any input makes it custom."}</p>

      <fieldset>
        <legend>Planet</legend>
        <label className="field">
          <span className="field-label">Name</span>
          <span className="field-input"><input type="text" value={inputs.name} onChange={(e) => edit((d) => { d.name = e.target.value; })} /></span>
        </label>
        <div className="field-row">
          <NumberField label="Seed" value={inputs.seed} min={0} step={1} onChange={(v) => edit((d) => { d.seed = Math.max(0, Math.floor(v)) % MAX_SEED; })} />
          {/* A random seed is an input; the planet built from it is deterministic */}
          <button className="secondary" onClick={() => edit((d) => { d.seed = Math.floor(Math.random() * MAX_SEED); })}>Random</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Star</legend>
        <NumberField label="Temperature" unit="K" value={inputs.star.temperatureK} min={1} onChange={(v) => edit((d) => { d.star.temperatureK = v; })} />
        <NumberField label="Luminosity" unit="L☉" value={inputs.star.luminositySolar} min={0} onChange={(v) => edit((d) => { d.star.luminositySolar = v; })} />
        <p className="derived">Radius {figure(f.starRadiusSolar, 3)} R☉ · mass ≈ {figure(f.starMassSolar, 3)} M☉ (main-sequence estimate)</p>
      </fieldset>

      <fieldset>
        <legend>Orbit and body</legend>
        <NumberField label="Distance" unit="AU" value={inputs.orbit.distanceAU} min={0} onChange={(v) => edit((d) => { d.orbit.distanceAU = v; })} />
        <NumberField label="Radius" unit="R⊕" value={inputs.body.radiusEarth} min={0} onChange={(v) => edit((d) => { d.body.radiusEarth = v; })} />
        <NumberField label="Mass" unit="M⊕" value={inputs.body.massEarth} min={0} onChange={(v) => edit((d) => { d.body.massEarth = v; })} />
        <label className="field check">
          <input type="checkbox" checked={inputs.body.tidallyLocked} onChange={(e) => edit((d) => { d.body.tidallyLocked = e.target.checked; })} />
          <span>Tidally locked: one face always to the star</span>
        </label>
        <NumberField label="Day length" unit="h" value={inputs.body.rotationHours} min={0} disabled={inputs.body.tidallyLocked}
          onChange={(v) => edit((d) => { d.body.rotationHours = v; })} />
        <NumberField label="Axial tilt" unit="°" value={inputs.body.axialTiltDeg} min={0} max={180} onChange={(v) => edit((d) => { d.body.axialTiltDeg = v; })} />
        <p className="derived">Year {years(f.periodYears, 3)} · gravity {figure(f.gravityG, 3)} g</p>
      </fieldset>

      <fieldset>
        <legend>Air</legend>
        <NumberField label="Pressure" unit="bar" value={inputs.air.pressureBar} min={0} onChange={(v) => edit((d) => { d.air.pressureBar = v; })} />
        <div className="gases">
          {GAS_LABELS.map(([gas, label]) => (
            <NumberField key={gas} label={label} value={inputs.air.gases[gas]} min={0} onChange={(v) => edit((d) => { d.air.gases[gas] = v; })} />
          ))}
        </div>
        <p className="muted small">Gases in relative amounts; they are scaled to add up to 100%.</p>
        <NumberField label="Ozone" unit="ppm" value={inputs.air.ozonePpm} min={0} onChange={(v) => edit((d) => { d.air.ozonePpm = v; })} />
        <NumberField label="Cloud cover" unit="0–1" value={inputs.air.cloudCover} min={0} max={1} onChange={(v) => edit((d) => { d.air.cloudCover = v; })} />
        <p className="derived">Water boils at {figure(f.boilingK, 4)} K under this air</p>
      </fieldset>

      <fieldset>
        <legend>Surface</legend>
        <NumberField label="Ocean" unit="0–1" value={inputs.surface.oceanShare} min={0} max={1} onChange={(v) => edit((d) => { d.surface.oceanShare = v; })} />
        <NumberField label="Mean temperature" unit="K" value={inputs.surface.meanTemperatureK} min={1} onChange={(v) => edit((d) => { d.surface.meanTemperatureK = v; })} />
        <p className="derived">With no greenhouse, this star would hold the planet near {figure(f.equilibriumK, 3)} K (reflecting 30% of its light); air can make it much warmer.</p>
        <NumberField label="Relief at 1 g" unit="km" value={inputs.surface.reliefKm} min={0} onChange={(v) => edit((d) => { d.surface.reliefKm = v; })} />
      </fieldset>

      <fieldset>
        <legend>Ground cover</legend>
        <label className="field check">
          <input type="checkbox" checked={!!inputs.groundCover} onChange={(e) => edit((d) => {
            d.groundCover = e.target.checked ? { cover: 0.5, colourLinear: DEFAULT_GROUND_COLOUR } : undefined;
          })} />
          <span>Life tints the ground</span>
        </label>
        {inputs.groundCover && (
          <>
            <NumberField label="Cover" unit="0–1" value={inputs.groundCover.cover} min={0} max={1} onChange={(v) => edit((d) => { d.groundCover!.cover = v; })} />
            <label className="field">
              <span className="field-label">Colour</span>
              <span className="field-input">
                <input type="color" value={linearToHex(inputs.groundCover.colourLinear)}
                  onChange={(e) => edit((d) => { d.groundCover!.colourLinear = hexToLinear(e.target.value); })} />
              </span>
            </label>
          </>
        )}
      </fieldset>

      <button className="primary forge-button" onClick={forge} disabled={problems.length > 0}>Forge</button>
      {problems.length > 0 && (
        <ul className="problems" role="status">{problems.map((p) => <li key={p}>{p[0].toUpperCase() + p.slice(1)}.</li>)}</ul>
      )}
    </section>
  );
}
