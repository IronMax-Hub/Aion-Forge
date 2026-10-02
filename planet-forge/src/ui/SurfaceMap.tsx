import { useEffect, useRef } from "react";
import type { PlanetSpec } from "../spec/schema";
import { CELL_KIND } from "../spec/schema";
import { linearToBytes } from "./colour";

// The map's size in texels: one per degree. Each texel takes its nearest cell,
// so the map shows exactly what the spec says, cell by cell.
const MAP_WIDTH = 360;
const MAP_HEIGHT = 180;
/** Ground this hot glows. */
const MOLTEN_K = 900;

type RGB = [number, number, number];

const COLOURS: Record<string, RGB> = {
  shallow: [43, 95, 138],
  deep: [12, 35, 64],
  ice: [232, 238, 244],
  seaIce: [170, 196, 218],
  dry: [176, 138, 90],
  moist: [107, 106, 58],
  molten: [214, 84, 34],
};

function mix(a: RGB, b: RGB, t: number): RGB {
  const s = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

/** The colour of a cell on the map: a reading aid, not how the planet looks. */
function cellColour(spec: PlanetSpec, cell: PlanetSpec["surface"]["cells"][number], depthRangeKm: number): RGB {
  const [, , , heightKm, temperatureK, moisture, kind] = cell;
  if (kind === CELL_KIND.water) return mix(COLOURS.shallow, COLOURS.deep, (spec.surface.seaLevelKm - heightKm) / depthRangeKm);
  if (kind === CELL_KIND.ice) return heightKm < spec.surface.seaLevelKm ? COLOURS.seaIce : COLOURS.ice;
  if (temperatureK >= MOLTEN_K) return mix(COLOURS.dry, COLOURS.molten, (temperatureK - MOLTEN_K) / 400);
  let colour = mix(COLOURS.dry, COLOURS.moist, moisture * 2);
  const cover = spec.groundCover;
  const living = temperatureK > spec.surface.freezingK && temperatureK < spec.surface.boilingK;
  if (cover && living) colour = mix(colour, linearToBytes(cover.colourLinear), cover.cover * Math.min(1, moisture * 4));
  return colour;
}

/** A flat map of the spec's cells: longitude across, latitude up, for checking a planet before its globe exists. */
export function SurfaceMap({ spec }: { spec: PlanetSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { cells } = spec.surface;
    const depths = cells.filter((c) => c[6] === CELL_KIND.water).map((c) => spec.surface.seaLevelKm - c[3]);
    const depthRange = Math.max(0.001, ...depths);
    const colours = cells.map((c) => cellColour(spec, c, depthRange));

    const image = ctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
    for (let row = 0; row < MAP_HEIGHT; row++) {
      const lat = (90 - (row + 0.5) * (180 / MAP_HEIGHT)) * (Math.PI / 180);
      for (let col = 0; col < MAP_WIDTH; col++) {
        const lon = (-180 + (col + 0.5) * (360 / MAP_WIDTH)) * (Math.PI / 180);
        // The spec's body frame: +y north, longitude rising eastwards towards −z
        const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = -Math.cos(lat) * Math.sin(lon);
        let best = 0, bestDot = -Infinity;
        for (let i = 0; i < cells.length; i++) {
          const dot = cells[i][0] * x + cells[i][1] * y + cells[i][2] * z;
          if (dot > bestDot) { bestDot = dot; best = i; }
        }
        const [r, g, b] = colours[best];
        const at = (row * MAP_WIDTH + col) * 4;
        image.data[at] = r; image.data[at + 1] = g; image.data[at + 2] = b; image.data[at + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);

    // The equator, and the landing site if there is one
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, MAP_HEIGHT / 2);
    ctx.lineTo(MAP_WIDTH, MAP_HEIGHT / 2);
    ctx.stroke();
    if (spec.landing) {
      const px = ((spec.landing.longitudeDeg + 180) / 360) * MAP_WIDTH;
      const py = ((90 - spec.landing.latitudeDeg) / 180) * MAP_HEIGHT;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py);
      ctx.moveTo(px, py - 5); ctx.lineTo(px, py + 5);
      ctx.stroke();
    }
  }, [spec]);

  return (
    <figure className="surface-map">
      <canvas ref={canvasRef} width={MAP_WIDTH} height={MAP_HEIGHT}
        aria-label={`Flat map of ${spec.name}'s ${spec.surface.cells.length} surface cells`} role="img" />
      <figcaption>
        <span className="map-legend">
          <i style={{ background: "rgb(43,95,138)" }} />Water
          <i style={{ background: "rgb(170,196,218)" }} />Sea ice
          <i style={{ background: "rgb(232,238,244)" }} />Ice on land
          <i style={{ background: "rgb(176,138,90)" }} />Dry land
          <i style={{ background: "rgb(107,106,58)" }} />Moist land
          {spec.groundCover && <><i style={{ background: `rgb(${linearToBytes(spec.groundCover.colourLinear).join(",")})` }} />Ground cover</>}
          <i style={{ background: "rgb(214,84,34)" }} />Molten
          {spec.landing && <><i className="cross" />Landing site</>}
        </span>
        <span className="muted">The spec's cells, flat: a check, not the planet's look. Longitude −180° to 180° across, latitude 90° to −90° down.</span>
      </figcaption>
    </figure>
  );
}
