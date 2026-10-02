import { useEffect, useRef, useState } from "react";
import type { PlanetSpec } from "../spec/schema";
import { GroundRenderer } from "../ground/GroundRenderer";
import {
  daysUntilLocalTime, localTime, SECONDS_PER_DAY, solarDayHours, starElevationDeg, starMoves, subsolarAt, sunDirectionAt,
} from "../sky/dayClock";
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

/** A share of the day as a 24-hour clock: hh:mm. */
function clockText(time: number): string {
  const minutes = Math.floor(time * 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dayText(hours: number): string {
  return hours >= 48 ? `${figure(hours / 24, 3)} Earth days` : `${figure(hours, 3)} h`;
}

/**
 * A temporary viewer for checking the ground (PF3) and sky (PF4): stand above
 * a site, raise or lower the camera, drag to look, and run the day or set the
 * local time. PF5 replaces it with the real arrival and the observer camera.
 */
export function GroundView({ spec, site, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GroundRenderer | null>(null);
  const [logHeight, setLogHeight] = useState(Math.log10(200));
  const [look, setLook] = useState({ yawDeg: 0, pitchDeg: -10 });
  const [stats, setStats] = useState<GroundStats | null>(null);
  // Solar days since arrival, and whether the day is running (a new planet opens a new viewer: arrival time, paused)
  const [days, setDays] = useState(0);
  const [running, setRunning] = useState(false);
  const moves = starMoves(spec);
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
    rendererRef.current?.setSunDirection(sunDirectionAt(spec, days));
  }, [spec, days]);

  // The day runs at one solar day per SECONDS_PER_DAY
  useEffect(() => {
    if (!running) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      setDays((d) => d + (now - last) / 1000 / SECONDS_PER_DAY);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const subsolar = subsolarAt(spec, days);
  const time = localTime(subsolar, site.longitudeDeg);
  const elevation = starElevationDeg(site, subsolar);

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
          <span className="muted">Ground and sky check (PF3–PF4): drag to look</span>
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
          <span className="field-label">Local time</span>
          <span className="field-input">
            <input type="range" min={0} max={1} step={1 / (24 * 12)} value={time} disabled={!moves} aria-valuetext={clockText(time)}
              onChange={(e) => setDays(Math.floor(days) + daysUntilLocalTime(spec, site.longitudeDeg, Number(e.target.value)))} />
            <span className="field-unit ground-height">{clockText(time)}</span>
          </span>
        </label>
        {moves
          ? <button className="secondary" onClick={() => setRunning((r) => !r)}>{running ? "Pause the day" : `Run the day (${SECONDS_PER_DAY} s a day)`}</button>
          : <p className="muted small">Locked to its star: the star stands still.</p>}
        <dl className="ground-readout">
          <dt>Site</dt><dd>{figure(site.latitudeDeg, 4)}°, {figure(site.longitudeDeg, 4)}°</dd>
          <dt>Star</dt><dd>{figure(Math.round(elevation * 10) / 10 || 0, 3)}° up · day {moves ? dayText(solarDayHours(spec)) : "endless"}</dd>
          <dt>Looking</dt><dd>{Math.round(look.yawDeg)}° from north, {Math.round(look.pitchDeg)}° up</dd>
          {stats && <>
            <dt>Ground</dt><dd>{heightText(stats.groundM)} {stats.groundM < 0 ? "(under the sea)" : "above sea level"}</dd>
            <dt>Patches</dt><dd>{stats.patchesDrawn} drawn, {stats.patchesBuilding} building</dd>
            <dt>Frame</dt><dd>{figure(stats.frameMs, 3)} ms · split ×{figure(stats.splitFactor, 3)}</dd>
            <dt>Sky table</dt><dd>{figure(stats.skyMs, 2)} ms over {stats.skyFrames} frame{stats.skyFrames === 1 ? "" : "s"}</dd>
          </>}
        </dl>
        <button className="secondary" onClick={onClose}>Back</button>
      </div>
    </div>
  );
}
