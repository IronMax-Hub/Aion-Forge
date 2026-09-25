// Aion Forge API: stores the app's saved data (Library, discoveries, experiment
// log, star bookmarks) in MySQL. Listens on localhost only; in development the
// frontend's Vite server proxies /api here.

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { readSettings } from "./env.js";
import { createPool, ensureSchema } from "./db.js";
import { apiRouter } from "./routes.js";

const settings = readSettings();
const pool = createPool(settings.db);
await ensureSchema(pool);

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", apiRouter(pool));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid data", issues: err.issues });
    return;
  }
  if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
    res.status(409).json({ error: "Already saved" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Database error" });
});

app.listen(settings.apiPort, "127.0.0.1", () => {
  console.log(`Aion Forge API on http://127.0.0.1:${settings.apiPort} (database "${settings.db.database}")`);
});
