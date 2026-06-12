import { useState, useEffect } from "react";
import type { Star } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";
import { bookmarkStar, removeBookmark, isBookmarked } from "../simulation/journal";

interface Props {
  star: Star;
  galaxySeed: number;
  onClose: () => void;
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

export function StarPanel({ star, galaxySeed, onClose }: Props) {
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(star.id, galaxySeed));

  useEffect(() => {
    setBookmarked(isBookmarked(star.id, galaxySeed));
  }, [star.id, galaxySeed]);

  const toggleBookmark = () => {
    if (bookmarked) {
      removeBookmark(star.id, galaxySeed);
      setBookmarked(false);
    } else {
      bookmarkStar(star, galaxySeed);
      setBookmarked(true);
    }
  };

  const [r, g, b] = temperatureToColor(star.temperature);
  const starColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

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

      <button className={`btn bookmark-btn ${bookmarked ? "bookmarked" : ""}`} onClick={toggleBookmark}>
        {bookmarked ? "★ BOOKMARKED" : "☆ BOOKMARK"}
      </button>
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
