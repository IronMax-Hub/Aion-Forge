// The black hole close-up's stats readout (Documents/Black-Hole-Phone-Quality.md, BH5).
//
// Why it exists: the phone's quality level is tuned by measuring, and the phone
// is not connected to the computer. The readout puts the numbers on the screen
// for the owner to read or record: the level being traced, how often frames are
// traced, Android's heat status, and how long the close-up has been open. A tap
// on the level picks the next one, so one build can measure them all; the heat
// guard may still trace a hot phone lower than the level picked, and the speed
// guard lowers a level the GPU cannot keep up with (it says so here).
//
// Shown only when the build asks for it (VITE_BLACK_HOLE_STATS=on). Presentation only.

import { useEffect, useState } from "react";
import type { BlackHoleStats } from "../rendering/blackHole/BlackHoleView";
import { QUALITY_LEVELS, THERMAL_STATUS_NAMES } from "../rendering/blackHole/quality";
import type { BlackHoleQualityLevel } from "../rendering/blackHole/quality";
import type { ThermalReading } from "../native/thermal";

const REFRESH_MS = 1000;

interface Props {
  readStats: () => BlackHoleStats | null;
  /** The phone's last heat reading, or null in a browser. */
  thermal: ThermalReading | null;
  /** The level picked; the one traced may be lower while the phone is hot. */
  chosen: BlackHoleQualityLevel;
  onChoose: (level: BlackHoleQualityLevel) => void;
  /** What the speed guard last did, if anything. */
  speedGuardNote: string | null;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function heatText(thermal: ThermalReading | null): string {
  if (!thermal || thermal.status < 0) return "—";
  const name = THERMAL_STATUS_NAMES[thermal.status] ?? String(thermal.status);
  return thermal.headroom === undefined ? name : `${name} · headroom ${thermal.headroom.toFixed(2)}`;
}

export function BlackHoleStatsReadout({ readStats, thermal, chosen, onChoose, speedGuardNote }: Props) {
  const [stats, setStats] = useState(readStats);
  const [openedMs] = useState(() => performance.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStats(readStats());
      setElapsedMs(performance.now() - openedMs);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [readStats, openedMs]);

  return (
    <dl className="bh-stats" aria-label="Black hole close-up stats">
      <dt>Level</dt>
      <dd>
        <button type="button" className="bh-stats-level" onClick={() => onChoose(QUALITY_LEVELS[(QUALITY_LEVELS.indexOf(chosen) + 1) % QUALITY_LEVELS.length])}>
          {chosen} ▸
        </button>
      </dd>
      <dt>Traced</dt><dd>{stats ? `${stats.level} · ${stats.width}×${stats.height}` : "—"}</dd>
      <dt>Rate</dt><dd>{stats ? `${stats.fps} fps` : "—"}</dd>
      <dt>Heat</dt><dd>{heatText(thermal)}</dd>
      <dt>Battery</dt><dd>{thermal?.batteryTempC === undefined ? "—" : `${thermal.batteryTempC.toFixed(1)} °C`}</dd>
      <dt>Open for</dt><dd>{formatElapsed(elapsedMs)}</dd>
      {speedGuardNote && <><dt>Guard</dt><dd>{speedGuardNote}</dd></>}
    </dl>
  );
}
