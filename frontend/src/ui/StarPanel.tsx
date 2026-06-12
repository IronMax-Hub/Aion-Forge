import { useState, useEffect } from "react";
import type { Star } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";
import { bookmarkStar, removeBookmark, isBookmarked } from "../simulation/journal";
import type { DiscoveryItem } from "../simulation/persistence";

interface Props {
  star: Star;
  galaxySeed: number;
  onClose: () => void;
  onExplore: () => void;
  onSaveDiscovery?: (item: DiscoveryItem) => void;
}

const CLASS_LABEL: Record<string, string> = {
  protostar:        "Protostar",
  "main-sequence":  "Main Sequence",
  "red-giant":      "Red Giant",
  "white-dwarf":    "White Dwarf",
  "neutron-star":   "Neutron Star",
  "black-hole":     "Black Hole",
};

function fmt(n: number, decimals = 2) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return n.toFixed(decimals);
}

const CAN_HAVE_PLANETS: Record<string, boolean> = {
  protostar: true, "main-sequence": true, "red-giant": true,
  "white-dwarf": true, "neutron-star": false, "black-hole": false,
};

export function StarPanel({ star, galaxySeed, onClose, onExplore, onSaveDiscovery }: Props) {
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(star.id, galaxySeed));

  useEffect(() => {
    setBookmarked(isBookmarked(star.id, galaxySeed));
  }, [star.id, galaxySeed]);

  const toggleBookmark = () => {
    if (bookmarked) { removeBookmark(star.id, galaxySeed); setBookmarked(false); }
    else            { bookmarkStar(star, galaxySeed);      setBookmarked(true);  }
  };

  const [r, g, b] = temperatureToColor(star.temperature);
  const starColor  = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  const canExplore = CAN_HAVE_PLANETS[star.classification];

  return (
    <div className="inspector" role="dialog" aria-label={`Star ${star.id} details`}>
      <div className="inspector-header">
        <div className="inspector-dot" style={{ background: starColor, boxShadow: `0 0 8px ${starColor}` }} />
        <div className="inspector-title-block">
          <span className="inspector-id">Star #{star.id.toString().padStart(4, "0")}</span>
          <span className="inspector-subtitle">{CLASS_LABEL[star.classification]}</span>
        </div>
        {star.isRare && <span className="inspector-badge">Rare</span>}
        <div className="inspector-controls">
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="inspector-body">
        <div className="data-grid">
          <span className="data-label">Mass</span>
          <span className="data-value">{fmt(star.mass)} M☉</span>
          <span className="data-label">Age</span>
          <span className="data-value">{fmt(star.age, 1)} Gyr</span>
          <span className="data-label">Lifespan</span>
          <span className="data-value">{fmt(star.lifespan, 1)} Gyr</span>
          <span className="data-label">Temperature</span>
          <span className="data-value">{star.temperature > 0 ? `${fmt(star.temperature, 0)} K` : "—"}</span>
          <span className="data-label">Luminosity</span>
          <span className="data-value">{star.luminosity > 0 ? `${fmt(star.luminosity, 2)} L☉` : "—"}</span>
        </div>

        <div className="inspector-actions">
          <button
            className="btn primary"
            onClick={onExplore}
            disabled={!canExplore}
            title={canExplore ? undefined : "No planetary system possible"}
            style={{ flex: 1 }}
          >
            Explore System →
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
                label: `Star #${star.id.toString().padStart(4, "0")}`,
                description: `${star.classification.replace("-", " ")} — ${star.mass.toFixed(2)} M☉, ${Math.round(star.temperature)} K`,
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
