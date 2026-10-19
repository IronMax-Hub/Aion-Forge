import { useState } from "react";
import type { ReactNode } from "react";
import type { Star } from "../simulation/star";
import { starDisplayCss } from "../rendering/starColour";
import type { DiscoveryItem } from "../simulation/persistence";
import { formatCompanion, formatSig, formatInt, formatGyr, formatLightYears, formatMetallicity, spectralType, starName, STELLAR_CLASS_NAME, LIGHT_YEARS_PER_UNIT } from "./format";
import { InspectorTabs } from "./InspectorTabs";

interface Props {
  star: Star;
  galaxySeed: number;
  onClose: () => void;
  onExplore: () => void;
  onSaveDiscovery?: (item: DiscoveryItem) => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  /** The star's encyclopedia entry (EN3), shown in the Entry tab. */
  entryView: ReactNode;
}

type Tab = "overview" | "entry";
const TABS: { id: Tab; label: string }[] = [{ id: "overview", label: "Overview" }, { id: "entry", label: "Entry" }];


const CAN_HAVE_PLANETS: Record<string, boolean> = {
  protostar: true, "main-sequence": true, "red-giant": true,
  "white-dwarf": true, "neutron-star": false, "black-hole": false,
};

export function StarPanel({ star, galaxySeed, onClose, onExplore, onSaveDiscovery, bookmarked, onToggleBookmark, entryView }: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  const starColor  = starDisplayCss(star.temperature);
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

      <InspectorTabs id="star" label="Star views" tabs={TABS} tab={tab} onTab={setTab} />
      {tab === "entry" ? (
        <div className="inspector-body" role="tabpanel" id="star-tab-panel" aria-labelledby="star-tab-entry">{entryView}</div>
      ) : <div className="inspector-body" role="tabpanel" id="star-tab-panel" aria-labelledby="star-tab-overview">
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
            <span className="data-label">[Fe/H]</span>
            <span className="data-value">{formatMetallicity(star.metallicity)}</span>
            {star.companion && <>
              <span className="data-label">Binary</span>
              <span className="data-value data-text">companion {formatCompanion(star.companion)}</span>
            </>}
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
            onClick={onToggleBookmark}
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
      </div>}
    </div>
  );
}
