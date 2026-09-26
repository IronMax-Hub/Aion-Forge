// MySQL connection pool and schema setup.

import mysql from "mysql2/promise";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Settings } from "./env.js";
import { SCHEMA, COLUMN_MIGRATIONS, pendingMigrations } from "./schema.js";

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

/** Create any missing tables and columns. Safe to run on every start. */
export async function ensureSchema(pool: Pool): Promise<void> {
  for (const statement of SCHEMA) await pool.query(statement);

  const tables = [...new Set(COLUMN_MIGRATIONS.map((m) => m.table))];
  const [existing] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME AS \`table\`, COLUMN_NAME AS \`column\` FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`, [tables]);
  for (const m of pendingMigrations(existing as { table: string; column: string }[])) {
    // Identifiers are escaped with ??; the definition is a constant from schema.ts
    await pool.query(`ALTER TABLE ?? ADD COLUMN ?? ${m.definition}`, [m.table, m.column]);
    console.log(`Added column ${m.table}.${m.column}`);
  }
}
