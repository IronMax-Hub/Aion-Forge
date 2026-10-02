import { useCallback, useEffect, useState } from "react";
import type { SketchInputs } from "./forge/inputs";
import { sketchPlanet } from "./forge/sketch";
import { presetSpec } from "./spec/presetFiles";
import type { FragmentRead } from "./spec/url";
import { encodeSpec, readSpecFromFragment } from "./spec/url";
import { ForgePanel } from "./ui/ForgePanel";
import { SpecFigures } from "./ui/SpecFigures";
import { SurfaceMap } from "./ui/SurfaceMap";
import { GroundView } from "./ui/GroundView";

/** Errors shown at most; the rest are counted. */
const MAX_ERRORS_SHOWN = 20;

type Shown = { state: "reading" } | FragmentRead;
type Site = { latitudeDeg: number; longitudeDeg: number };

/** Planet Forge: forges a planet from a preset or your inputs, or reads the one in the URL, and shows it. */
export default function App() {
  const [shown, setShown] = useState<Shown>({ state: "reading" });
  // Where the ground view stands: the landing site, or one picked on the map
  const [site, setSite] = useState<Site>({ latitudeDeg: 0, longitudeDeg: 0 });
  const [viewingGround, setViewingGround] = useState(false);
  const spec = "found" in shown && shown.found && shown.ok ? shown.spec : null;
  const closeGround = useCallback(() => setViewingGround(false), []);

  // The spec is read from the URL, on load and whenever its # part changes
  useEffect(() => {
    let current = true;
    const read = () => {
      readSpecFromFragment(window.location.hash).then((result) => {
        if (!current) return;
        setShown(result);
        // A new planet: back to its landing site, or longitude 0 on the equator
        const landing = result.found && result.ok ? result.spec.landing : undefined;
        setSite(landing ? { latitudeDeg: landing.latitudeDeg, longitudeDeg: landing.longitudeDeg } : { latitudeDeg: 0, longitudeDeg: 0 });
        setViewingGround(false);
      });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      current = false;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  // A forged planet goes into the URL, so it is read as a link from Aion Forge would be
  const forge = async (from: { presetId: string } | { inputs: SketchInputs }) => {
    const spec = "presetId" in from ? presetSpec(from.presetId) : sketchPlanet(from.inputs, "custom");
    window.location.hash = await encodeSpec(spec);
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>Planet Forge</h1>
        {"found" in shown && shown.found && shown.ok && <span className="app-planet">{shown.spec.name}</span>}
      </header>

      <div className="app-layout">
        <ForgePanel onForge={forge} />

        <div className="app-planet-view">
          {"state" in shown ? null : !shown.found ? (
            <section className="notice">
              <p>No planet loaded.</p>
              <p className="muted">Pick a preset or describe a planet, then press <em>Forge</em>. Planets from Aion Forge arrive here through <em>Go to the Surface</em>.</p>
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
              <SurfaceMap spec={shown.spec} site={site} onPick={setSite} onViewGround={() => setViewingGround(true)} />
              <SpecFigures spec={shown.spec} />
              {shown.warnings.length > 0 && (
                <section className="notice">
                  <p>Ignored:</p>
                  <ul className="warnings">{shown.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
      {viewingGround && spec && <GroundView spec={spec} site={site} onClose={closeGround} />}
    </main>
  );
}
