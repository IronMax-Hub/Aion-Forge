import { useEffect, useRef, useState } from "react";
import type { PlanetSpec } from "../spec/schema";
import { GroundRenderer } from "../ground/GroundRenderer";
import { directionOf } from "../terrain/landing";
import type { GroundStats } from "../ground/GroundRenderer";
import { figure } from "./format";

interface Props {
  spec: PlanetSpec;
  site: { latitudeDeg: number; longitudeDeg: number };
  onClose: () => void;
}

// The height slider runs from 2 m to 2,000 km, logarithmically
const LOWEST_M = 2;
const HIGHEST_M = 2_000_000;
const STATS_EVERY_MS = 250;
/** Degrees turned per pixel dragged. */
const DRAG_DEG_PER_PX = 0.2;

function heightText(m: number): string {
  return m >= 1000 ? `${figure(m / 1000, 3)} km` : `${figure(m, 3)} m`;
}

/** A direction in the body frame with the sun `elevationDeg` above the site's horizon, towards the south-east. */
function sunOver(site: { latitudeDeg: number; longitudeDeg: number }, elevationDeg: number): [number, number, number] {
  const up = directionOf(site.latitudeDeg, site.longitudeDeg);
  const lon = site.longitudeDeg * (Math.PI / 180);
  const east = [-Math.sin(lon), 0, -Math.cos(lon)];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  const e = elevationDeg * (Math.PI / 180);
  const flat = [0, 1, 2].map((k) => (east[k] - north[k]) / Math.SQRT2);
  return [0, 1, 2].map((k) => Math.cos(e) * flat[k] + Math.sin(e) * up[k]) as [number, number, number];
}

/**
 * A temporary viewer for checking the ground (PF3): stand above a site, raise
 * or lower the camera, drag to look. PF5 replaces it with the real arrival
 * and the observer camera.
 */
export function GroundView({ spec, site, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GroundRenderer | null>(null);
  const [logHeight, setLogHeight] = useState(Math.log10(200));
  const [look, setLook] = useState({ yawDeg: 0, pitchDeg: -10 });
  const [stats, setStats] = useState<GroundStats | null>(null);
  // The sun's height over the site, from the south-east (a check aid; PF4 brings the time of day)
  const [sunDeg, setSunDeg] = useState(35);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const heightM = 10 ** logHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new GroundRenderer(canvas, spec);
    rendererRef.current = renderer;
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    const timer = window.setInterval(() => setStats({ ...renderer.stats }), STATS_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [spec]);

  useEffect(() => {
    rendererRef.current?.setView({ ...site, heightM, ...look });
  }, [site, heightM, look]);

  useEffect(() => {
    rendererRef.current?.setSunDirection(sunOver(site, sunDeg));
  }, [site, sunDeg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="ground-view" role="dialog" aria-label={`The ground of ${spec.name}`}>
      <canvas
        ref={canvasRef}
        className="ground-canvas"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setLook((l) => ({
            yawDeg: (l.yawDeg - dx * DRAG_DEG_PER_PX + 360) % 360,
            pitchDeg: Math.max(-89, Math.min(89, l.pitchDeg + dy * DRAG_DEG_PER_PX)),
          }));
        }}
        onPointerUp={() => { drag.current = null; }}
      />
      <div className="ground-controls">
        <div className="ground-title">
          <strong>{spec.name}</strong>
          <span className="muted">Ground check (PF3): drag to look</span>
        </div>
        <label className="field">
          <span className="field-label">Height</span>
          <span className="field-input">
            <input type="range" min={Math.log10(LOWEST_M)} max={Math.log10(HIGHEST_M)} step={0.01} value={logHeight}
              onChange={(e) => setLogHeight(Number(e.target.value))} aria-valuetext={heightText(heightM)} />
            <span className="field-unit ground-height">{heightText(heightM)}</span>
          </span>
        </label>
        <label className="field">
          <span className="field-label">Sun height</span>
          <span className="field-input">
            <input type="range" min={-10} max={90} step={1} value={sunDeg} onChange={(e) => setSunDeg(Number(e.target.value))} />
            <span className="field-unit ground-height">{sunDeg}°</span>
          </span>
        </label>
        <dl className="ground-readout">
          <dt>Site</dt><dd>{figure(site.latitudeDeg, 4)}°, {figure(site.longitudeDeg, 4)}°</dd>
          <dt>Looking</dt><dd>{Math.round(look.yawDeg)}° from north, {Math.round(look.pitchDeg)}° up</dd>
          {stats && <>
            <dt>Ground</dt><dd>{heightText(stats.groundM)} {stats.groundM < 0 ? "(under the sea)" : "above sea level"}</dd>
            <dt>Patches</dt><dd>{stats.patchesDrawn} drawn, {stats.patchesBuilding} building</dd>
            <dt>Frame</dt><dd>{figure(stats.frameMs, 3)} ms · split ×{figure(stats.splitFactor, 3)}</dd>
          </>}
        </dl>
        <button className="secondary" onClick={onClose}>Back</button>
      </div>
    </div>
  );
}
