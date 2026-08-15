/**
 * Programmatic schema migration for the OnlyFavors application tables.
 *
 * Applies the SQL files in lib/db/drizzle/ using drizzle-orm's migrate()
 * function.  Safe to run multiple times — drizzle tracks applied migrations in
 * a __drizzle_migrations table and skips already-applied ones.
 *
 * Call this at server startup BEFORE the first DB operation.
 *
 * IMPORTANT — migrationsFolder must be supplied by the call-site.
 * When @workspace/db is bundled by esbuild into the api-server, import.meta.url
 * resolves to the bundle's entry point, NOT this source file.  A hard-coded
 * relative path would therefore look in the wrong directory at runtime.
 * Callers must pass the absolute path to lib/db/drizzle/ explicitly.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

export async function runAppMigrations(
  databaseUrl: string,
  migrationsFolder: string,
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
