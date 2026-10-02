import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { BodyPlan } from "../rendering/life/morphology";
import type { TreeOfLife } from "./treeOfLife";
import { agoTicks } from "./treeOfLife";
import { formatGyr } from "./format";

interface Props {
  tree: TreeOfLife;
  plans: Map<number, BodyPlan>;
  /** Lineages of the mind's species (C2.6), marked at their ends. */
  mindSpecies: Set<number>;
  planetName: string;
  selectedId: number | null;
  onSelect: (lineageId: number) => void;
  onClose: () => void;
}

// Chart geometry, px
const ROW_HEIGHT = 5;
const MARGIN = { top: 36, right: 32, bottom: 16, left: 24 };
const MIN_WIDTH = 480;

// Lines by kind, as CSS colour tokens
const KIND_COLOUR: Record<BodyPlan["kind"], string> = {
  animal: "var(--col-amber)",
  producer: "var(--col-life)",
  microbe: "var(--col-blue)",
};
const CAUSE_LABEL = { impact: "Impact", volcanism: "Volcanism", climate: "Climate" } as const;

/** The tree of life overlay: every drawn lineage as a line through time, joined to its parent. */
export function TreeOfLifePanel({ tree, plans, mindSpecies, planetName, selectedId, onSelect, onClose }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MIN_WIDTH);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => setWidth(Math.max(MIN_WIDTH, body.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  // Escape closes the tree (the app's own Escape steps do not apply in the biosphere view)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { rows, startGyr, nowGyr, extinctions } = tree;
  const span = Math.max(nowGyr - startGyr, 1e-6);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const height = MARGIN.top + rows.length * ROW_HEIGHT + MARGIN.bottom;
  const x = (tGyr: number) => MARGIN.left + ((tGyr - startGyr) / span) * plotWidth;
  const y = (row: number) => MARGIN.top + (row + 0.5) * ROW_HEIGHT;

  // The selected lineage and its ancestors, highlighted
  const highlighted = useMemo(() => {
    const ids = new Set<number>();
    const byId = new Map(rows.map((r) => [r.lineage.id, r.lineage]));
    for (let at = selectedId !== null ? byId.get(selectedId) : undefined; at;
      at = at.parentId !== null ? byId.get(at.parentId) : undefined) ids.add(at.id);
    return ids;
  }, [rows, selectedId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step === 0 || rows.length === 0) return;
    e.preventDefault();
    const current = rows.findIndex((r) => r.lineage.id === selectedId);
    const next = current < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, current + step));
    onSelect(rows[next].lineage.id);
  };

  const selectedRow = rows.find((r) => r.lineage.id === selectedId);

  return (
    <div className="overlay-panel tree-panel" role="dialog" aria-label={`Tree of life, ${planetName}`}>
      <div className="overlay-header">
        <div>
          <div className="tl-panel-label">Tree of life · {planetName}</div>
          <div className="timeline-count">
            {rows.length < tree.totalLineages
              ? `${rows.length} of ${tree.totalLineages} lineages: all living lines and their ancestors, and the longest-lived extinct ones`
              : `${rows.length} lineages`}
          </div>
        </div>
        <div className="overlay-controls">
          <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="tree-legend">
        {(Object.keys(KIND_COLOUR) as BodyPlan["kind"][]).map((k) => (
          <span key={k}><i style={{ background: KIND_COLOUR[k] }} />{k === "animal" ? "Animals" : k === "producer" ? "Producers" : "Microbes"}</span>
        ))}
        <span><i className="extinct" />Extinct</span>
        <span><i className="rule" />Mass extinction</span>
        {mindSpecies.size > 0 && <span><i className="mind" />Mind's species</span>}
        <span className="tree-selected">
          {selectedRow ? `L-${selectedRow.lineage.id} · arose ${formatGyr(nowGyr - selectedRow.fromGyr)} ago${selectedRow.living ? "" : ` · died out ${formatGyr(nowGyr - selectedRow.toGyr)} ago`}` : "Select a line"}
        </span>
      </div>

      <div className="overlay-body tree-body" ref={bodyRef} tabIndex={0} onKeyDown={onKeyDown}
        aria-label="Lineages through time; up and down arrows move between them">
        <svg width={width} height={height} className="tree-chart">
          {/* Time axis, in Gyr ago */}
          {agoTicks(span).map((ago) => (
            <g key={ago}>
              <line x1={x(nowGyr - ago)} x2={x(nowGyr - ago)} y1={MARGIN.top - 6} y2={height - MARGIN.bottom} className="tree-tick" />
              <text x={x(nowGyr - ago)} y={MARGIN.top - 10} className="tree-tick-label" textAnchor={ago === 0 ? "end" : "middle"}>
                {ago === 0 ? "Today" : formatGyr(ago)}
              </text>
            </g>
          ))}
          {extinctions.map((e, i) => (
            <g key={i}>
              <line x1={x(e.tGyr)} x2={x(e.tGyr)} y1={MARGIN.top - 4} y2={height - MARGIN.bottom} className="tree-extinction" />
              <title>{`${CAUSE_LABEL[e.cause]}: ${Math.round(e.share * 100)}% of lineages lost, ${formatGyr(nowGyr - e.tGyr)} ago`}</title>
            </g>
          ))}

          {rows.map((r) => {
            const colour = r.living ? KIND_COLOUR[plans.get(r.lineage.id)?.kind ?? "microbe"] : "var(--col-text-5)";
            const lit = highlighted.has(r.lineage.id);
            return (
              <g key={r.lineage.id} className={`tree-line${r.living ? "" : " extinct"}${lit ? " lit" : ""}`}
                onClick={() => onSelect(r.lineage.id)}>
                {r.parentRow !== null && (
                  <line x1={x(r.fromGyr)} x2={x(r.fromGyr)} y1={y(r.parentRow)} y2={y(r.row)} stroke={colour} className="tree-join" />
                )}
                <line x1={x(r.fromGyr)} x2={Math.max(x(r.toGyr), x(r.fromGyr) + 1)} y1={y(r.row)} y2={y(r.row)} stroke={colour} />
                {r.living && mindSpecies.has(r.lineage.id) && <circle cx={x(r.toGyr)} cy={y(r.row)} r={2.5} className="tree-mind" />}
                {/* A wider, invisible target to click */}
                <rect x={x(r.fromGyr)} y={y(r.row) - ROW_HEIGHT / 2} width={Math.max(x(r.toGyr) - x(r.fromGyr), 4)} height={ROW_HEIGHT}
                  className="tree-hit" />
                <title>{`L-${r.lineage.id}${r.living ? "" : " (extinct)"}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
