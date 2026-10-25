// The app shell's two drawers: the sidebar (the universe as a whole) and the
// dock (whatever is selected). Each can be hidden down to a narrow rail.
//
// On a desktop an open drawer takes its column and the universe view shrinks
// beside it. On a phone held sideways (a touch screen too short for that) both
// start hidden and an open drawer slides over the view instead. See
// Documents/Mobile-APK.md, M2.

/** The phone layout. Must match the @media rule for drawers in App.css. */
export const COMPACT_QUERY = "(pointer: coarse) and (max-height: 500px)";

function compactQuery(): MediaQueryList | null {
  return typeof window === "undefined" || !window.matchMedia ? null : window.matchMedia(COMPACT_QUERY);
}

export function isCompactScreen(): boolean {
  return compactQuery()?.matches ?? false;
}

export type DrawerName = "sidebar" | "dock";

// Whether a drawer is open is a per-browser display preference, kept for the
// desktop only: on a phone both drawers start hidden every time.
const drawerKey = (drawer: DrawerName) => `aion-forge-${drawer}-open`;

/** Whether the drawer starts open: hidden on a phone, else as last left (open the first time). */
export function initialDrawerOpen(drawer: DrawerName): boolean {
  if (isCompactScreen()) return false;
  try { return localStorage.getItem(drawerKey(drawer)) !== "no"; } catch { return true; }
}

export function rememberDrawerOpen(drawer: DrawerName, open: boolean): void {
  if (isCompactScreen()) return;
  try { localStorage.setItem(drawerKey(drawer), open ? "yes" : "no"); } catch { /* preference not kept */ }
}
