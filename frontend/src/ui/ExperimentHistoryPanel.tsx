import type { ExperimentRecord } from "../simulation/experiment";

interface Props {
  experiments: ExperimentRecord[];
  onClose: () => void;
}

export function ExperimentHistoryPanel({ experiments, onClose }: Props) {
  return (
    <div className="star-panel compare-panel" role="dialog" aria-label="Experiment history">
      <div className="timeline-header">
        <span className="hud-title" style={{ fontSize: 10, marginBottom: 0 }}>EXPERIMENT HISTORY</span>
        <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {experiments.length === 0 && (
        <p className="bio-empty">No experiments recorded yet. Run a comparison to begin.</p>
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
  );
}
