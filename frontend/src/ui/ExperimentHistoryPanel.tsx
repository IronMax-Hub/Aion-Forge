import type { ExperimentRecord } from "../simulation/experiment";

interface Props {
  experiments: ExperimentRecord[];
  onClose: () => void;
}

export function ExperimentHistoryPanel({ experiments, onClose }: Props) {
  return (
    <div className="compare-panel" role="dialog" aria-label="Experiment log">
      <div className="timeline-header">
        <div className="tl-panel-label">Experiment Log</div>
        <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div style={{ padding: "var(--sp-4) var(--sp-6)", flex: 1, overflowY: "auto" }}>
        {experiments.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">⊙</div>
            <div className="empty-state-title">No Experiments Yet</div>
            <p className="empty-state-body">Establish a baseline, modify the laws of reality, then compare to record an experiment.</p>
          </div>
        )}

        {experiments.map((exp) => (
          <div key={exp.id} className="experiment-row">
            <span className="experiment-id">{exp.id}</span>
            {exp.modifiedConstants.length > 0 && (
              <span className="experiment-changes">
                Changed: {exp.modifiedConstants.join(", ")}
              </span>
            )}
            <span className="experiment-note">{exp.comparisonSummary}</span>
            {exp.surprises.length > 0 && (
              <span style={{ fontSize: 9, color: "rgba(255,200,80,0.7)" }}>
                {exp.surprises.length} surprise{exp.surprises.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
