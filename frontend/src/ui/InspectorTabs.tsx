// The tab row an inspector shows above its body: the same buttons and ARIA roles everywhere.

interface Props<T extends string> {
  /** Prefix for element ids, e.g. "star". */
  id: string;
  label: string;
  tabs: readonly { id: T; label: string }[];
  tab: T;
  onTab: (tab: T) => void;
}

export function InspectorTabs<T extends string>({ id, label, tabs, tab, onTab }: Props<T>) {
  return (
    <div className="inspector-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`${id}-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`${id}-tab-panel`}
          className={`tl-filter-btn${tab === t.id ? " active" : ""}`}
          onClick={() => onTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
