// Specimen drawings (Worlds Up Close, phase C2.8b): a body plan (morphology.ts)
// drawn as a fine-line natural-history illustration on a 2D canvas, for the
// field guide's plates (C2.9).
//
// Why it exists: a body plan is numbers; this is how a reader sees it. Canvas,
// not WebGL, so plates are cheap and sharp at any size.
//
// How: everything is drawn in body lengths and fitted into the box it is given;
// the drawing reports how many metres a pixel stands for, for a scale bar.
// - Microbes: a few cells of their shape, arranged as their colony grows: a
//   layered mound (stromatolite), a mat, hanging filaments, a crust on the
//   ground, drifting plankton, or lone cells.
// - Producers: a branching body splitting `branchDepth` times, leaves at the
//   tips; a frond swaying from its holdfast; or a low encrusting colony.
// - Animals, side on: a chain of body segments tapering to the tail, a head
//   with its eyes, legs (one side's) or fins and a tail fin.
// Fills are the plan's colours, muted towards the paper, as in a hand-tinted plate.
//
// Presentation only, and deterministic: the drawing depends on the plan alone.

import type { AnimalPlan, BodyPlan, LinearRGB, MicrobePlan, ProducerPlan } from "./morphology";

/** Where and how to draw. */
export interface SpecimenStyle {
  ink: string;
  paper: string;
  /** Line width, px. */
  lineWidth: number;
}

/** What a drawing covers: how many metres one pixel stands for. */
export interface SpecimenDrawing {
  metresPerPixel: number;
}

// How far fills are muted towards the paper
const TINT_STRENGTH = 0.7;
// Space left round a drawing, as a share of the box
const MARGIN = 0.08;

/** Linear RGB as a CSS colour, mixed with the paper by `1 − strength`. */
function tint(colour: LinearRGB, paper: string, strength = TINT_STRENGTH): string {
  const paperRGB = cssToLinear(paper);
  const mixed = colour.map((c, i) => paperRGB[i] + (c - paperRGB[i]) * strength);
  const srgb = mixed.map((c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
  return `rgb(${srgb.join(", ")})`;
}

/** A #rrggbb colour in linear RGB. */
function cssToLinear(css: string): LinearRGB {
  const hex = css.replace("#", "");
  return [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as LinearRGB;
}

/** A drawing in its own units: its extent, and how to draw it there. */
interface Figure {
  width: number;
  height: number;
  /** Metres per unit of the figure. */
  metresPerUnit: number;
  draw(ctx: CanvasRenderingContext2D, style: SpecimenStyle, unit: number): void;
}

/**
 * Draws a body plan, fitted and centred in the box (x, y, width, height, px),
 * on whatever is already there. Returns how many metres a pixel stands for.
 */
export function drawSpecimen(
  ctx: CanvasRenderingContext2D, plan: BodyPlan, box: { x: number; y: number; width: number; height: number }, style: SpecimenStyle,
): SpecimenDrawing {
  const figure = plan.kind === "microbe" ? microbeFigure(plan)
    : plan.kind === "producer" ? producerFigure(plan)
    : animalFigure(plan);
  const room = { width: box.width * (1 - 2 * MARGIN), height: box.height * (1 - 2 * MARGIN) };
  const unit = Math.min(room.width / figure.width, room.height / figure.height);   // px per figure unit
  ctx.save();
  // Origin at the figure's bottom-left, y up, in figure units (lines widths are set in them too)
  ctx.translate(box.x + (box.width - figure.width * unit) / 2, box.y + (box.height + figure.height * unit) / 2);
  ctx.scale(unit, -unit);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = style.ink;
  figure.draw(ctx, style, unit);
  ctx.restore();
  return { metresPerPixel: figure.metresPerUnit / unit };
}

// ── Shapes ───────────────────────────────────────────────────────────────────

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, angle = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), angle, 0, 2 * Math.PI);
}

function fillAndStroke(ctx: CanvasRenderingContext2D, fill: string) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

/** One cell of the given shape, about `size` across, in px units of the current transform. */
function cell(ctx: CanvasRenderingContext2D, shape: MicrobePlan["cellShape"], x: number, y: number, size: number, angle: number, fill: string) {
  if (shape === "sphere") {
    ellipse(ctx, x, y, size / 2, size / 2);
    fillAndStroke(ctx, fill);
  } else if (shape === "rod") {
    ellipse(ctx, x, y, size / 2, size / 6, angle);
    fillAndStroke(ctx, fill);
  } else {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = i / 24 - 0.5;
      const along = t * size;
      const across = Math.sin(t * 4 * Math.PI) * size / 8;
      const px = x + along * Math.cos(angle) - across * Math.sin(angle);
      const py = y + along * Math.sin(angle) + across * Math.cos(angle);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

// ── Microbes ─────────────────────────────────────────────────────────────────

// A plate shows a colony this many cells across
const COLONY_CELLS = 12;

function microbeFigure(plan: MicrobePlan): Figure {
  const cellLength = 1;   // the figure's unit is one cell
  const width = COLONY_CELLS * cellLength;
  const height = plan.colony === "mound" ? width * 0.55 : plan.colony === "filaments" ? width * 0.7 : width * 0.4;
  return {
    width, height, metresPerUnit: plan.lengthM,
    draw(ctx, style, unit) {
      const fill = tint(plan.colour, style.paper);
      const lw = style.lineWidth / unit;
      ctx.lineWidth = lw;
      const size = 0.8;
      // Deterministic placement: a regular pattern, lightly staggered
      const stagger = (i: number, j: number) => ((i * 7 + j * 13) % 5) / 5 - 0.4;
      switch (plan.colony) {
        case "mound": {
          // Stromatolite: layered domes, a skin of living cells on top
          for (let layer = 5; layer >= 1; layer--) {
            const r = (layer / 5) * width / 2;
            ctx.beginPath();
            ctx.ellipse(width / 2, 0, r, r * (height / (width / 2)), 0, 0, Math.PI);
            ctx.stroke();
          }
          for (let i = 0; i < 14; i++) {
            const a = (i + 0.5) / 14 * Math.PI;
            cell(ctx, plan.cellShape, width / 2 + Math.cos(a) * width / 2, Math.sin(a) * height, size, a + Math.PI / 2, fill);
          }
          break;
        }
        case "mat":
        case "crust": {
          // A layer on the bottom (crust: on dry ground, patchier)
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(width, 0);
          ctx.stroke();
          const rows = plan.colony === "mat" ? 3 : 2;
          for (let j = 0; j < rows; j++) {
            for (let i = 0; i < COLONY_CELLS; i++) {
              if (plan.colony === "crust" && (i * 3 + j) % 4 === 0) continue;
              cell(ctx, plan.cellShape, i + 0.5 + stagger(i, j) * 0.3, 0.5 + j * 0.8, size, (i + j) * 0.7, fill);
            }
          }
          break;
        }
        case "filaments": {
          // Chains of cells hanging from a surface at the top
          ctx.beginPath();
          ctx.moveTo(0, height); ctx.lineTo(width, height);
          ctx.stroke();
          for (let f = 0; f < 5; f++) {
            const x0 = (f + 0.5) * width / 5;
            const n = 4 + ((f * 3) % 4);
            for (let k = 0; k < n; k++) {
              const y = height - 0.6 - k * 0.95;
              cell(ctx, plan.cellShape, x0 + Math.sin(k * 0.8 + f) * 0.3, y, size, Math.PI / 2, fill);
            }
          }
          break;
        }
        case "plankton":
        case "single-cells": {
          const n = plan.colony === "plankton" ? 14 : 5;
          for (let i = 0; i < n; i++) {
            const x = ((i * 0.618034) % 1) * (width - 2) + 1;
            const y = ((i * 0.381966 + 0.2) % 1) * (height - 1.2) + 0.6;
            cell(ctx, plan.cellShape, x, y, plan.colony === "single-cells" ? size * 1.6 : size, i * 1.3, fill);
          }
          break;
        }
      }
    },
  };
}

// ── Producers ────────────────────────────────────────────────────────────────

function producerFigure(plan: ProducerPlan): Figure {
  if (plan.form === "branching") return branchingFigure(plan);
  // Fronds and encrusting colonies: drawn in a box of their height-to-width
  const height = 1;
  const width = 1 / plan.slenderness * (plan.form === "frond" ? 3 : 1);
  return {
    width: width * 1.2, height, metresPerUnit: plan.lengthM / (plan.form === "encrusting" ? width : height),
    draw(ctx, style, unit) {
      ctx.lineWidth = style.lineWidth / unit;
      const fill = tint(plan.colour, style.paper);
      ctx.translate(width * 0.1, 0);
      ctx.beginPath();
      ctx.moveTo(-width * 0.1, 0); ctx.lineTo(width * 1.1, 0);   // the ground or seabed
      ctx.stroke();
      if (plan.form === "encrusting") encrusting(ctx, width, fill);
      else frond(ctx, plan, width, fill);
    },
  };
}

// Branching producers: each level this much shorter than the one below. The whole
// outline's height over crown width follows the body's slenderness (taller on a
// lighter world): this much at the usual slenderness (morphology.ts, at 1 g), as
// real trees are. The bare stem is at least this share of the crown's height.
const BRANCH_SHRINK = 0.72;
const OUTLINE_ASPECT = { atUsual: 1.5, usualSlenderness: 6 };
const MIN_STEM_SHARE = 0.15;

/** A branching producer: its stems and leaves worked out first, so the figure fits what is drawn. */
function branchingFigure(plan: ProducerPlan): Figure {
  const segments: [number, number, number, number][] = [];
  const leaves: [number, number, number][] = [];   // x, y, angle
  const grow = (x: number, y: number, angle: number, length: number, depth: number) => {
    const x2 = x + Math.sin(angle) * length;
    const y2 = y + Math.cos(angle) * length;
    segments.push([x, y, x2, y2]);
    if (depth === 0) { leaves.push([x2, y2, angle]); return; }
    for (let k = 0; k < plan.branchSplit; k++) {
      const spread = plan.branchSplit === 2 ? (k === 0 ? -1 : 1) : k - 1;
      grow(x2, y2, angle + spread * plan.branchAngle, length * BRANCH_SHRINK, depth - 1);
    }
  };
  grow(0, 0, 0, 1, plan.branchDepth);
  const leaf = 0.12 * plan.leafScale;
  const xs = [...segments.flatMap(([a, , c]) => [a, c]), ...leaves.map(([x]) => x)];
  const ys = [...segments.flatMap(([, b, , d]) => [b, d]), ...leaves.map(([, y]) => y)];
  const left = Math.min(...xs) - leaf;
  const width = Math.max(...xs) + leaf - left;
  const crownHeight = Math.max(...ys) + leaf;
  // A bare stem below the crown, as long as the outline's height asks for
  const aspect = OUTLINE_ASPECT.atUsual * plan.slenderness / OUTLINE_ASPECT.usualSlenderness;
  const stem = Math.max(aspect * width - crownHeight, MIN_STEM_SHARE * crownHeight);
  const height = crownHeight + stem;
  return {
    width: width * 1.2, height, metresPerUnit: plan.lengthM / height,
    draw(ctx, style, unit) {
      ctx.lineWidth = style.lineWidth / unit;
      const fill = tint(plan.colour, style.paper);
      ctx.translate(width * 0.1 - left, 0);
      ctx.beginPath();
      ctx.moveTo(left - width * 0.1, 0); ctx.lineTo(left + width * 1.1, 0);   // the ground
      ctx.moveTo(0, 0); ctx.lineTo(0, stem);
      for (const [x1, y1, x2, y2] of segments) { ctx.moveTo(x1, y1 + stem); ctx.lineTo(x2, y2 + stem); }
      ctx.stroke();
      for (const [x, y, angle] of leaves) {
        ellipse(ctx, x, y + stem, leaf, leaf * 0.55, -angle + Math.PI / 2);
        fillAndStroke(ctx, fill);
      }
    },
  };
}

function frond(ctx: CanvasRenderingContext2D, plan: ProducerPlan, width: number, fill: string) {
  // A swaying stalk with blades along it
  const sway = (y: number) => width / 2 + Math.sin(y * 4) * width * 0.15;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const y = i / 40;
    if (i === 0) ctx.moveTo(sway(y), y); else ctx.lineTo(sway(y), y);
  }
  ctx.stroke();
  const blades = 4 + plan.branchDepth;
  const blade = 0.08 * plan.leafScale;
  for (let i = 1; i <= blades; i++) {
    const y = i / (blades + 1);
    const side = i % 2 === 0 ? 1 : -1;
    ellipse(ctx, sway(y) + side * blade * 0.9, y + blade * 0.3, blade, blade * 0.3, side * 0.5);
    fillAndStroke(ctx, fill);
  }
}

function encrusting(ctx: CanvasRenderingContext2D, width: number, fill: string) {
  // A low, lumpy colony with pores
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 0; i <= 30; i++) {
    const x = (i / 30) * width;
    const y = Math.sin((i / 30) * Math.PI) * (0.75 + 0.25 * Math.sin(i * 0.9));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, 0);
  ctx.closePath();
  fillAndStroke(ctx, fill);
  for (let i = 1; i < 6; i++) {
    const x = (i / 6) * width;
    ellipse(ctx, x, Math.sin((i / 6) * Math.PI) * 0.5, width * 0.02, 0.05);
    ctx.stroke();
  }
}

// ── Animals ──────────────────────────────────────────────────────────────────

function animalFigure(plan: AnimalPlan): Figure {
  const length = 1;
  const legs = plan.locomotion === "walker" ? plan.legLength : 0;
  const bodyHeight = plan.girth;
  const height = legs + bodyHeight * 1.2;
  return {
    width: length * 1.15, height, metresPerUnit: plan.lengthM,
    draw(ctx, style, unit) {
      ctx.lineWidth = style.lineWidth / unit;
      const back = tint(plan.colour, style.paper);
      const belly = tint(plan.bellyColour, style.paper);
      const axis = legs + bodyHeight * 0.6;          // height of the body's midline
      const tail = 0.05;                             // the body runs from x = tail (tail end) to tail + length (snout)
      const head = plan.headSize;
      const trunk = length - head;
      // Width of the body at a point along it, 0 (tail) to 1 (neck): tapering to the tail
      const thickness = (t: number) => bodyHeight * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.15) * Math.PI / 2));

      if (plan.locomotion === "walker") {
        // One side's legs, jointed, spaced along the trunk
        for (let i = 0; i < plan.limbPairs; i++) {
          const t = plan.limbPairs === 1 ? 0.6 : 0.2 + (i / (plan.limbPairs - 1)) * 0.65;
          const x = tail + t * trunk;
          const hip = axis - thickness(t) * 0.3;
          const knee = { x: x + legs * 0.18, y: legs * 0.5 };   // knees bend forward, all alike
          ctx.beginPath();
          ctx.moveTo(x, hip); ctx.lineTo(knee.x, knee.y); ctx.lineTo(x, 0); ctx.lineTo(x + legs * 0.12, 0);
          ctx.stroke();
        }
      } else {
        // Fins below, and a tail fin
        for (let i = 0; i < plan.limbPairs; i++) {
          const t = 0.25 + (i / Math.max(1, plan.limbPairs)) * 0.6;
          const x = tail + t * trunk;
          const y = axis - thickness(t) * 0.45;
          ctx.beginPath();
          ctx.moveTo(x, y); ctx.lineTo(x - bodyHeight * 0.5, y - bodyHeight * 0.45); ctx.lineTo(x - bodyHeight * 0.1, y);
          fillAndStroke(ctx, belly);
        }
        ctx.beginPath();
        ctx.moveTo(tail + 0.02, axis);
        ctx.lineTo(tail - 0.05, axis + bodyHeight * 0.5);
        ctx.lineTo(tail - 0.05, axis - bodyHeight * 0.5);
        ctx.closePath();
        fillAndStroke(ctx, back);
      }

      // Segments, tail to neck, each overlapping the next
      for (let i = 0; i < plan.segments; i++) {
        const t = (i + 0.5) / plan.segments;
        const x = tail + t * trunk;
        const half = trunk / plan.segments * 0.65;
        const h = thickness(t) / 2;
        ellipse(ctx, x, axis, half, h);
        fillAndStroke(ctx, back);
        // A paler belly below the midline
        ctx.beginPath();
        ctx.ellipse(x, axis, half * 0.85, h * 0.8, 0, Math.PI * 1.15, Math.PI * 1.85);
        ctx.strokeStyle = belly;
        ctx.stroke();
        ctx.strokeStyle = style.ink;
      }

      // Head, and eyes
      const hx = tail + trunk + head * 0.45;
      const hh = bodyHeight * 0.45 * (0.8 + head);
      ellipse(ctx, hx, axis + hh * 0.1, head * 0.55, hh);
      fillAndStroke(ctx, back);
      const eye = Math.max(head * plan.eyeSize * 0.5, 0.004);
      for (let e = 0; e < plan.eyes / 2; e++) {
        // Side view: one side's eyes; forward-facing ones near the snout, side ones along the head
        const ex = plan.eyePlacement === "front" ? hx + head * 0.3 - e * eye * 2.4 : hx - e * eye * 2.6;
        const ey = axis + hh * 0.45 - e * eye * 0.6;
        ellipse(ctx, ex, ey, eye, eye);
        fillAndStroke(ctx, style.paper);
        ellipse(ctx, ex + eye * 0.25, ey, eye * 0.45, eye * 0.45);
        ctx.fillStyle = style.ink;
        ctx.fill();
      }
    },
  };
}
