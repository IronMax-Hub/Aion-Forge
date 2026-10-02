import { useEffect, useState } from "react";
import example from "../../contracts/planet-spec/examples/minimal.json";
import type { FragmentRead } from "./spec/url";
import { encodeSpec, readSpecFromFragment } from "./spec/url";
import type { PlanetSpec } from "./spec/schema";
import { SpecFigures } from "./ui/SpecFigures";

/** Errors shown at most; the rest are counted. */
const MAX_ERRORS_SHOWN = 20;

type Shown = { state: "reading" } | FragmentRead;

/** Planet Forge: reads the Planet Spec in the URL and shows it. */
export default function App() {
  const [shown, setShown] = useState<Shown>({ state: "reading" });

  // The spec is read from the URL, on load and whenever its # part changes
  useEffect(() => {
    let current = true;
    const read = () => {
      readSpecFromFragment(window.location.hash).then((result) => { if (current) setShown(result); });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      current = false;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  // The example goes into the URL, so it is read as a link from Aion Forge would be
  const openExample = async () => {
    window.location.hash = await encodeSpec(example as PlanetSpec);
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>Planet Forge</h1>
        {"found" in shown && shown.found && shown.ok && <span className="app-planet">{shown.spec.name}</span>}
      </header>

      {"state" in shown ? null : !shown.found ? (
        <section className="notice">
          <p>No planet loaded.</p>
          <p className="muted">
            Open a planet from Aion Forge with <em>Go to the Surface</em>, or open the example.
          </p>
          <button className="primary" onClick={openExample}>Open the example</button>
        </section>
      ) : !shown.ok ? (
        <section className="notice rejected" role="alert">
          <p>This planet's description could not be read.</p>
          <ul className="errors">
            {shown.errors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          {shown.errors.length > MAX_ERRORS_SHOWN && (
            <p className="muted">and {shown.errors.length - MAX_ERRORS_SHOWN} more</p>
          )}
        </section>
      ) : (
        <>
          <SpecFigures spec={shown.spec} />
          {shown.warnings.length > 0 && (
            <section className="notice">
              <p>Ignored:</p>
              <ul className="warnings">{shown.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
