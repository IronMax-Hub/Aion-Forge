// The encyclopedia on screen (Galaxy Through Time, EN3).
//
// Why it exists: the entry writers (encyclopedia/entries.ts) turn simulation
// data into articles; this shows one as a catalogue page and lets the reader
// follow its links.
//
// How: EntryView renders an Entry and keeps its own back stack of subjects, so
// following a link and coming back never disturbs the rest of the app. It asks
// the app for each entry (`entryFor`), which knows how to make the subject's
// data. The inspectors show it in their Entry tab; EncyclopediaPanel shows it
// floating over the stage, for the galaxy and for worlds opened from elsewhere.
//
// Limits: links lead to what an entry names (its star, its planet, the galaxy,
// a system's planets); travelling across the galaxy belongs to the atlas (GA4).

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Entry, Sentence, SubjectRef } from "./encyclopedia/entry";
import { formatGyr } from "./format";
import { subjectKey, subjectLabel } from "./encyclopedia/subjects";

interface EntryViewProps {
  /** The entry first shown. Give the view a new `key` to start again from another subject. */
  subject: SubjectRef;
  /** Makes the entry for a subject, or null if it cannot be made. */
  entryFor: (ref: SubjectRef) => Entry | null;
  /** Buttons shown under the entry's heading (EN4: copy and save). */
  actions?: (entry: Entry) => ReactNode;
}

function SentenceText({ sentence, onFollow }: { sentence: Sentence; onFollow: (ref: SubjectRef) => void }) {
  if (!sentence.link) return <>{sentence.text}</>;
  const link = sentence.link;
  return (
    <button type="button" className="entry-link" onClick={() => onFollow(link)} title={`Read the entry for ${subjectLabel(link)}`}>
      {sentence.text}
    </button>
  );
}

/** One entry as a catalogue page, with links that open other entries in place. */
export function EntryView({ subject, entryFor, actions }: EntryViewProps) {
  const [stack, setStack] = useState<SubjectRef[]>([subject]);
  const current = stack[stack.length - 1];
  // Made once per subject and source: writing an entry reads every world in the index
  const entry = useMemo(() => entryFor(current), [entryFor, current]);
  const follow = (ref: SubjectRef) => {
    if (subjectKey(ref) !== subjectKey(current)) setStack([...stack, ref]);
  };
  const back = () => setStack(stack.slice(0, -1));

  if (!entry) {
    return <div className="entry"><p className="entry-empty">No entry can be written for {subjectLabel(current)}.</p></div>;
  }

  return (
    <article className="entry" aria-label={`Entry: ${entry.designation}`}>
      <header className="entry-head">
        {stack.length > 1 && (
          <button type="button" className="tl-filter-btn entry-back" onClick={back}>
            ← {subjectLabel(stack[stack.length - 2])}
          </button>
        )}
        <h3 className="entry-title">{entry.title}</h3>
        <div className="entry-designation">{entry.designation}</div>
        <div className="entry-citation">{entry.citation}</div>
        {actions && <div className="entry-actions">{actions(entry)}</div>}
      </header>

      <p className="entry-lede">
        {entry.lede.map((s, i) => (
          <span key={i}>{i > 0 && " "}<SentenceText sentence={s} onFollow={follow} /></span>
        ))}
      </p>

      {entry.facts.length > 0 && (
        <section className="inspector-section">
          <h4 className="section-title">Facts</h4>
          <dl className="data-grid entry-facts">
            {entry.facts.map((f) => (
              <div className="entry-fact" key={f.label}>
                <dt className="data-label">{f.label}</dt>
                <dd className="data-value data-text">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {entry.chronicle.length > 0 && (
        <section className="inspector-section">
          <h4 className="section-title">Chronicle</h4>
          <ol className="entry-chronicle">
            {entry.chronicle.map((c, i) => (
              <li key={i}>
                <span className="entry-when">{formatGyr(c.agoGyr)} ago</span>
                <span className="entry-what"><SentenceText sentence={c.sentence} onFollow={follow} /></span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {entry.notable.length > 0 && (
        <section className="inspector-section">
          <h4 className="section-title">Notable</h4>
          <ul className="entry-list">
            {entry.notable.map((s, i) => <li key={i}><SentenceText sentence={s} onFollow={follow} /></li>)}
          </ul>
        </section>
      )}

      {entry.seeAlso.length > 0 && (
        <section className="inspector-section">
          <h4 className="section-title">See also</h4>
          <ul className="entry-see-also">
            {entry.seeAlso.map((ref) => (
              <li key={subjectKey(ref)}>
                <button type="button" className="entry-link" onClick={() => follow(ref)}>{subjectLabel(ref)}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.limits.length > 0 && (
        <section className="inspector-section">
          <h4 className="section-title">What the record cannot show</h4>
          <ul className="entry-list entry-limits">
            {entry.limits.map((s, i) => <li key={i}>{s.text}</li>)}
          </ul>
        </section>
      )}
    </article>
  );
}

interface PanelProps extends EntryViewProps {
  onClose: () => void;
}

/** An entry floating over the stage: the galaxy's, or a world's opened from another panel. */
export function EncyclopediaPanel({ onClose, ...view }: PanelProps) {
  return (
    <div className="encyclopedia-panel" role="dialog" aria-label="Encyclopedia">
      <div className="timeline-header">
        <div className="tl-panel-label">Encyclopedia</div>
        <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="encyclopedia-body">
        <EntryView key={subjectKey(view.subject)} {...view} />
      </div>
    </div>
  );
}
