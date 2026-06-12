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
  const [tab, setTab]       = useState<Tab>("gallery");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const featured = getFeaturedUniverses(gallery);

  function handleToggleFavorite(id: string) { toggleFavorite(id); onGalleryChange(); }
  function handleRemove(id: string)          { removeFromGallery(id); onGalleryChange(); }
  function handleExport(meta: UniverseMeta)  { exportUniverse(meta); }

  const displayList = tab === "featured" ? featured : gallery;

  return (
    <div className="timeline-panel gallery-panel" role="dialog" aria-label="Library of Aion">
      <div className="timeline-header">
        <div className="tl-panel-label">Library of Aion</div>
        <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="timeline-filters" style={{ paddingTop: "var(--sp-3)", paddingBottom: "var(--sp-3)" }}>
        {(["gallery", "featured", "discoveries"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tl-filter-btn${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "gallery"
              ? `Saved (${gallery.length})`
              : t === "featured"
              ? "Featured"
              : `Discoveries (${discoveries.length})`}
          </button>
        ))}
      </div>

      {/* Discoveries tab */}
      {tab === "discoveries" && (
        <div className="gallery-scroll">
          {discoveries.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">✦</div>
              <div className="empty-state-title">No Discoveries Yet</div>
              <p className="empty-state-body">Rare stars and remarkable civilizations will appear here when found.</p>
            </div>
          )}
          {(["favorite-stars", "remarkable-worlds", "extraordinary-civilizations", "historic-events"] as const).map((cat) => {
            const items = discoveries.filter((d) => d.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="discovery-group">
                <div className="discovery-group-label">{COLLECTION_LABEL[cat]}</div>
                {items.map((item) => (
                  <div key={item.id} className="discovery-item">
                    <span className="discovery-label" title={item.description}>{item.label}</span>
                    <span className="discovery-meta">{timeSince(item.savedAt)}</span>
                    <button
                      className="discovery-del"
                      onClick={() => { removeDiscovery(item.id); onGalleryChange(); }}
                      aria-label="Remove discovery"
                    >✕</button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Gallery + featured tabs */}
      {tab !== "discoveries" && (
        <div className="gallery-scroll">
          {displayList.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">○</div>
              <div className="empty-state-title">
                {tab === "featured" ? "No Featured Realities" : "Library Empty"}
              </div>
              <p className="empty-state-body">
                {tab === "featured"
                  ? "Archive multiple universes to see featured realities here."
                  : "Archive a universe to begin building your library."}
              </p>
            </div>
          )}
          {displayList.map((meta) => (
            <div key={meta.snapshotId} className="gallery-card">
              <div className="gallery-card-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gallery-card-id">{meta.snapshotId}</div>
                  {editId === meta.snapshotId ? (
                    <input
                      className="seed-input"
                      style={{ width: "100%", fontSize: 10, padding: "3px 6px", marginTop: 2 }}
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
                    <button
                      className="gallery-card-name"
                      onClick={() => { setEditId(meta.snapshotId); setEditName(meta.name); }}
                      title="Click to rename"
                    >
                      {meta.name}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button
                    className={`gallery-icon-btn${meta.isFavorite ? " active" : ""}`}
                    onClick={() => handleToggleFavorite(meta.snapshotId)}
                    title={meta.isFavorite ? "Remove from favorites" : "Mark as favorite"}
                    aria-label="Toggle favorite"
                  >★</button>
                  <button
                    className="gallery-icon-btn"
                    onClick={() => handleExport(meta)}
                    title="Export universe"
                    aria-label="Export"
                  >↓</button>
                  <button
                    className="gallery-icon-btn danger"
                    onClick={() => handleRemove(meta.snapshotId)}
                    title="Remove from library"
                    aria-label="Remove"
                  >✕</button>
                </div>
              </div>

              <div className="gallery-card-meta">
                <span className="gallery-card-stat">Seed {meta.seed}</span>
                <span className="gallery-card-stat">{meta.lifeBearingPlanets} life-bearing</span>
                <span className="gallery-card-stat">{meta.civilizationCount} civilization{meta.civilizationCount !== 1 ? "s" : ""}</span>
                <span className="gallery-card-stat">{timeSince(meta.createdAt)}</span>
              </div>

              <div className="gallery-card-summary">{meta.summary}</div>

              <div className="gallery-card-actions">
                <button className="btn primary" style={{ flex: 1 }} onClick={() => onLoad(meta)}>
                  Restore →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
