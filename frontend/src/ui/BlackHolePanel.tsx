import type { CentralBlackHole } from "../simulation/blackHole";
import { eventHorizonRadiusKm, SAGITTARIUS_A_STAR_SOLAR } from "../simulation/blackHole";
import { formatHorizonRadius, formatInt, formatSig, formatSolarMasses } from "./format";

interface Props {
  blackHole: CentralBlackHole;
  /** Whether the view is in its close-up. */
  near: boolean;
  onApproach: () => void;
  onLeave: () => void;
  onClose: () => void;
}

const SURROUNDINGS: Record<CentralBlackHole["accretionMode"], string> = {
  "thin-disc": "Thin disc",
  "hot-flow":  "Faint hot flow",
};

const KIND_NAME: Record<CentralBlackHole["kind"], string> = {
  supermassive: "Supermassive black hole",
  "intermediate-mass": "Intermediate-mass black hole",
};

/** The galaxy's central black hole: its mass, its event horizon, and how it compares with the Milky Way's. */
export function BlackHolePanel({ blackHole, near, onApproach, onLeave, onClose }: Props) {
  const ratio = blackHole.massSolar / SAGITTARIUS_A_STAR_SOLAR;
  return (
    <div className="inspector" role="dialog" aria-label="Central black hole details">
      <div className="inspector-header">
        <div className="inspector-dot black-hole-dot" />
        <div className="inspector-title-block">
          <span className="inspector-id">Central black hole</span>
          <span className="inspector-subtitle">{KIND_NAME[blackHole.kind]}</span>
        </div>
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
        <div className="inspector-section">
          <div className="section-title">Physical properties</div>
          <div className="data-grid">
            <span className="data-label">Mass</span>
            <span className="data-value">{formatSolarMasses(blackHole.massSolar)}</span>
            <span className="data-label">Horizon radius</span>
            <span className="data-value">{formatHorizonRadius(eventHorizonRadiusKm(blackHole))}</span>
            <span className="data-label">Feeding rate</span>
            <span className="data-value data-text">{formatSig(blackHole.eddingtonRatio, 2)} × Eddington</span>
            <span className="data-label">Surroundings</span>
            <span className="data-value data-text">{SURROUNDINGS[blackHole.accretionMode]}</span>
            {blackHole.accretionMode === "thin-disc" && <>
              <span className="data-label">Disc's inner edge</span>
              <span className="data-value">{formatInt(blackHole.discPeakTemperatureK)} K</span>
            </>}
            <span className="data-label">vs Sagittarius A*</span>
            <span className="data-value">{ratio >= 1 ? `${formatSig(ratio, 2)}× heavier` : `${formatSig(1 / ratio, 2)}× lighter`}</span>
          </div>
        </div>
        <div className="inspector-section">
          <p className="dock-empty-body">
            {near
              ? blackHole.accretionMode === "thin-disc"
                ? "Light from the far side of the disc is bent over and under the shadow; the side turning towards you is brighter and bluer."
                : "It feeds too slowly for its gas to settle into a disc: a faint, hot cloud, drawn in false colour as radio images are. Light circling the shadow makes the ring."
              : "It sits at the galaxy's centre, hidden in its bright core: at this scale its horizon is far too small to see."}
          </p>
        </div>

        <div className="inspector-actions">
          <button className="btn primary" onClick={near ? onLeave : onApproach} style={{ flex: 1 }}>
            {near ? "Back to galaxy" : "Approach"}
          </button>
        </div>
      </div>
    </div>
  );
}
