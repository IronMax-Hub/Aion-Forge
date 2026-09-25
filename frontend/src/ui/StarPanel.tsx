import { useState } from "react";
import type { Star } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";
import { bookmarkStar, removeBookmark, isBookmarked } from "../simulation/journal";
import type { DiscoveryItem } from "../simulation/persistence";
import { formatSig, formatInt, formatGyr, formatLightYears, spectralType, starName, STELLAR_CLASS_NAME, LIGHT_YEARS_PER_UNIT } from "./format";

interface Props {
  star: Star;
  galaxySeed: number;
  onClose: () => void;
  onExplore: () => void;
  onSaveDiscovery?: (item: DiscoveryItem) => void;
}

const CAN_HAVE_PLANETS: Record<string, boolean> = {
  protostar: true, "main-sequence": true, "red-giant": true,
  "white-dwarf": true, "neutron-star": false, "black-hole": false,
};

export function StarPanel({ star, galaxySeed, onClose, onExplore, onSaveDiscovery }: Props) {
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(star.id, galaxySeed));

  const toggleBookmark = () => {
    if (bookmarked) { removeBookmark(star.id, galaxySeed); setBookmarked(false); }
    else            { bookmarkStar(star, galaxySeed);      setBookmarked(true);  }
  };

  const [r, g, b] = temperatureToColor(star.temperature);
  const starColor  = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  const canExplore = CAN_HAVE_PLANETS[star.classification];
  const spectral   = spectralType(star.temperature, star.classification);
  const subtitle   = spectral ? `${spectral} · ${STELLAR_CLASS_NAME[star.classification]}` : STELLAR_CLASS_NAME[star.classification];
  const lifeUsed   = Math.min(1, star.age / star.lifespan);
  const [x, y, z]  = star.position;
  const galactocentricLy = Math.sqrt(x * x + z * z) * LIGHT_YEARS_PER_UNIT;
  const discHeightLy     = Math.abs(y) * LIGHT_YEARS_PER_UNIT;

  return (
    <div className="inspector" role="dialog" aria-label={`Star ${star.id} details`}>
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: starColor }} />
        <div className="inspector-title-block">
          <span className="inspector-id">{starName(star.id)}</span>
          <span className="inspector-subtitle">{subtitle}</span>
        </div>
        {star.isRare && <span className="inspector-badge">Rare</span>}
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
        <div className="inspector-section">
          <div className="section-title">Physical properties</div>
          <div className="data-grid">
            <span className="data-label">Mass</span>
            <span className="data-value">{formatSig(star.mass)} M☉</span>
            <span className="data-label">Luminosity</span>
            <span className="data-value">{star.luminosity > 0 ? `${formatSig(star.luminosity)} L☉` : "—"}</span>
            <span className="data-label">Effective temperature</span>
            <span className="data-value">{star.temperature > 0 ? `${formatInt(star.temperature)} K` : "—"}</span>
            <span className="data-label">Age</span>
            <span className="data-value">{formatGyr(star.age)}</span>
            <span className="data-label">Lifetime</span>
            <span className="data-value">{formatGyr(star.lifespan)}</span>
          </div>
        </div>

        <div className="inspector-section">
          <div className="section-head">
            <span className="section-title">Evolutionary state</span>
            <span className="section-note">{Math.round(lifeUsed * 100)}% of lifetime</span>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lifeUsed * 100)} aria-label="Share of lifetime elapsed">
            <div className="progress-fill" style={{ width: `${lifeUsed * 100}%` }} />
          </div>
          <div className="progress-scale"><span>Formation</span><span>End of life</span></div>
        </div>

        <div className="inspector-section">
          <div className="section-title">Location</div>
          <div className="data-grid">
            <span className="data-label">Distance from galactic centre</span>
            <span className="data-value">{formatLightYears(galactocentricLy)}</span>
            <span className="data-label">Height above disc plane</span>
            <span className="data-value">{formatLightYears(discHeightLy)}</span>
          </div>
        </div>

        <div className="inspector-actions">
          <button
            className="btn primary"
            onClick={onExplore}
            disabled={!canExplore}
            title={canExplore ? undefined : "No planetary system possible"}
            style={{ flex: 1 }}
          >
            Open system
          </button>
          <button
            className={`inspector-btn${bookmarked ? " bookmarked" : ""}`}
            onClick={toggleBookmark}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark star"}
          >
            {bookmarked ? "★" : "☆"}
          </button>
          {onSaveDiscovery && star.isRare && (
            <button
              className="inspector-btn"
              title="Save to discoveries"
              onClick={() => onSaveDiscovery({
                id: `star-${galaxySeed}-${star.id}`,
                category: "favorite-stars",
                universeSeed: galaxySeed,
                subjectId: `star-${star.id}`,
                label: starName(star.id),
                description: `${subtitle} — ${formatSig(star.mass)} M☉, ${formatInt(star.temperature)} K`,
                savedAt: Date.now(),
              })}
            >
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
