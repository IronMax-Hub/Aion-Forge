// MySQL connection pool and schema setup.

import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import type { Settings } from "./env.js";
import { SCHEMA } from "./schema.js";

export function createPool(settings: Settings["db"]): Pool {
  const pool = mysql.createPool({
    ...settings,
    connectionLimit: 5,
    timezone: "Z",            // convert JS Dates to and from DATETIME as UTC
    supportBigNumbers: true,  // BIGINT seeds come back as numbers while they fit
  });
  // Run MySQL's own clock (CURRENT_TIMESTAMP, e.g. updated_at) in UTC too, so every
  // DATETIME column uses the same zone whatever the server's local time zone is.
  pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  return pool;
}

/** Create any missing tables. Safe to run on every start. */
export async function ensureSchema(pool: Pool): Promise<void> {
  for (const statement of SCHEMA) await pool.query(statement);
}
