// HTTP API for saved data. Every handler validates its input and uses
// placeholders for all values; table and column names come only from this file.

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import {
  universeSchema, universePatchSchema, universeToRow, rowToUniverse,
  recountSchema, recountToColumns,
  discoverySchema, discoveryToRow, rowToDiscovery,
  experimentSchema, experimentToRow, rowToExperiment,
  bookmarkSchema, bookmarkToRow, rowToBookmark,
  importSchema,
} from "./records.js";
import type { UniverseRow, DiscoveryRow, ExperimentRow, BookmarkRow } from "./records.js";

type Handler = (req: Request, res: Response) => Promise<void>;

/** Pass async errors to Express's error handler. */
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

const bigIdParam = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export function apiRouter(pool: Pool): Router {
  const router = Router();

  router.get("/health", route(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  }));

  // ── Universes (Library) ───────────────────────────────────────────────────

  router.get("/universes", route(async (_req, res) => {
    const [rows] = await pool.query<(UniverseRow & RowDataPacket)[]>(
      "SELECT * FROM universes ORDER BY created_at DESC");
    res.json(rows.map(rowToUniverse));
  }));

  // Saving the same seed again replaces the earlier record, as the Library always has.
  router.put("/universes/:snapshotId", route(async (req, res) => {
    const universe = universeSchema.parse(req.body);
    if (universe.snapshotId !== req.params.snapshotId) {
      res.status(400).json({ error: "snapshotId in the URL and body differ" });
      return;
    }
    const row = universeToRow(universe);
    await pool.query("INSERT INTO universes SET ? ON DUPLICATE KEY UPDATE ?", [row, row]);
    res.json(universe);
  }));

  router.patch("/universes/:snapshotId", route(async (req, res) => {
    const patch = universePatchSchema.parse(req.body);
    const columns: Record<string, unknown> = {};
    if (patch.name !== undefined)       columns.name = patch.name;
    if (patch.notes !== undefined)      columns.notes = patch.notes;
    if (patch.isFavorite !== undefined) columns.is_favorite = patch.isFavorite;
    if (Object.keys(columns).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE universes SET ? WHERE snapshot_id = ?", [columns, req.params.snapshotId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "Universe not found" }); return; }
    const [rows] = await pool.query<(UniverseRow & RowDataPacket)[]>(
      "SELECT * FROM universes WHERE snapshot_id = ?", [req.params.snapshotId]);
    res.json(rowToUniverse(rows[0]));
  }));

  // Recount: the counts from regenerating the universe under newer rules. Kept apart
  // from the ordinary PATCH so that editing a name or note can never touch counts.
  router.patch("/universes/:snapshotId/counts", route(async (req, res) => {
    const recount = recountSchema.parse(req.body);
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE universes SET ? WHERE snapshot_id = ?", [recountToColumns(recount), req.params.snapshotId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "Universe not found" }); return; }
    const [rows] = await pool.query<(UniverseRow & RowDataPacket)[]>(
      "SELECT * FROM universes WHERE snapshot_id = ?", [req.params.snapshotId]);
    res.json(rowToUniverse(rows[0]));
  }));

  router.delete("/universes/:snapshotId", route(async (req, res) => {
    await pool.query("DELETE FROM universes WHERE snapshot_id = ?", [req.params.snapshotId]);
    res.status(204).end();
  }));

  // ── Discoveries ───────────────────────────────────────────────────────────

  router.get("/discoveries", route(async (_req, res) => {
    const [rows] = await pool.query<(DiscoveryRow & RowDataPacket)[]>(
      "SELECT * FROM discoveries ORDER BY saved_at DESC");
    res.json(rows.map(rowToDiscovery));
  }));

  // Saving a discovery twice keeps the first record.
  router.post("/discoveries", route(async (req, res) => {
    const discovery = discoverySchema.parse(req.body);
    await pool.query("INSERT IGNORE INTO discoveries SET ?", [discoveryToRow(discovery)]);
    res.status(201).json(discovery);
  }));

  router.delete("/discoveries/:id", route(async (req, res) => {
    await pool.query("DELETE FROM discoveries WHERE id = ?", [req.params.id]);
    res.status(204).end();
  }));

  // ── Experiments ───────────────────────────────────────────────────────────

  router.get("/experiments", route(async (_req, res) => {
    const [rows] = await pool.query<(ExperimentRow & RowDataPacket)[]>(
      "SELECT * FROM experiments ORDER BY recorded_at DESC");
    res.json(rows.map(rowToExperiment));
  }));

  router.post("/experiments", route(async (req, res) => {
    const experiment = experimentSchema.parse(req.body);
    await pool.query("INSERT INTO experiments SET ?", [experimentToRow(experiment)]);
    res.status(201).json(experiment);
  }));

  // ── Star bookmarks ────────────────────────────────────────────────────────

  router.get("/bookmarks", route(async (_req, res) => {
    const [rows] = await pool.query<(BookmarkRow & RowDataPacket)[]>(
      "SELECT * FROM star_bookmarks ORDER BY saved_at DESC");
    res.json(rows.map(rowToBookmark));
  }));

  router.put("/bookmarks/:galaxySeed/:starId", route(async (req, res) => {
    const bookmark = bookmarkSchema.parse(req.body);
    if (bookmark.galaxySeed !== bigIdParam.parse(req.params.galaxySeed) || bookmark.starId !== bigIdParam.parse(req.params.starId)) {
      res.status(400).json({ error: "Bookmark in the URL and body differ" });
      return;
    }
    await pool.query("INSERT IGNORE INTO star_bookmarks SET ?", [bookmarkToRow(bookmark)]);
    res.json(bookmark);
  }));

  router.delete("/bookmarks/:galaxySeed/:starId", route(async (req, res) => {
    await pool.query("DELETE FROM star_bookmarks WHERE galaxy_seed = ? AND star_id = ?",
      [bigIdParam.parse(req.params.galaxySeed), bigIdParam.parse(req.params.starId)]);
    res.status(204).end();
  }));

  // ── One-time import from the browser's old localStorage data ──────────────
  // Inserts only what is not already stored; never overwrites database rows.

  router.post("/import", route(async (req, res) => {
    const data = importSchema.parse(req.body);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const u of data.universes)   await connection.query("INSERT IGNORE INTO universes SET ?",      [universeToRow(u)]);
      for (const d of data.discoveries) await connection.query("INSERT IGNORE INTO discoveries SET ?",    [discoveryToRow(d)]);
      for (const e of data.experiments) await connection.query("INSERT IGNORE INTO experiments SET ?",    [experimentToRow(e)]);
      for (const b of data.bookmarks)   await connection.query("INSERT IGNORE INTO star_bookmarks SET ?", [bookmarkToRow(b)]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
    res.json({
      universes: data.universes.length, discoveries: data.discoveries.length,
      experiments: data.experiments.length, bookmarks: data.bookmarks.length,
    });
  }));

  return router;
}
