// The Great Filter panel (Galaxy Through Time, GF3).
//
// Why it exists: the funnel (simulation/greatFilter.ts) says how many worlds
// pass each gate from a solid surface to a lasting civilization; this shows
// it as an instrument would, and lets the reader look at the worlds that
// stopped at any gate.
//
// How: a vertical funnel of bars on a logarithmic scale (counts span four
// orders of magnitude), with counts and pass shares, the filter gate marked.
// Choosing a gate shows its breakdown (GF2) and the worlds stopped there,
// each of which opens its system and its entry.
//
// Limits: it reads the universe index, so it waits for the life survey; it
// shows shares, never causes.

import { useMemo } from "react";
import type { Star } from "../simulation/star";
import type { UniverseIndex } from "../simulation/universeIndex";
import { CIVILIZATION_STAGE_CODES } from "../simulation/universeIndex";
import { breakdown, funnelOf, GATES, quantile, stoppedAt } from "../simulation/greatFilter";
import type { Funnel, GateId } from "../simulation/greatFilter";
import { TECH_STAGE_LABEL } from "../simulation/civilization";
import { formatGyr, formatInt, formatPercent, formatPressure, formatSig, planetName, starName } from "./format";
import { formatMass } from "./specimens";

interface Props {
  index: UniverseIndex | null;
  stars: readonly Star[];
  /** The gate whose breakdown is open, or null. */
  gate: GateId | null;
  onGate: (gate: GateId | null) => void;
  /** Opens a world's system and its entry. */
  onOpenWorld: (starId: number, planetIndex: number) => void;
  onClose: () => void;
}

/** The most stopped worlds listed under a gate. */
const MAX_LISTED = 40;

/** The measure that matters most for a world stopped at each gate. */
const KEY_MEASURE: Record<GateId, { label: string; value: (ix: UniverseIndex, i: number, star: Star) => string }> = {
  solid: { label: "Mass", value: (ix, i) => `${formatSig(ix.massEarths[i])} M⊕` },
  water: { label: "Temperature", value: (ix, i) => `${formatInt(ix.temperatureK[i])} K` },
  life: { label: "Star's age", value: (_, __, star) => formatGyr(star.age) },
  light: { label: "Life's age", value: (ix, i, star) => formatGyr(star.age - ix.lifeBeganGyr[i]) },
  oxygen: { label: "Since first light", value: (ix, i, star) => formatGyr(star.age - ix.firstLightGyr[i]) },
  multicellular: { label: "Largest body", value: (ix, i) => (Number.isNaN(ix.largestLog10Kg[i]) ? "none living" : formatMass(ix.largestLog10Kg[i])) },
  mind: { label: "Largest body", value: (ix, i) => (Number.isNaN(ix.largestLog10Kg[i]) ? "none living" : formatMass(ix.largestLog10Kg[i])) },
  fire: { label: "Land · O₂", value: (ix, i) => `${formatPercent(ix.landFraction[i])} · ${formatPressure(ix.o2Bar[i])}` },
  industry: { label: "Highest stage", value: (ix, i) => stageLabel(ix.highestStage[i]) },
  communication: { label: "Highest stage", value: (ix, i) => stageLabel(ix.highestStage[i]) },
  spaceflight: { label: "Highest stage", value: (ix, i) => stageLabel(ix.highestStage[i]) },
  endures: { label: "Today", value: (ix, i) => stageLabel(ix.civilizationStage[i]) },
};

function stageLabel(code: number): string {
  const stage = CIVILIZATION_STAGE_CODES[code];
  return stage === "none" ? "None" : TECH_STAGE_LABEL[stage];
}

/** A bar's width on the funnel's log scale: count + 1, so a gate no world passed has none. */
function logWidth(count: number, worlds: number): string {
  return `${(100 * Math.log10(count + 1)) / Math.log10(worlds + 1)}%`;
}

const shareText = (share: number) => (Number.isNaN(share) ? "—" : formatPercent(share));

function FunnelBars({ funnel, gate, onGate }: { funnel: Funnel; gate: GateId | null; onGate: (gate: GateId | null) => void }) {
  return (
    <ol className="gf-funnel" aria-label="Worlds passing each gate">
      <li className="gf-row gf-row-total">
        <span className="gf-label">Planets</span>
        <span className="gf-bar-track"><span className="gf-bar" style={{ width: "100%" }} /></span>
        <span className="gf-count">{formatInt(funnel.worlds)}</span>
        <span className="gf-share" />
      </li>
      {funnel.steps.map((step) => {
        const isFilter = funnel.filter === step.gate.id;
        return (
          <li key={step.gate.id}>
            <button
              type="button"
              className={`gf-row${gate === step.gate.id ? " selected" : ""}${isFilter ? " filter" : ""}`}
              aria-pressed={gate === step.gate.id}
              onClick={() => onGate(gate === step.gate.id ? null : step.gate.id)}
              title={`${step.arrived - step.passed} worlds stopped here`}
            >
              <span className="gf-label">{step.gate.label}{isFilter && <span className="gf-filter-mark">filter</span>}</span>
              <span className="gf-bar-track"><span className="gf-bar" style={{ width: logWidth(step.passed, funnel.worlds) }} /></span>
              <span className="gf-count">{formatInt(step.passed)}</span>
              <span className="gf-share">{shareText(step.share)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Breakdown({ index, stars, gate, onOpenWorld }: {
  index: UniverseIndex; stars: readonly Star[]; gate: GateId; onOpenWorld: Props["onOpenWorld"];
}) {
  const b = useMemo(() => breakdown(index, stars, gate), [index, stars, gate]);
  const stopped = useMemo(() => stoppedAt(index, gate), [index, gate]);
  const measure = KEY_MEASURE[gate];
  const before = b.gate === GATES[0] ? "Planets" : GATES[GATES.indexOf(b.gate) - 1].label;

  return (
    <section className="gf-breakdown" aria-label={`Worlds stopped at ${b.gate.label}`}>
      <h3 className="gf-heading">{b.gate.label}</h3>
      <p className="gf-text">
        {formatInt(b.arrived)} worlds reached this gate ({before.toLowerCase()}); {formatInt(b.passed)} passed and {formatInt(b.stopped)} stopped.
      </p>

      {b.stopped > 0 && b.passed > 0 && (
        <div className="inspector-section">
          <div className="section-head">
            <h4 className="section-title">Shared conditions</h4>
            <span className="section-note">Shares, not causes</span>
          </div>
          <div className="gf-legend"><span className="gf-swatch stopped" /> stopped <span className="gf-swatch passed" /> passed</div>
          <dl className="gf-conditions">
            {b.conditions.map(({ condition, stopped: s, passed: p }) => (
              <div className="gf-condition" key={condition.id}>
                <dt>{condition.label}</dt>
                <dd>
                  <span className="gf-pair">
                    <span className="gf-cbar stopped" style={{ width: `${(s || 0) * 100}%` }} />
                    <span className="gf-cval">{shareText(s)}</span>
                  </span>
                  <span className="gf-pair">
                    <span className="gf-cbar passed" style={{ width: `${(p || 0) * 100}%` }} />
                    <span className="gf-cval">{shareText(p)}</span>
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {b.waiting && b.waiting.passedWaitsGyr.length > 0 && (
        <div className="inspector-section">
          <h4 className="section-title">Waiting</h4>
          <p className="gf-text">
            The worlds that passed took {formatGyr(b.waiting.median)} (median) after {GATES.find((g) => g.id === b.waiting!.since)!.label.toLowerCase()};
            the middle half took {formatGyr(quantile(b.waiting.passedWaitsGyr, 0.25))} to {formatGyr(quantile(b.waiting.passedWaitsGyr, 0.75))}.
            {b.stopped > 0 && <> {formatPercent(b.waiting.stoppedUnderMedian)} of the worlds stopped here have had less time than that median: for them it may be <em>not yet</em> rather than <em>never</em>.</>}
          </p>
        </div>
      )}

      {b.fire && b.stopped > 0 && (
        <div className="inspector-section">
          <h4 className="section-title">Why there is no fire</h4>
          <p className="gf-text">
            Of the {formatInt(b.stopped)} minds without fire, {formatInt(b.fire.noLand)} have no exposed land, {formatInt(b.fire.lowOxygen)} too
            little oxygen and {formatInt(b.fire.thinAir)} too thin an air (a world can lack more than one).
          </p>
        </div>
      )}

      {stopped.length > 0 && (
        <div className="inspector-section">
          <div className="section-head">
            <h4 className="section-title">Worlds stopped here</h4>
            <span className="section-note">{stopped.length > MAX_LISTED ? `first ${MAX_LISTED} of ${formatInt(stopped.length)}` : formatInt(stopped.length)}</span>
          </div>
          <table className="gf-worlds">
            <thead><tr><th scope="col">World</th><th scope="col">Star</th><th scope="col">{measure.label}</th></tr></thead>
            <tbody>
              {stopped.slice(0, MAX_LISTED).map((i) => {
                const starId = index.starId[i];
                const planetIndex = index.planetIndex[i];
                return (
                  <tr key={i}>
                    <td>
                      <button type="button" className="entry-link" onClick={() => onOpenWorld(starId, planetIndex)} title="Open its system and its entry">
                        {planetName(starId, planetIndex)}
                      </button>
                    </td>
                    <td>{starName(starId)}</td>
                    <td className="gf-num">{measure.value(index, i, stars[starId])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function GreatFilterPanel({ index, stars, gate, onGate, onOpenWorld, onClose }: Props) {
  const funnel = useMemo(() => (index ? funnelOf(index) : null), [index]);
  const filterStep = funnel?.steps.find((s) => s.gate.id === funnel.filter) ?? null;
  return (
    <div className="gf-panel" role="dialog" aria-label="Great Filter">
      <div className="timeline-header">
        <div className="tl-panel-label">Great Filter</div>
        <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="gf-body">
        {!index || !funnel ? (
          <p className="gf-text">Waiting for the life survey: the funnel is counted from every world in the universe.</p>
        ) : (
          <>
            <p className="gf-text">
              Each gate counts the worlds that passed it and every gate above. The share is of the gate above; bars are on a log scale.
              {filterStep && <> The filter, the steepest gate that at least ten worlds reach, is <strong>{filterStep.gate.label}</strong>: {formatPercent(filterStep.share)} of the worlds that reach it pass.</>}
            </p>
            <FunnelBars funnel={funnel} gate={gate} onGate={onGate} />
            {gate && <Breakdown index={index} stars={stars} gate={gate} onOpenWorld={onOpenWorld} />}
            <p className="gf-limits">
              Fire is read from today's air and land, and a civilization's stages from its final tech level, until civilizations are lived
              step by step (Deep Time). Moons and rogue planets are not yet worlds.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
