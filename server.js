import "dotenv/config";
import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";

import { getAccountReport } from "./accountManager.js";
import { ensureDbSchema, initDb, getDb } from "./db.js";
import { getRedisHealth, initRedis } from "./redisAdapter.js";
import { initSocket } from "./socketManager.js";
import { requireAuth, resolveUser } from "./middleware/auth.js";
import { defaultLimiter } from "./middleware/rateLimit.js";

import batchRoutes from "./routes/batch.js";
import farmRoutes from "./routes/farm.js";
import resourcesRoutes from "./routes/resources.js";
import playerRoutes from "./routes/player.js";
import triviaRoutes from "./routes/trivia.js";
import match3Routes from "./routes/match3.js";
import bloxRoutes from "./routes/blox.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import mergeRoutes from "./routes/mergeRoutes.js";
import questRoutes from "./routes/questRoutes.js";
import achievementRoutes from "./routes/achievements.js";
import eventRoutes from "./routes/events.js";
import seasonPassRoutes from "./routes/seasonpass.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"));

const APP_VERSION = pkg.version;
const APP_BUILD_ID = process.env.APP_BUILD_ID || process.env.BUILD_ID || process.env.GITHUB_SHA?.slice(0, 12) || `${APP_VERSION}-local`;
const PORT = process.env.PORT || 8090;
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "";
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || (CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}` : "");
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "";

export const app = express();
const playerStatsRefreshState = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
};

export function getPlayerStatsRefreshStatus() {
  return { ...playerStatsRefreshState };
}

export function resetPlayerStatsRefreshStatusForTests() {
  playerStatsRefreshState.lastAttemptAt = null;
  playerStatsRefreshState.lastSuccessAt = null;
  playerStatsRefreshState.lastError = null;
}

export async function refreshPlayerStatsView(database = getDb(), now = Date.now()) {
  const attemptedAt = new Date(now).toISOString();
  playerStatsRefreshState.lastAttemptAt = attemptedAt;
  if (!database) {
    playerStatsRefreshState.lastError = "PostgreSQL unavailable";
    return false;
  }
  try {
    await database`REFRESH MATERIALIZED VIEW CONCURRENTLY player_stats_view`;
    playerStatsRefreshState.lastSuccessAt = attemptedAt;
    playerStatsRefreshState.lastError = null;
    return true;
  } catch (err) {
    playerStatsRefreshState.lastError = err?.message || String(err);
    console.error("Failed to refresh player_stats_view:", playerStatsRefreshState.lastError);
    return false;
  }
}

app.use(compression());
app.use(express.json({ limit: "1mb" }));

function getAllowedOrigins() {
  const origins = new Set([
    "https://web.telegram.org",
    "https://telegram.org",
  ]);
  if (CUSTOM_DOMAIN) {
    origins.add(`https://${CUSTOM_DOMAIN}`);
    origins.add(`http://${CUSTOM_DOMAIN}`);
  }
  if (PUBLIC_APP_URL) origins.add(PUBLIC_APP_URL.replace(/\/$/, ""));
  return origins;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const isAllowed =
    process.env.NODE_ENV !== "production" ||
    !origin ||
    allowedOrigins.has(origin) ||
    origin.endsWith(".telegram.org");

  if (isAllowed) {
    res.set("Access-Control-Allow-Origin", origin || "*");
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((_req, res, next) => {
  const frameAncestors = ["'self'", "https://web.telegram.org", "https://*.telegram.org"];
  if (CUSTOM_DOMAIN) frameAncestors.push(`https://${CUSTOM_DOMAIN}`);
  res.set("Content-Security-Policy", `frame-ancestors ${frameAncestors.join(" ")}`);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-XSS-Protection", "0");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/config") || req.path.startsWith("/health")) return next();
  if (
    req.path.startsWith("/player/") ||
    req.path.startsWith("/farm/") ||
    req.path.startsWith("/merge/") ||
    req.path.startsWith("/game/") ||
    req.path.startsWith("/blox/")
  ) {
    return next();
  }
  return defaultLimiter(req, res, next);
});

app.get("/api/config", (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.json({
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    publicAppUrl: PUBLIC_APP_URL || null,
    telegramBotUsername: TELEGRAM_BOT_USERNAME || null,
    telegramAuthRequired: process.env.NODE_ENV === "production",
    devAuthEnabled: process.env.DEV_AUTH_ENABLED === "true" && process.env.NODE_ENV !== "production",
  });
});

app.get("/api/health", async (_req, res) => {
  let postgres = false;
  try {
    const sql = getDb();
    if (sql) {
      await sql`SELECT 1`;
      postgres = true;
    }
  } catch (e) {
    console.error("Health check PostgreSQL error:", e.message);
  }
  const redisStatus = await getRedisHealth();
  const playerStatsView = getPlayerStatsRefreshStatus();
  const redisHealthy = !redisStatus.configured || redisStatus.connected;
  const statsRefreshHealthy = !playerStatsView.lastError;

  res.json({
    status: postgres && redisHealthy && statsRefreshHealthy ? "ok" : "degraded",
    uptime: Math.floor(process.uptime()),
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    postgres,
    redis: redisStatus.connected,
    redisStatus,
    playerStatsView,
    triviaDuelRooms: {
      scope: triviaRouter._duelRoomScope || "process-local",
      activeRooms: triviaRouter._duelRooms?.size || 0,
      waitingRooms: triviaRouter._waitingRoomsByUser?.size || 0,
      historyEntries: triviaRouter._duelHistory?.length || 0,
    },
  });
});

app.get("/api/health/ping", (_req, res) => {
  res.status(200).send("PONG");
});

app.get("/api/admin/account-report", requireAuth, async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || req.headers["x-admin-token"] !== adminToken) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(await getAccountReport());
});

const triviaRouter = triviaRoutes(requireAuth, resolveUser);
app.use(farmRoutes(requireAuth, resolveUser));
app.use(resourcesRoutes(requireAuth, resolveUser));
app.use(playerRoutes(requireAuth, resolveUser));
app.use(triviaRouter);
app.use(match3Routes(requireAuth, resolveUser));
app.use(bloxRoutes(requireAuth, resolveUser));
app.use(leaderboardRoutes());
app.use(mergeRoutes(requireAuth, resolveUser));
app.use(questRoutes(requireAuth, resolveUser));
app.use(achievementRoutes(requireAuth, resolveUser));
app.use(eventRoutes(requireAuth));
app.use(seasonPassRoutes(requireAuth, resolveUser));
app.use(batchRoutes(requireAuth, resolveUser, PORT, app));

app.get("/api/clear-cache", (_req, res) => {
  res.set("Clear-Site-Data", '"cache", "storage"');
  res.json({ cleared: true });
});

let indexHtmlTemplate = null;
function getIndexHtml() {
  if (!indexHtmlTemplate) {
    const distIndex = path.join(__dirname, "dist", "index.html");
    const rootIndex = path.join(__dirname, "index.html");
    indexHtmlTemplate = fs.readFileSync(
      fs.existsSync(distIndex) ? distIndex : rootIndex,
      "utf-8",
    );
  }
  return indexHtmlTemplate
    .replace("<!--APP_VERSION_INJECT-->", `<script>window.__APP_VERSION__=${JSON.stringify(APP_VERSION)};window.__APP_BUILD_ID__=${JSON.stringify(APP_BUILD_ID)}</script>`)
    .replace("{{APP_VERSION}}", `v${APP_VERSION}`);
}

app.use((req, res, next) => {
  if (req.path.endsWith(".html")) {
    res.set("Cache-Control", "no-cache");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});

if (fs.existsSync(path.join(__dirname, "dist"))) {
  app.use(express.static(path.join(__dirname, "dist"), { index: false }));
}

app.get("/game-logic.js", (_req, res) => {
  res
    .type("application/javascript")
    .set("Cache-Control", "no-cache")
    .sendFile("game-logic.js", { root: __dirname });
});

app.use(/\.(js|mjs|css|json|map|png|jpg|svg|woff2?)$/i, (_req, res) => {
  res.status(404).type("text/plain").send("Asset not found");
});

app.get(/.*/, (_req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Surrogate-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.type("html").send(getIndexHtml());
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  initDb();
  await ensureDbSchema();
  initRedis();

  const httpServer = createServer(app);
  initSocket(httpServer);

  setInterval(async () => {
    await refreshPlayerStatsView();
  }, 5 * 60 * 1000);

  httpServer.listen(PORT, () => {
    console.log(`\n  🎮 Game Hub v${APP_VERSION} — http://localhost:${PORT}`);
    console.log("     Platform: Telegram Mini App");
    console.log("     Database: PostgreSQL");
    console.log("     Cache: Redis");
    console.log("     Realtime: Socket.IO\n");
  });
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  start().catch((e) => {
    console.error("Fatal startup error:", e);
    process.exit(1);
  });
}
