/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — PostgreSQL Database Adapter
 *  Primary durable persistence for the VPS deployment.
 * ═══════════════════════════════════════════════════════
 */
import postgres from "postgres";

let sql = null;
let schemaReadyPromise = null;

async function createSchema() {
  if (!sql) return;

  await sql`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT 'Player',
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS account_identities (
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, external_id)
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS account_identities_account_id_idx
      ON account_identities (account_id);
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS player_events (
      id         BIGSERIAL PRIMARY KEY,
      user_id    TEXT        NOT NULL,
      username   TEXT,
      event_type TEXT        NOT NULL,
      metadata   JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS player_events_user_id_idx
      ON player_events (user_id);
  `;
  await sql`
    CREATE MATERIALIZED VIEW IF NOT EXISTS player_stats_view AS
    SELECT
      user_id,
      COUNT(*) FILTER (WHERE event_type = 'plant')     AS total_plants,
      COUNT(*) FILTER (WHERE event_type = 'harvest')   AS total_harvests,
      COUNT(*) FILTER (WHERE event_type = 'sell_crop') AS crops_sold,
      COUNT(*) FILTER (WHERE event_type = 'buy_plot')  AS plots_bought,
      MAX(created_at)                                  AS last_event_at
    FROM player_events
    GROUP BY user_id
    WITH DATA;
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS player_stats_view_user_id_idx
      ON player_stats_view (user_id);
  `;
}

export function initDb() {
  if (sql) return sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("⚠️ DATABASE_URL not set — Postgres database is disabled!");
    return null;
  }

  try {
    // VPS Postgres connection pool.
    // - max: keeps the app predictable on small VPS instances
    // - idle_timeout: prevents connection leaks
    sql = postgres(url, {
      max: 8, 
      idle_timeout: 10,
      prepare: false // Required for PgBouncer in transaction mode
    });
    console.log("🐘 PostgreSQL database initialized successfully.");
    
    schemaReadyPromise = createSchema().catch((err) => {
      console.error("Database schema init error:", err.message);
      throw err;
    });

  } catch (e) {
    console.warn("⚠️ Postgres init failed:", e.message);
    sql = null;
  }

  return sql;
}

export function getDb() {
  return sql;
}

export async function ensureDbSchema() {
  if (!schemaReadyPromise && sql) schemaReadyPromise = createSchema();
  if (schemaReadyPromise) await schemaReadyPromise;
}

export async function closeDb() {
  if (sql) {
    try {
      await sql.end({ timeout: 10 }); // End aggressively after 10s
    } catch (e) {
      console.error("Error closing Postgres:", e.message);
    }
    sql = null;
    schemaReadyPromise = null;
  }
}
