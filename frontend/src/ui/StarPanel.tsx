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
    <div className="star-panel">
      <div className="star-panel-header">
        <div className="star-dot" style={{ background: starColor, boxShadow: `0 0 8px ${starColor}` }} />
        <div className="star-panel-title">
          <span className="star-id">STAR #{star.id.toString().padStart(4, "0")}</span>
          {star.isRare && <span className="star-rare">RARE</span>}
        </div>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="star-class">{CLASS_LABEL[star.classification]}</div>

      <div className="star-stats">
        <Row label="MASS"        value={`${fmt(star.mass)} M☉`} />
        <Row label="AGE"         value={`${fmt(star.age, 1)} Gyr`} />
        <Row label="LIFESPAN"    value={`${fmt(star.lifespan, 1)} Gyr`} />
        <Row label="TEMPERATURE" value={star.temperature > 0 ? `${fmt(star.temperature, 0)} K` : "—"} />
        <Row label="LUMINOSITY"  value={star.luminosity > 0 ? `${fmt(star.luminosity, 2)} L☉` : "—"} />
      </div>

      <div className="panel-actions">
        <button
          className="btn primary bookmark-btn"
          onClick={onExplore}
          disabled={!canExplore}
          title={canExplore ? undefined : "No planetary system possible"}
        >
          EXPLORE SYSTEM →
        </button>
        <button className={`btn bookmark-btn ${bookmarked ? "bookmarked" : ""}`} onClick={toggleBookmark}>
          {bookmarked ? "★" : "☆"}
        </button>
        {onSaveDiscovery && star.isRare && (
          <button
            className="btn bookmark-btn"
            title="Add to Favorite Stars collection"
            onClick={() => onSaveDiscovery({
              id: `star-${galaxySeed}-${star.id}`,
              category: "favorite-stars",
              universeSeed: galaxySeed,
              subjectId: `star-${star.id}`,
              label: `STAR #${star.id.toString().padStart(4, "0")}`,
              description: `${star.classification.replace("-", " ")} — ${star.mass.toFixed(2)} M☉, ${Math.round(star.temperature)} K`,
              savedAt: Date.now(),
            })}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </>
  );
}
