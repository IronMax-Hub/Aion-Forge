// The Physics page (Documents/Physics-Page.md, PH1).
//
// Why it exists: to show, in one place, every rule the simulation runs on and
// what each did to the universe on screen.
//
// How: a page over the stage and the dock (the sidebar stays usable). A
// table of contents on the left; the laboratory's laws, with the rules each
// reaches; then the catalogue's chapters as cards (ui/physics/). Each card's
// effect is computed from the universe on screen when it is shown; cards
// that need the universe index wait for the life survey.
//
// Limits: effects are measured, not counterfactual.

import { useMemo } from "react";
import { CONFIG_LABELS, DEFAULT_CONFIG } from "../simulation/config";
import { makeUniverseId } from "../simulation/persistence";
import { SIMULATION_RULES_VERSION } from "../simulation/version";
import type { LawKey, PhysicsContext, RuleCard } from "./physics/catalogue";
import { LAW_DOES } from "./physics/catalogue";
import { CHAPTERS } from "./physics/chapters";

interface Props {
  ctx: PhysicsContext;
  onClose: () => void;
}

const LAWS = Object.keys(DEFAULT_CONFIG) as LawKey[];

/** What a card did to this universe; a card that cannot be measured says why. */
function Effect({ card, ctx }: { card: RuleCard; ctx: PhysicsContext }) {
  const waiting = card.needsIndex && !ctx.index;
  const sentences = useMemo(() => (card.effect && !waiting ? card.effect(ctx) : null), [card, ctx, waiting]);
  return (
    <div className="physics-effect">
      <h5 className="physics-label">In this universe</h5>
      {waiting ? <p className="physics-muted">Waiting for the life survey.</p>
        : sentences ? <p>{sentences.map((s) => s.text).join(" ")}</p>
        : <p className="physics-muted">{card.noEffect ?? "Not measured in this universe."}</p>}
    </div>
  );
}

function Card({ card, ctx }: { card: RuleCard; ctx: PhysicsContext }) {
  return (
    <article className="physics-card" id={`rule-${card.id}`} aria-labelledby={`rule-${card.id}-title`}>
      <h4 className="physics-card-title" id={`rule-${card.id}-title`}>{card.title}</h4>
      <p className="physics-statement">{card.statement}</p>
      {card.rule && (
        <details className="physics-rule">
          <summary>The rule as computed</summary>
          <code>{card.rule}</code>
        </details>
      )}
      <Effect card={card} ctx={ctx} />
      {card.constants.length > 0 && (
        <table className="physics-constants">
          <tbody>
            {card.constants.map((c) => (
              <tr key={c.name}><th scope="row">{c.name}</th><td className="physics-value">{c.value}</td><td>{c.meaning}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p><span className="physics-label">Why</span> {card.why}</p>
      {card.source && <p><span className="physics-label">Source</span> {card.source}</p>}
      {card.laws.length > 0 && (
        <p><span className="physics-label">Laws</span> {card.laws.map((l) => `${CONFIG_LABELS[l.law]} (${ctx.config[l.law].toFixed(2)}×): ${l.how}`).join("; ")}.</p>
      )}
      {card.limits.length > 0 && (
        <ul className="physics-limits">{card.limits.map((l) => <li key={l}>{l}</li>)}</ul>
      )}
      <p className="physics-code">{card.code}</p>
    </article>
  );
}

export function PhysicsPage({ ctx, onClose }: Props) {
  // Which cards each law reaches, from the cards themselves
  const reached = useMemo(() => new Map(LAWS.map((law) => [law,
    CHAPTERS.flatMap((ch) => ch.cards.filter((c) => c.laws.some((l) => l.law === law)))])), []);

  return (
    <section className="physics-page" aria-label="Physics">
      <header className="physics-head">
        <div>
          <h2 className="physics-title">Physics</h2>
          <p className="physics-muted">Every rule this universe runs on, and what it did here. {makeUniverseId(ctx.config.seed)} · rules v{SIMULATION_RULES_VERSION}. Effects are measured in this universe, not what it would be without the rule.</p>
        </div>
        <button className="inspector-btn" onClick={onClose} aria-label="Close physics">✕</button>
      </header>

      <div className="physics-layout">
        <nav className="physics-toc" aria-label="Chapters">
          <a href="#physics-laws">The laboratory's laws</a>
          {CHAPTERS.map((ch, i) => (
            <div key={ch.id}>
              <a href={`#chapter-${ch.id}`} className="physics-toc-chapter">{i + 1}. {ch.title}</a>
              {ch.cards.map((c) => <a key={c.id} href={`#rule-${c.id}`}>{c.title}</a>)}
            </div>
          ))}
        </nav>

        <div className="physics-body">
          <section id="physics-laws" className="physics-chapter" aria-labelledby="physics-laws-title">
            <h3 id="physics-laws-title" className="physics-chapter-title">The laboratory's laws</h3>
            <p className="physics-muted">Six multipliers set in the laboratory; 1.00× is the familiar universe.</p>
            <dl className="physics-laws">
              {LAWS.map((law) => (
                <div key={law} className="physics-law">
                  <dt>{CONFIG_LABELS[law]} <span className={`physics-value${ctx.config[law] !== DEFAULT_CONFIG[law] ? " modified" : ""}`}>{ctx.config[law].toFixed(2)}×</span></dt>
                  <dd>
                    {LAW_DOES[law]}
                    {(reached.get(law)?.length ?? 0) > 0 && <> Reaches: {reached.get(law)!.map((c, i) => (
                      <span key={c.id}>{i > 0 && ", "}<a href={`#rule-${c.id}`}>{c.title}</a></span>
                    ))}.</>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {CHAPTERS.map((ch, i) => (
            <section key={ch.id} id={`chapter-${ch.id}`} className="physics-chapter" aria-labelledby={`chapter-${ch.id}-title`}>
              <h3 id={`chapter-${ch.id}-title`} className="physics-chapter-title">{i + 1}. {ch.title}</h3>
              <p className="physics-muted">{ch.intro}</p>
              {ch.cards.map((card) => <Card key={card.id} card={card} ctx={ctx} />)}
              {ch.missing.length > 0 && (
                <div className="physics-missing">
                  <h4 className="physics-label">Not in the model yet</h4>
                  <ul>{ch.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
