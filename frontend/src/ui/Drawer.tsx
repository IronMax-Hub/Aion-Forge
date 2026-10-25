// The parts of a collapsible drawer (sidebar or dock): the header bar of an open
// drawer, with its hide button, and the rail a hidden drawer leaves behind.
// Which drawers are open, and where they sit, is decided in ui/layout.ts and App.css.

type Side = "left" | "right";

interface HeadProps {
  title: string;
  side: Side;
  onHide: () => void;
}

/** The top of an open drawer: its name and a button that hides it towards its edge. */
export function DrawerHead({ title, side, onHide }: HeadProps) {
  return (
    <div className="drawer-head">
      <h2 className="drawer-title">{title}</h2>
      <button type="button" className="inspector-btn drawer-hide" onClick={onHide} aria-label={`Hide ${title.toLowerCase()}`}>
        {side === "left" ? "‹" : "›"}
      </button>
    </div>
  );
}

interface RailProps {
  title: string;
  side: Side;
  onShow: () => void;
}

/** A hidden drawer: a narrow strip the height of the drawer, which shows it again. */
export function DrawerRail({ title, side, onShow }: RailProps) {
  return (
    <button type="button" className={`drawer-rail drawer-rail-${side}`} onClick={onShow} aria-label={`Show ${title.toLowerCase()}`}>
      <span className="drawer-rail-arrow" aria-hidden="true">{side === "left" ? "›" : "‹"}</span>
      <span className="drawer-rail-label">{title}</span>
    </button>
  );
}
