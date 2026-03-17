/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Unified Server (Production-Ready)
 *  Farm + Trivia (Solo & Duel) + Match-3 (with Leaderboard)
 *  Discord OAuth2 · Simple Auth · GCS Persistence · Tri-Mode Auth
 * ═══════════════════════════════════════════════════════
 */
import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import authRoutes from "./routes/auth.js";
import batchRoutes from "./routes/batch.js";
import { requireAuth, resolveUser, DISCORD_ENABLED } from "./middleware/auth.js";
import { getDb } from "./db.js";

/* ─── Route Modules ─── */
import farmRoutes from "./routes/farm.js";
import resourcesRoutes from "./routes/resources.js";
import triviaRoutes from "./routes/trivia.js";
import match3Routes from "./routes/match3.js";
import bloxRoutes from "./routes/blox.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import mergeRoutes from "./routes/mergeRoutes.js";
import questRoutes from "./routes/questRoutes.js";
import achievementRoutes from "./routes/achievements.js";
import eventRoutes from "./routes/events.js";
import seasonPassRoutes from "./routes/seasonpass.js";
import { defaultLimiter, authLimiter } from "./middleware/rateLimit.js";

// ─── Custom Domain (for non-Discord access via short URL) ───
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || ""; // e.g. "gamehub.example.com"

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Global Version Constant (single source: package.json) ───
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"),
);
const APP_VERSION = pkg.version;

const app = express();
app.use(compression());
app.use(express.json());

// CORS — scoped to Discord Activity + custom domain origins in production, permissive in dev
let _allowedOrigins = null;
app.use((req, res, next) => {
  if (!_allowedOrigins) {
    _allowedOrigins = new Set([
      "https://discord.com",
      "https://ptb.discord.com",
      "https://canary.discord.com",
      `https://${process.env.DISCORD_CLIENT_ID || ""}.discordsays.com`,
    ]);
    // Custom domain support (non-Discord access)
    if (CUSTOM_DOMAIN) {
      _allowedOrigins.add(`https://${CUSTOM_DOMAIN}`);
      _allowedOrigins.add(`http://${CUSTOM_DOMAIN}`); // for local dev
    }
  }
  const origin = req.headers.origin;
  if (
    process.env.NODE_ENV !== "production" ||
    !origin ||
    _allowedOrigins.has(origin) ||
    origin.endsWith(".discordsays.com")
  ) {
    res.set("Access-Control-Allow-Origin", origin || "*");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Security headers (Helmet-like, no extra dependency)
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  // CSP frame-ancestors: Discord iframe + custom domain + self (for non-iframe access)
  let cspAncestors = "'self' https://discord.com https://*.discord.com https://*.discordsays.com";
  if (CUSTOM_DOMAIN) {
    cspAncestors += ` https://${CUSTOM_DOMAIN}`;
  }
  res.set("Content-Security-Policy", `frame-ancestors ${cspAncestors}`);
  res.set("X-XSS-Protection", "0"); // Modern browsers: rely on CSP instead
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const PORT = process.env.PORT || 8090;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "";

/* ═══════════════════════════════════════════════════
 *  AUTH MIDDLEWARE (Tri-Mode: Discord · Simple-Auth · Demo)
 * ═══════════════════════════════════════════════════ */
// Extracted to middleware/auth.js

/* ═══════════════════════════════════════════════════
 *  RATE LIMITING & CIRCUIT BREAKER — MUST be before route handlers
 * ═══════════════════════════════════════════════════ */
app.use("/api/token", authLimiter);
app.use("/api/auth", authLimiter);
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth") || req.path.startsWith("/token")) return next();
  return defaultLimiter(req, res, next);
});

/* ═══════════════════════════════════════════════════
 *  CONFIG & HEALTH ENDPOINTS
 * ═══════════════════════════════════════════════════ */

/* ─── Public Config (exposes non-secret settings to frontend) ─── */
app.get("/api/config", (_req, res) => {
  res.json({
    clientId: CLIENT_ID || "",
    discordEnabled: DISCORD_ENABLED,
    simpleAuthEnabled: true, // Always available when Discord is not the only option
    customDomain: CUSTOM_DOMAIN || null,
  });
});

app.get("/api/config/discord", (_req, res) => {
  res.json({ clientId: CLIENT_ID });
});

/* ─── Discord Token Exchange ─── */
app.post("/api/token", async (req, res) => {
  if (!DISCORD_ENABLED)
    return res.status(501).json({ error: "Discord not configured" });
  try {
    const { code } = req.body;
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Token exchange failed:", data);
      return res.status(500).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/* ─── Mount triviaRoutes first to capture duelRooms for health ─── */
const triviaRouter = triviaRoutes(requireAuth, resolveUser);
const duelRooms = triviaRouter._duelRooms;

app.get("/api/health", async (_req, res) => {
  let dbOk = false;
  try {
    const sql = getDb();
    if (sql) {
      await sql`SELECT 1`;
      dbOk = true;
    }
  } catch (e) {
    console.error("Health check DB error:", e);
  }

  res.json({
    status: dbOk ? "ok" : "degraded (database offline)",
    duels: duelRooms.size,
    uptime: Math.floor(process.uptime()),
    discord: DISCORD_ENABLED,
    postgres: dbOk,
  });
});

app.get("/api/health/ping", async (_req, res) => {
  try {
    const sql = getDb();
    if (sql) {
      await sql`SELECT 1`;
      res.status(200).send("PONG_PG");
    } else {
      res.status(200).send("PONG_NO_DB");
    }
  } catch (e) {
    res.status(500).send("PING_FAIL");
  }
});

// v9.0: Service Worker cache escape hatch — wipes caches, IndexedDB, localStorage
app.get("/api/clear-cache", (_req, res) => {
  res.set("Clear-Site-Data", '"cache", "storage"');
  res.json({ cleared: true });
});

/* ═══════════════════════════════════════════════════
 *  MOUNT ROUTE MODULES
 * ═══════════════════════════════════════════════════ */
// Rate limiters mounted above (before config endpoints)

// Auth routes (register, login, logout, me) — no requireAuth needed
app.use(authRoutes());

app.use(farmRoutes(requireAuth, resolveUser));
app.use(resourcesRoutes(requireAuth, resolveUser));
app.use(triviaRouter);
app.use(match3Routes(requireAuth, resolveUser));
app.use(bloxRoutes(requireAuth, resolveUser));
app.use(leaderboardRoutes());
app.use(mergeRoutes(requireAuth, resolveUser));
app.use(questRoutes(requireAuth, resolveUser));
app.use(achievementRoutes(requireAuth, resolveUser));
app.use(eventRoutes(requireAuth));
app.use(seasonPassRoutes(requireAuth, resolveUser));

/* ═══════════════════════════════════════════════════
 *  STATIC FILES & INDEX INJECTION
 * ═══════════════════════════════════════════════════ */

/*
 * Serve /js/discord-sdk.js dynamically: prepend client_id config
 * before the SDK bundle so it's available when the IIFE runs.
 */
let sdkBundleCache = null;
app.get("/js/discord-sdk.js", (_req, res) => {
  if (!sdkBundleCache) {
    // Try public/js first (Docker build output), fallback to src/vanilla
    const publicPath = path.join(
      __dirname,
      "public",
      "js",
      "discord-sdk-bundle.js",
    );
    const srcPath = path.join(
      __dirname,
      "src",
      "vanilla",
      "discord-sdk-bundle.js",
    );
    sdkBundleCache = fs.readFileSync(
      fs.existsSync(publicPath) ? publicPath : srcPath,
      "utf-8",
    );
  }
  const prefix = `window.__DISCORD_CLIENT_ID=${JSON.stringify(CLIENT_ID || "")};\n`;
  res
    .type("application/javascript")
    .set("Cache-Control", "no-cache")
    .send(prefix + sdkBundleCache);
});

// Serve index.html with injected content hashes + version constant
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
  let html = indexHtmlTemplate;

  // v4.6: Inject global version constant so client JS can read it
  html = html.replace(
    "<!--APP_VERSION_INJECT-->",
    `<script>window.__APP_VERSION__="${APP_VERSION}"</script>`,
  );

  // v4.6: Replace version badge placeholder
  html = html.replace("{{APP_VERSION}}", `v${APP_VERSION}`);

  return html;
}

// Cache policy: HTML always validates, JS/CSS use import-map hash for invalidation
app.use((req, res, next) => {
  if (req.path.endsWith(".html")) {
    res.set("Cache-Control", "no-cache");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});

// Serve dist/ if it exists (Vite build output)
if (fs.existsSync(path.join(__dirname, "dist"))) {
  app.use(express.static(path.join(__dirname, "dist"), { index: false }));
}

// Serve root-level game-logic.js with correct MIME type (not in public/)
app.get("/game-logic.js", (_req, res) => {
  res
    .type("application/javascript")
    .set("Cache-Control", "no-cache")
    .sendFile("game-logic.js", { root: __dirname });
});

// Strict 404 for static assets — prevents SPA catch-all from masking missing files
app.use(/\.(js|mjs|css|json|map|png|jpg|svg|woff2?)$/i, (_req, res) => {
  res.status(404).type("text/plain").send("Asset not found");
});

app.get(/.*/, (_req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Surrogate-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.type("html").send(getIndexHtml());
});

// [Phase 2] Optimistic UI & Batch Sync Endpoint
app.use(batchRoutes(requireAuth, resolveUser, PORT));

// Global error handler (Express 5 catches async rejections automatically)
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ═══════════════════════════════════════════════════
 *  STARTUP
 * ═══════════════════════════════════════════════════ */
export { app };
import { initDb } from "./db.js";

async function start() {
  initDb();

  // Feature 5 loop: Refresh materialized view every 5 minutes (concurrently so frontend is not blocked)
  setInterval(async () => {
    const sql = getDb();
    if (sql) {
      try {
        await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_stats_view`;
      } catch (err) {
        console.error("Failed to refresh materialized view:", err.message);
      }
    }
  }, 5 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`\n  🎮 Game Hub v${APP_VERSION} — http://localhost:${PORT}`);
    console.log(`     Farm 🌱 | Trivia 🧠 | Match-3 💎`);
    console.log(
      `     Discord: ${DISCORD_ENABLED ? "✅ enabled" : "⚠️  demo mode (no creds)"}`,
    );
    console.log(`     Database: PostgreSQL + Upstash Redis`);
    console.log(`     Duel system active | Leaderboard enabled\n`);
  });
}

// Only auto-start when run directly (not when imported in tests)
// Compare resolved file paths — works on both Windows and Linux/Docker
const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  start().catch((e) => {
    console.error("Fatal startup error:", e);
    process.exit(1);
  });
}
