/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Postgres Database Adapter
 *  Replaces Firestore with an ACID relational database.
 * ═══════════════════════════════════════════════════════
 */
import postgres from "postgres";

let sql = null;

export function initDb() {
  if (sql) return sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("⚠️ DATABASE_URL not set — Postgres database is disabled!");
    return null;
  }

  try {
    // Transaction pooler optimizations (port 6543)
    // - max: strictly limit connections for Supabase Free tier
    // - idle_timeout: prevent connection leaks
    sql = postgres(url, {
      max: 8, 
      idle_timeout: 10,
      prepare: false // Required for PgBouncer in transaction mode
    });
    console.log("🐘 Postgres database initialized successfully via Transaction Pooler.");
    
    // Asynchronously create the tables but await them in order to 
    // prevent connection pool exhaustion (max: 8) on startup.
    (async () => {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS auth_users (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL
          );
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS auth_sessions (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            expires_at BIGINT NOT NULL
          );
        `;
      } catch (err) {
        console.error("Database schema init error:", err.message);
      }
    })();

  } catch (e) {
    console.warn("⚠️ Postgres init failed:", e.message);
    sql = null;
  }

  return sql;
}

export function getDb() {
  return sql;
}

export async function closeDb() {
  if (sql) {
    try {
      await sql.end({ timeout: 10 }); // End aggressively after 10s
    } catch (e) {
      console.error("Error closing Postgres:", e.message);
    }
    sql = null;
  }
}
