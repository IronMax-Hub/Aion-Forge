// The title bar of a panel floating over the stage: its name, which folds the
// panel to this bar and back (so the galaxy shows), and a close button.
// Folding only hides the body, so what the panel holds is kept.

interface Props {
  title: string;
  /** Id of the body this bar folds, for aria-controls. */
  bodyId: string;
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function FloatingPanelHeader({ title, bodyId, collapsed, onToggle, onClose }: Props) {
  return (
    <div className="timeline-header floating-panel-header">
      <button
        type="button"
        className="floating-panel-title"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        title={collapsed ? "Unfold" : "Fold to the title bar"}
      >
        <span className="tl-panel-label">{title}</span>
      </button>
      <div className="floating-panel-controls">
        <button className="inspector-btn" onClick={onToggle} aria-label={collapsed ? `Unfold ${title}` : `Fold ${title}`} aria-expanded={!collapsed} aria-controls={bodyId}>
          {collapsed ? "+" : "−"}
        </button>
        <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
    </div>
  );
}
