import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { drawSpecimen } from "../rendering/life/specimen";
import type { Specimen } from "./specimens";
import { formatLength } from "./specimens";
import { niceScaleLength } from "./format";

interface Props {
  specimens: Specimen[];
  /** The lineage whose plate is selected, if any (its line is highlighted in the tree of life). */
  selectedId: number | null;
  onSelect: (lineageId: number) => void;
}

// Plate drawing: its height, the scale bar's longest length and its place, px
const PLATE_HEIGHT = 140;
const SCALE_BAR_MAX = 80;
const SCALE_BAR_INSET = 10;
const LINE_WIDTH = 1.1;

/** A colour token's value, e.g. "#1B1F25". */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** One specimen drawn on its plate, with a scale bar. */
function PlateDrawing({ specimen }: { specimen: Specimen }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(PLATE_HEIGHT * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const paper = token("--col-card");
    const ink = token("--col-text-2");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, PLATE_HEIGHT);
    const { metresPerPixel } = drawSpecimen(ctx, specimen.plan, { x: 0, y: 0, width, height: PLATE_HEIGHT - 18 },
      { ink, paper, lineWidth: LINE_WIDTH });

    // Scale bar, bottom left
    const metres = niceScaleLength(SCALE_BAR_MAX * metresPerPixel);
    const px = metres / metresPerPixel;
    const y = PLATE_HEIGHT - SCALE_BAR_INSET;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SCALE_BAR_INSET, y - 3); ctx.lineTo(SCALE_BAR_INSET, y); ctx.lineTo(SCALE_BAR_INSET + px, y); ctx.lineTo(SCALE_BAR_INSET + px, y - 3);
    ctx.stroke();
    ctx.fillStyle = token("--col-text-3");
    ctx.font = `11px ${token("--font-mono")}`;
    ctx.fillText(formatLength(metres), SCALE_BAR_INSET + px + 6, y + 3);
  }, [specimen]);

  return <canvas ref={canvasRef} className="specimen-canvas" style={{ height: PLATE_HEIGHT }} aria-hidden="true" />;
}

/** The Life tab: a planet's specimen plates, one per chosen lineage; arrow keys move between them. */
export function FieldGuide({ specimens, selectedId, onSelect }: Props) {
  const plateRefs = useRef<(HTMLElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, index: number) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = Math.min(specimens.length - 1, Math.max(0, index + step));
    plateRefs.current[next]?.focus();
    onSelect(specimens[next].lineage.id);
  };

  if (specimens.length === 0) {
    return <p className="dock-empty-body">No lineages to show.</p>;
  }

  return (
    <div className="field-guide" role="list" aria-label="Specimens">
      {specimens.map((s, i) => (
        <article
          key={s.lineage.id}
          ref={(el) => { plateRefs.current[i] = el; }}
          role="listitem"
          tabIndex={0}
          aria-label={`${s.designation}: ${s.description}`}
          aria-current={s.lineage.id === selectedId ? "true" : undefined}
          className={`specimen-plate${s.lineage.id === selectedId ? " selected" : ""}${s.extinct ? " extinct" : ""}`}
          onClick={() => onSelect(s.lineage.id)}
          onFocus={() => onSelect(s.lineage.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          <PlateDrawing specimen={s} />
          <div className="specimen-head">
            <span className="specimen-designation">{s.designation}</span>
            {s.mind && <span className="specimen-badge">Mind's species</span>}
            {s.extinct && <span className="specimen-badge extinct">Extinct</span>}
          </div>
          <p className="specimen-description">{s.description}</p>
          <div className="data-grid specimen-facts">
            {s.facts.map((f) => (
              <div key={f.label} style={{ display: "contents" }}>
                <span className="data-label">{f.label}</span>
                <span className="data-value">{f.value}</span>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
