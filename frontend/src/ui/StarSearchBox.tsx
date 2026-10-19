// The sidebar's "Find a star" box: the search (starSearch.ts) and its results.
// Choosing a result shows that star: the galaxy view glides to it and its panel opens.

import { useMemo, useState } from "react";
import type { Star } from "../simulation/star";
import { searchStars } from "./starSearch";
import type { SurveyFacts } from "./starSearch";
import { spectralType, starName, STELLAR_CLASS_NAME } from "./format";
import { starDisplayCss } from "../rendering/starColour";

/** At most this many results are listed; the count says how many matched. */
const MAX_LISTED = 40;

interface Props {
  stars: readonly Star[];
  /** The life survey's facts per star; null until the survey finishes. */
  facts: SurveyFacts | null;
  onPick: (star: Star) => void;
}

export function StarSearchBox({ stars, facts, onPick }: Props) {
  const [query, setQuery] = useState("");
  const result = useMemo(() => searchStars(query, stars, facts), [query, stars, facts]);
  const listed = result.stars.slice(0, MAX_LISTED);
  const asked = query.trim().length > 0;

  return (
    <div className="star-search">
      <input
        type="search"
        className="star-search-input"
        placeholder="416, G2, binary life…"
        aria-label="Find a star by number or traits"
        title="A star's number, or traits that must all hold: a spectral type (G, K2), red giant, white dwarf, binary, single, rare, metal-poor, life, civilization, planets"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && listed.length > 0) onPick(listed[0]);
          if (e.key === "Escape") setQuery("");
        }}
      />
      {asked && (
        <div className="star-search-status" role="status" aria-live="polite">
          {result.unknown.length > 0
            ? `Unknown: ${result.unknown.join(", ")}`
            : result.waitingForSurvey.length > 0
              ? `"${result.waitingForSurvey.join(", ")}" is known once the life survey finishes`
              : result.stars.length === 0
                ? "No star matches"
                : `${result.stars.length.toLocaleString()} star${result.stars.length === 1 ? "" : "s"}${result.stars.length > MAX_LISTED ? `, first ${MAX_LISTED} listed` : ""}`}
        </div>
      )}
      {listed.length > 0 && (
        <ul className="star-search-results">
          {listed.map((star) => {
            const kind = spectralType(star.temperature, star.classification) ?? STELLAR_CLASS_NAME[star.classification];
            const notes = [
              star.companion ? "binary" : null,
              facts?.living.has(star.id) ? "life" : null,
              facts?.civilized.has(star.id) ? "civ." : null,
            ].filter(Boolean).join(" · ");
            return (
              <li key={star.id}>
                <button type="button" className="star-search-result" onClick={() => onPick(star)}>
                  <span className="star-search-dot" style={{ background: starDisplayCss(star.temperature) }} aria-hidden="true" />
                  <span className="star-search-name">{starName(star.id)}</span>
                  <span className="star-search-kind">{kind}</span>
                  {notes && <span className="star-search-notes">{notes}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
