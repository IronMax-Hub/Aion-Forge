import { useMemo, useState } from "react";
import type { Planet } from "../simulation/planet";
import type { Star } from "../simulation/star";
import type { Civilization } from "../simulation/civilization";
import type { DiscoveryItem } from "../simulation/persistence";
import { atmosphereComposition } from "../simulation/atmosphereComposition";
import { transitSpectrum } from "../simulation/spectrum";
import { observeTransits, MIN_TRANSITS, MAX_TRANSITS } from "../simulation/observation";
import { detectGases, DETECTION_SIGMA, VERDICT_LABEL } from "../simulation/detection";
import type { Verdict } from "../simulation/detection";
import {
  CHART, PLOT_HEIGHT, PLOT_WIDTH, GAS_LABEL, xOf, yOf, wavelengthTicks, depthTicks, depthUnit, displayPoints, depthRange,
  bandLabels, formatSigma,
} from "./spectrumChart";
import { planetName } from "./format";

// The Spectrum tab of the planet panel (Worlds Up Close, phase B5): the
// planet's transit spectrum as a telescope records it, what each gas's
// significance is, and what the data support. Presentation only.

interface Props {
  planet: Planet;
  star: Star;
  galaxySeed: number;
  /** The planet's civilization, whose gases its air carries; null if none. */
  civilization: Civilization | null;
  discoveries: DiscoveryItem[];
  onSaveDiscovery?: (item: DiscoveryItem) => void;
}

const DEFAULT_TRANSITS = 10;
/** A transit this deep hides the whole star. */
const FULL_COVER_PPM = 1e6;
const LABEL_ROW_HEIGHT = 13;

/** Verdicts a universe can record once, as a discovery: the first of each. */
const RECORDABLE: Partial<Record<Verdict, DiscoveryItem["category"]>> = {
  "strong-biosignature": "remarkable-worlds",
  technosignature: "extraordinary-civilizations",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  technosignature: "techno",
  "strong-biosignature": "strong",
  "possible-biosignature": "possible",
  ambiguous: "ambiguous",
  atmosphere: "plain",
  none: "plain",
};

export function SpectrumPanel({ planet, star, galaxySeed, civilization, discoveries, onSaveDiscovery }: Props) {
  const [transits, setTransits] = useState(DEFAULT_TRANSITS);

  const composition = useMemo(() => atmosphereComposition(planet, civilization), [planet, civilization]);
  const spectrum = useMemo(() => transitSpectrum(planet, star, composition), [planet, star, composition]);
  const observation = useMemo(
    () => observeTransits(spectrum, planet, star, galaxySeed, transits), [spectrum, planet, star, galaxySeed, transits]);
  const detection = useMemo(
    () => detectGases(observation, planet, star, composition), [observation, planet, star, composition]);

  const points = useMemo(
    () => displayPoints(observation.wavelengthUm, observation.depthPpm, observation.uncertaintyPpm, spectrum.depthPpm),
    [observation, spectrum]);
  const range = useMemo(() => depthRange(points), [points]);
  const detected = detection.gases.filter((g) => g.sigma >= DETECTION_SIGMA).map((g) => g.gas);
  const labels = bandLabels(detected);

  const pin = (depth: number) => Math.min(range[1], Math.max(range[0], depth));
  const outside = (depth: number) => depth < range[0] || depth > range[1];
  const anyOutside = points.some((p) => outside(p.depthPpm));
  const plotBottom = CHART.top + PLOT_HEIGHT;
  const modelPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.wavelengthUm).toFixed(1)},${yOf(p.modelPpm, range).toFixed(1)}`).join("");

  // The first of each recordable verdict in a universe can be saved; its id names the universe and the verdict
  const category = RECORDABLE[detection.verdict];
  const discoveryId = `spectrum-${galaxySeed}-${detection.verdict}`;
  const recorded = discoveries.find((d) => d.id === discoveryId);

  return (
    <div className="spectrum">
      <svg
        className="spectrum-chart"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={`Transit spectrum after ${transits} transits: transit depth against wavelength in micrometres`}
      >
        <rect className="spectrum-frame" x={CHART.left} y={CHART.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} />
        {depthTicks(range).map((tick) => (
          <g key={`y${tick.value}`}>
            <line className="spectrum-grid" x1={CHART.left} x2={CHART.left + PLOT_WIDTH} y1={tick.at} y2={tick.at} />
            <text className="spectrum-tick" x={CHART.left - 3} y={tick.at} textAnchor="end" dominantBaseline="middle">{tick.label}</text>
          </g>
        ))}
        {wavelengthTicks().map((tick) => (
          <g key={`x${tick.value}`}>
            <line className="spectrum-grid" x1={tick.at} x2={tick.at} y1={CHART.top} y2={plotBottom} />
            <text className="spectrum-tick" x={tick.at} y={plotBottom + 10} textAnchor="middle">{tick.label}</text>
          </g>
        ))}
        <text className="spectrum-axis" x={CHART.left + PLOT_WIDTH} y={CHART.height - 1} textAnchor="end">µm</text>
        <text className="spectrum-axis" x={2} y={CHART.top - 14}>{depthUnit(range).label}</text>

        {labels.map((band) => (
          <g key={`${band.gas}${band.centreUm}`}>
            <line className="spectrum-band" x1={band.x} x2={band.x} y1={CHART.top} y2={plotBottom} />
            <text className="spectrum-band-label" x={band.x} y={CHART.top - 5 - band.row * LABEL_ROW_HEIGHT} textAnchor="middle">
              {band.label}
            </text>
          </g>
        ))}

        <path className="spectrum-model" d={modelPath} />
        {points.map((p) => {
          const x = xOf(p.wavelengthUm);
          return (
            <g key={p.wavelengthUm}>
              <line className="spectrum-error" x1={x} x2={x}
                y1={yOf(pin(p.depthPpm - p.uncertaintyPpm), range)} y2={yOf(pin(p.depthPpm + p.uncertaintyPpm), range)} />
              <circle className={`spectrum-point${outside(p.depthPpm) ? " pinned" : ""}`} cx={x} cy={yOf(pin(p.depthPpm), range)} r={1.6} />
            </g>
          );
        })}
      </svg>

      <div className="spectrum-legend">
        <span><span className="spectrum-key-point" aria-hidden="true" /> Data, 1σ</span>
        <span><span className="spectrum-key-model" aria-hidden="true" /> Model</span>
        {anyOutside && <span><span className="spectrum-key-pinned" aria-hidden="true" /> Beyond the frame</span>}
        {labels.length > 0 && <span><span className="spectrum-key-band" aria-hidden="true" /> Detected band</span>}
      </div>

      <div className="inspector-section">
        <div className="section-head">
          <label className="section-title" htmlFor="spectrum-transits">Transits observed</label>
          <span className="section-note">{transits}</span>
        </div>
        <input
          id="spectrum-transits"
          type="range"
          min={MIN_TRANSITS}
          max={MAX_TRANSITS}
          step={1}
          value={transits}
          className="config-slider"
          onChange={(e) => setTransits(parseInt(e.target.value, 10))}
        />
      </div>

      <div className="inspector-section">
        <div className="section-head">
          <div className="section-title">Detection</div>
          <span className="section-note">≥ {DETECTION_SIGMA}σ</span>
        </div>
        {detection.gases.length === 0
          ? <div className="spectrum-empty">No gas with absorption bands in this air</div>
          : (
            <div className="data-grid">
              {detection.gases.map(({ gas, sigma }) => (
                <div className="spectrum-row" key={gas} data-detected={sigma >= DETECTION_SIGMA}>
                  <span className="data-label">{GAS_LABEL[gas]}</span>
                  <span className="data-value">{formatSigma(sigma)}σ</span>
                </div>
              ))}
            </div>
          )}
      </div>

      {spectrum.baselinePpm >= FULL_COVER_PPM && (
        <div className="spectrum-recorded">The planet is as large as its star and hides all of it: no starlight passes through its air.</div>
      )}

      <div className={`spectrum-verdict ${VERDICT_CLASS[detection.verdict]}`} role="status">
        {VERDICT_LABEL[detection.verdict]}
      </div>

      {category && onSaveDiscovery && (
        recorded
          ? <div className="spectrum-recorded">
              {recorded.subjectId === planet.key
                ? "Recorded as this universe's first."
                : `This universe's first was ${recorded.label}.`}
            </div>
          : <button
              className="btn primary full"
              onClick={() => onSaveDiscovery({
                id: discoveryId,
                category,
                universeSeed: galaxySeed,
                subjectId: planet.key,
                label: planetName(planet.hostStarId, planet.orbitalIndex),
                description: `${VERDICT_LABEL[detection.verdict]} after ${transits} transits: `
                  + detected.map((gas) => `${GAS_LABEL[gas]} ${formatSigma(detection.gases.find((g) => g.gas === gas)!.sigma)}σ`).join(", "),
                savedAt: Date.now(),
              })}
            >
              Record as this universe's first
            </button>
      )}
    </div>
  );
}
