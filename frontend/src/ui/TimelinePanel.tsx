import { useState, useEffect, useRef } from "react";
import type { UniverseTimeline, HistoricalEvent, EventCategory, Importance } from "../simulation/history";
import { sortTimeline, filterByCategory, IMPORTANCE_RANK } from "../simulation/history";

interface Props {
  timeline: UniverseTimeline;
  summary: string;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<EventCategory, string> = {
  cosmic:         "COSMIC",
  stellar:        "STELLAR",
  planetary:      "PLANETARY",
  biological:     "BIOLOGICAL",
  civilizational: "CIVILIZATIONAL",
};

const CATEGORY_COLOR: Record<EventCategory, string> = {
  cosmic:         "rgba(200, 160, 255, 0.85)",
  stellar:        "rgba(255, 220, 100, 0.85)",
  planetary:      "rgba(100, 200, 160, 0.85)",
  biological:     "rgba(80, 220, 120, 0.85)",
  civilizational: "rgba(100, 180, 255, 0.85)",
};

const IMPORTANCE_COLOR: Record<Importance, string> = {
  minor:       "rgba(100, 120, 160, 0.5)",
  significant: "rgba(140, 170, 220, 0.7)",
  major:       "rgba(180, 210, 255, 0.85)",
  historic:    "rgba(255, 200, 80, 0.9)",
  legendary:   "rgba(255, 140, 80, 1.0)",
};

const IMPORTANCE_OPTIONS: Importance[] = ["minor", "significant", "major", "historic", "legendary"];
const CATEGORY_OPTIONS: (EventCategory | "all")[] = [
  "all", "cosmic", "stellar", "planetary", "biological", "civilizational",
];

// Replay speeds: events per second
const SPEEDS = [0.5, 1, 2, 4] as const;

function EventRow({
  event,
  expanded,
  highlighted,
  onClick,
}: {
  event: HistoricalEvent;
  expanded: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlighted]);

  return (
    <div
      ref={ref}
      className={`tl-event${expanded ? " expanded" : ""}${highlighted ? " highlighted" : ""}`}
      onClick={onClick}
    >
      <div className="tl-event-dot" style={{ background: CATEGORY_COLOR[event.category] }} />
      <div className="tl-event-body">
        <div className="tl-event-meta">
          <span className="tl-event-cat" style={{ color: CATEGORY_COLOR[event.category] }}>
            {CATEGORY_LABEL[event.category]}
          </span>
          <span className="tl-event-time">{event.timestampGyr.toFixed(3)} Gya</span>
          <span className="tl-event-imp" style={{ color: IMPORTANCE_COLOR[event.importance] }}>
            {event.importance.toUpperCase()}
          </span>
        </div>
        <div className="tl-event-summary">{event.summary}</div>
        {expanded && (
          <div className="tl-event-detail">
            <span className="meta-label">SUBJECT</span>
            <span className="meta-value" style={{ fontSize: 9 }}>{event.subjectId}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimelinePanel({ timeline, summary, onClose }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | "all">("all");
  const [minImportance,  setMinImportance]  = useState<Importance>("minor");
  const [expandedId,     setExpandedId]     = useState<number | null>(null);

  // Replay state (AF-103)
  const [replayMode,    setReplayMode]    = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex,   setReplayIndex]   = useState(0);
  const [replaySpeed,   setReplaySpeed]   = useState<typeof SPEEDS[number]>(1);
  const replayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build filtered event list
  let events: HistoricalEvent[];
  if (categoryFilter !== "all") {
    events = filterByCategory(timeline, categoryFilter);
  } else {
    events = sortTimeline(timeline);
  }
  events = events.filter((e) => IMPORTANCE_RANK[e.importance] >= IMPORTANCE_RANK[minImportance]);

  // In replay mode events play oldest→newest, so reverse the display order
  const replayEvents = [...events].reverse();

  // Replay tick
  useEffect(() => {
    if (!replayMode || !replayPlaying) return;
    if (replayIndex >= replayEvents.length) {
      setReplayPlaying(false);
      return;
    }
    const delay = 1000 / replaySpeed;
    replayRef.current = setTimeout(() => {
      setReplayIndex((i) => i + 1);
    }, delay);
    return () => { if (replayRef.current) clearTimeout(replayRef.current); };
  }, [replayMode, replayPlaying, replayIndex, replayEvents.length, replaySpeed]);

  function startReplay() {
    setReplayMode(true);
    setReplayIndex(0);
    setReplayPlaying(true);
  }

  function stopReplay() {
    setReplayMode(false);
    setReplayPlaying(false);
    setReplayIndex(0);
    if (replayRef.current) clearTimeout(replayRef.current);
  }

  const displayedEvents  = replayMode ? replayEvents.slice(0, replayIndex) : events;
  const highlightedEventId = replayMode && replayIndex > 0 ? replayEvents[replayIndex - 1]?.id : null;

  return (
    <div className="timeline-panel" role="dialog" aria-label="Universe timeline">
      <div className="timeline-header">
        <span className="hud-title" style={{ fontSize: 10, marginBottom: 0 }}>UNIVERSE TIMELINE</span>
        <div style={{ display: "flex", gap: 6 }}>
          {!replayMode ? (
            <button className="tl-filter-btn" onClick={startReplay} title="Replay history from the beginning" aria-label="Replay timeline">
              ▶ REPLAY
            </button>
          ) : (
            <>
              <button
                className="tl-filter-btn"
                onClick={() => setReplayPlaying((p) => !p)}
                disabled={replayIndex >= replayEvents.length}
                aria-label={replayPlaying ? "Pause replay" : "Play replay"}
              >
                {replayPlaying ? "⏸ PAUSE" : "▶ PLAY"}
              </button>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`tl-filter-btn${replaySpeed === s ? " active" : ""}`}
                  onClick={() => setReplaySpeed(s)}
                  aria-label={`${s}× speed`}
                  aria-pressed={replaySpeed === s}
                >
                  {s}×
                </button>
              ))}
              <button className="tl-filter-btn" onClick={stopReplay} aria-label="Stop replay">✕</button>
            </>
          )}
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="timeline-summary">{summary}</div>

      {/* Filters — hidden during replay */}
      {!replayMode && (
        <div className="timeline-filters">
          <div className="timeline-filter-row">
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                className={`tl-filter-btn${categoryFilter === c ? " active" : ""}`}
                style={
                  categoryFilter === c && c !== "all"
                    ? { borderColor: CATEGORY_COLOR[c as EventCategory], color: CATEGORY_COLOR[c as EventCategory] }
                    : undefined
                }
                onClick={() => setCategoryFilter(c)}
              >
                {c === "all" ? "ALL" : CATEGORY_LABEL[c as EventCategory]}
              </button>
            ))}
          </div>
          <div className="timeline-filter-row">
            <span className="meta-label" style={{ alignSelf: "center" }}>MIN</span>
            {IMPORTANCE_OPTIONS.map((imp) => (
              <button
                key={imp}
                className={`tl-filter-btn${minImportance === imp ? " active" : ""}`}
                style={
                  minImportance === imp
                    ? { borderColor: IMPORTANCE_COLOR[imp], color: IMPORTANCE_COLOR[imp] }
                    : undefined
                }
                onClick={() => setMinImportance(imp)}
              >
                {imp.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="timeline-count">
        {replayMode
          ? `${replayIndex} / ${replayEvents.length} event${replayEvents.length !== 1 ? "s" : ""}`
          : `${events.length} event${events.length !== 1 ? "s" : ""}`}
      </div>

      <div className="timeline-events">
        {displayedEvents.length === 0 && !replayPlaying && (
          <div className="timeline-empty">
            {replayMode ? "Waiting…" : "No events match this filter."}
          </div>
        )}
        {displayedEvents.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            expanded={expandedId === e.id}
            highlighted={e.id === highlightedEventId}
            onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
          />
        ))}
      </div>
    </div>
  );
}
