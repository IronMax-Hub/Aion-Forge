import { useState } from "react";
import type { UniverseMeta, DiscoveryItem } from "../simulation/persistence";
import {
  removeFromGallery, toggleFavorite, exportUniverse,
  getFeaturedUniverses, COLLECTION_LABEL, removeDiscovery,
  saveToGallery,
} from "../simulation/persistence";

interface Props {
  gallery: UniverseMeta[];
  discoveries: DiscoveryItem[];
  onLoad: (meta: UniverseMeta) => void;
  onGalleryChange: () => void;
  onClose: () => void;
}

type Tab = "gallery" | "featured" | "discoveries";

function timeSince(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function GalleryPanel({ gallery, discoveries, onLoad, onGalleryChange, onClose }: Props) {
  const [tab, setTab]   = useState<Tab>("gallery");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const featured = getFeaturedUniverses(gallery);

  function handleToggleFavorite(id: string) {
    toggleFavorite(id);
    onGalleryChange();
  }

  function handleRemove(id: string) {
    removeFromGallery(id);
    onGalleryChange();
  }

  function handleExport(meta: UniverseMeta) {
    exportUniverse(meta);
  }

  const displayList = tab === "featured" ? featured : gallery;

  return (
    <div className="timeline-panel gallery-panel" role="dialog" aria-label="Universe gallery">
      <div className="timeline-header">
        <span className="hud-title" style={{ fontSize: 10, marginBottom: 0 }}>UNIVERSE GALLERY</span>
        <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* Tabs */}
      <div className="timeline-filter-row">
        {(["gallery", "featured", "discoveries"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tl-filter-btn${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "gallery" ? `SAVED (${gallery.length})` : t === "featured" ? "FEATURED" : `DISCOVERIES (${discoveries.length})`}
          </button>
        ))}
      </div>

      {/* Discoveries tab */}
      {tab === "discoveries" && (
        <div className="timeline-events">
          {discoveries.length === 0 && (
            <div className="timeline-empty">No discoveries saved yet.</div>
          )}
          {(["favorite-stars", "remarkable-worlds", "extraordinary-civilizations", "historic-events"] as const).map((cat) => {
            const items = discoveries.filter((d) => d.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="bio-ext-title" style={{ marginTop: 6 }}>{COLLECTION_LABEL[cat].toUpperCase()}</div>
                {items.map((item) => (
                  <div key={item.id} className="tl-event">
                    <div className="tl-event-body">
                      <div className="tl-event-meta">
                        <span className="tl-event-cat">{item.label}</span>
                        <span className="tl-event-time">{timeSince(item.savedAt)}</span>
                        <button
                          className="panel-close"
                          style={{ fontSize: 9 }}
                          onClick={() => { removeDiscovery(item.id); onGalleryChange(); }}
                        >✕</button>
                      </div>
                      <div className="tl-event-summary">{item.description}</div>
                      <div style={{ fontSize: 9, color: "rgba(100,130,180,0.5)" }}>
                        Seed {item.universeSeed}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Gallery + featured tabs */}
      {tab !== "discoveries" && (
        <div className="timeline-events">
          {displayList.length === 0 && (
            <div className="timeline-empty">
              {tab === "featured" ? "Save universes to see featured realities." : "No universes saved yet."}
            </div>
          )}
          {displayList.map((meta) => (
            <div key={meta.snapshotId} className="gallery-card">
              <div className="gallery-card-header">
                <div>
                  {editId === meta.snapshotId ? (
                    <input
                      className="seed-input"
                      style={{ width: 140, fontSize: 10, padding: "3px 6px" }}
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => {
                        if (editName.trim()) {
                          meta.name = editName.trim();
                          saveToGallery(meta);
                          onGalleryChange();
                        }
                        setEditId(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <span
                      className="star-id"
                      style={{ cursor: "pointer" }}
                      onClick={() => { setEditId(meta.snapshotId); setEditName(meta.name); }}
                      title="Click to rename"
                    >
                      {meta.name}
                    </span>
                  )}
                  <div className="experiment-id">{meta.snapshotId}</div>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button
                    className="panel-close"
                    style={{ color: meta.isFavorite ? "rgba(255,200,80,0.9)" : undefined }}
                    onClick={() => handleToggleFavorite(meta.snapshotId)}
                    title={meta.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >★</button>
                  <button className="panel-close" onClick={() => handleExport(meta)} title="Export">↓</button>
                  <button className="panel-close" onClick={() => handleRemove(meta.snapshotId)} title="Delete">✕</button>
                </div>
              </div>

              <div className="tl-event-summary" style={{ marginTop: 4 }}>{meta.summary}</div>

              <div style={{ display: "grid", gridTemplateColumns: "auto auto auto auto", gap: "4px 10px", marginTop: 6 }}>
                <span className="meta-label">SEED</span>
                <span className="meta-value" style={{ fontSize: 9 }}>{meta.seed}</span>
                <span className="meta-label">LIFE</span>
                <span className="meta-value" style={{ fontSize: 9 }}>{meta.lifeBearingPlanets}</span>
                <span className="meta-label">CIVS</span>
                <span className="meta-value" style={{ fontSize: 9 }}>{meta.civilizationCount}</span>
                <span className="meta-label">SAVED</span>
                <span className="meta-value" style={{ fontSize: 9 }}>{timeSince(meta.createdAt)}</span>
              </div>

              <div className="panel-actions" style={{ marginTop: 6 }}>
                <button className="btn primary bookmark-btn" style={{ fontSize: 9 }} onClick={() => onLoad(meta)}>
                  LOAD →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
