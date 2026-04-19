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
        // Analytics event log — fire-and-forget writes from farm/resource routes.
        // Used by player_stats_view (below) to power the PlayerJournal stats panel.
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
        // Index for fast per-user lookups (matview refresh + /api/farm/stats)
        await sql`
          CREATE INDEX IF NOT EXISTS player_events_user_id_idx
            ON player_events (user_id);
        `;
        // Materialized view — refreshed every 5 min by server.js startup loop.
        // Aggregates lifecycle events into per-user stat counters consumed by
        // PlayerJournal.jsx (total_plants, total_harvests, crops_sold, plots_bought).
        await sql`
          CREATE MATERIALIZED VIEW IF NOT EXISTS player_stats_view AS
          SELECT
            user_id,
            COUNT(*) FILTER (WHERE event_type = 'plant')     AS total_plants,
            COUNT(*) FILTER (WHERE event_type = 'harvest')   AS total_harvests,
            COUNT(*) FILTER (WHERE event_type = 'sell_crop') AS crops_sold,
            COUNT(*) FILTER (WHERE event_type = 'buy_plot')  AS plots_bought,
            MAX(created_at)                                   AS last_event_at
          FROM player_events
          GROUP BY user_id
          WITH DATA;
        `;
        // Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
        await sql`
          CREATE UNIQUE INDEX IF NOT EXISTS player_stats_view_user_id_idx
            ON player_stats_view (user_id);
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
