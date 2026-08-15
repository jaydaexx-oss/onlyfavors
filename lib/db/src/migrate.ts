/**
 * Programmatic schema migration for the OnlyFavors application tables.
 *
 * Applies the SQL files in lib/db/drizzle/ using drizzle-orm's migrate()
 * function.  Safe to run multiple times — drizzle tracks applied migrations in
 * a __drizzle_migrations table and skips already-applied ones.
 *
 * Call this at server startup BEFORE the first DB operation.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Pool } = pg;

// Resolve the migrations folder relative to this file so it works regardless
// of the working directory the server is launched from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// In the dist build, this file is at dist/migrate.js; migrations are at dist/../drizzle/
// In source (ts-node / tsx), this file is at src/migrate.ts; migrations are at ../drizzle/
const migrationsFolder = join(__dirname, "..", "drizzle");

export async function runAppMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
