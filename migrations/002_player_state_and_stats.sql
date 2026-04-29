BEGIN;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_events_user_id_idx
  ON player_events (user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS player_stats_view AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE event_type = 'plant') AS total_plants,
  COUNT(*) FILTER (WHERE event_type = 'harvest') AS total_harvests,
  COUNT(*) FILTER (WHERE event_type = 'sell_crop') AS crops_sold,
  COUNT(*) FILTER (WHERE event_type = 'buy_plot') AS plots_bought,
  MAX(created_at) AS last_event_at
FROM player_events
GROUP BY user_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS player_stats_view_user_id_idx
  ON player_stats_view (user_id);

COMMIT;
