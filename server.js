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
import { initStorage, getBucket } from "./storage.js";
import { players, loadDb, initFirestore } from "./playerManager.js";
import { isRedisEnabled, isNonceSeenRedis } from "./redisAdapter.js";
import authRoutes, { validateSimpleAuthToken } from "./routes/auth.js";

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
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const DISCORD_ENABLED = !!(CLIENT_ID && CLIENT_SECRET);

// Initialize GCS (no-op if GCS_BUCKET is empty)
initStorage(GCS_BUCKET);

/* ═══════════════════════════════════════════════════
 *  AUTH MIDDLEWARE (Tri-Mode: Discord · Simple-Auth · Demo)
 * ═══════════════════════════════════════════════════ */

/**
 * requireAuth — validates authentication via one of three modes:
 *   1. Simple-auth token (prefix "sa_") → Firestore sessions lookup
 *   2. Discord OAuth token → Discord API validation
 *   3. No auth configured → demo mode (skip auth)
 */
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(" ")[1] : null;

  // Mode 1: Simple-auth session token (sa_ prefix)
  if (token && token.startsWith("sa_")) {
    const user = await validateSimpleAuthToken(token);
    if (!user) return res.status(401).json({ error: "Session expired or invalid" });
    req.simpleUser = user;
    return next();
  }

  // Mode 2: Discord OAuth token
  if (DISCORD_ENABLED && token) {
    try {
      const userReq = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userReq.ok) throw new Error("Invalid token");
      req.discordUser = await userReq.json();
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // Mode 3: Demo mode — no auth required
  if (!DISCORD_ENABLED) return next();

  // No valid token provided
  return res.status(401).json({ error: "No token provided" });
};

/**
 * resolveUser — extracts userId/username from:
 *   1. req.discordUser (Discord OAuth)
 *   2. req.simpleUser (Simple-auth session)
 *   3. req.body / req.query (demo mode fallback)
 */
function resolveUser(req) {
  // Discord user (set by requireAuth mode 2)
  if (req.discordUser) {
    return {
      userId: req.discordUser.id,
      username: req.discordUser.username || "Player",
    };
  }
  // Simple-auth user (set by requireAuth mode 1)
  if (req.simpleUser) {
    return {
      userId: req.simpleUser.userId,
      username: req.simpleUser.username || "Player",
    };
  }
  // Demo mode fallback
  if (req.method === "GET") {
    const uid = req.query?.userId || "demo-user";
    const uname = req.query?.username || "Player";
    return { userId: uid, username: uname };
  }
  return { userId: req.body?.userId, username: req.body?.username || "Player" };
}

/* ═══════════════════════════════════════════════════
 *  RATE LIMITING & CIRCUIT BREAKER — MUST be before route handlers
 * ═══════════════════════════════════════════════════ */
app.use("/api/token", authLimiter);
app.use("/api/auth", authLimiter);
// Default limiter for all /api except auth paths
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth") || req.path.startsWith("/token")) return next();
  
  // v7.3.6: Circuit Breaker - Halt mutations if Firestore save failed recently
  if (req.method === "POST") {
    const user = req.discordUser || req.simpleUser || { userId: req.body?.userId };
    if (user && user.userId) {
      const p = players.get(user.userId);
      if (p && p._saveError) {
        return res.status(503).json({ 
          error: "Database is experiencing issues. Please wait a moment before taking actions." 
        });
      }
    }
  }

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

app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    players: players.size,
    duels: duelRooms.size,
    uptime: Math.floor(process.uptime()),
    gcs: !!getBucket(),
    discord: DISCORD_ENABLED,
  }),
);

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

// [Phase 2] Optimistic UI & Batch Sync Endpoint — v8.0 Direct Dispatch
// Nonce deduplication: tracks last N nonces per user to reject replayed mutations
const NONCE_CACHE_SIZE = 100;
const nonceCache = new Map(); // userId → Set<nonce>

function isNonceSeen(userId, nonce) {
  if (!nonce) return false; // Legacy clients without nonces always pass
  let set = nonceCache.get(userId);
  if (!set) {
    set = new Set();
    nonceCache.set(userId, set);
  }
  if (set.has(nonce)) return true;
  set.add(nonce);
  // LRU eviction: keep only last N nonces
  if (set.size > NONCE_CACHE_SIZE) {
    const first = set.values().next().value;
    set.delete(first);
  }
  return false;
}

app.post("/api/batch", requireAuth, async (req, res) => {
  try {
    const { requests } = req.body;
    if (!Array.isArray(requests)) {
      return res.status(400).json({ error: "Invalid batch format" });
    }

    resolveUser(req);
    const userId = req.body?.userId || req.discordUser?.id || req.simpleUser?.userId;
    const results = [];

    // Process sequentially to maintain data integrity
    for (const subReq of requests) {
      const { path: subPath, body, id, nonce } = subReq;

      // Idempotency check: prefer Redis (distributed), fallback to in-memory
      if (nonce) {
        let isDuplicate = false;
        if (isRedisEnabled()) {
          isDuplicate = await isNonceSeenRedis(userId, nonce);
        } else {
          isDuplicate = isNonceSeen(userId, nonce);
        }
        if (isDuplicate) {
          results.push({ id, status: 409, data: { error: "Duplicate request" } });
          continue;
        }
      }

      try {
        // Direct dispatch via mock req/res instead of self-fetch
        const data = await new Promise((resolve, reject) => {
          const mockReq = Object.create(req); // Inherit auth headers
          mockReq.method = body ? "POST" : "GET";
          mockReq.url = subPath;
          mockReq.path = subPath;
          mockReq.body = body || {};
          mockReq.headers = { ...req.headers };

          const chunks = [];
          const mockRes = {
            statusCode: 200,
            _headers: {},
            set(k, v) { this._headers[k] = v; return this; },
            status(code) { this.statusCode = code; return this; },
            json(data) {
              resolve({ status: this.statusCode, data });
            },
            send(d) {
              resolve({ status: this.statusCode, data: typeof d === "string" ? JSON.parse(d) : d });
            },
            end() { resolve({ status: this.statusCode, data: {} }); },
            type() { return this; },
            get(h) { return this._headers[h]; },
            getHeader(h) { return this._headers[h]; },
            setHeader(k, v) { this._headers[k] = v; },
            removeHeader() {},
            headersSent: false,
          };

          // Use Express router to dispatch
          app.handle(mockReq, mockRes, (err) => {
            if (err) reject(err);
            else resolve({ status: 404, data: { error: "Route not found" } });
          });
        });
        results.push({ id, status: data.status, data: data.data });
      } catch (err) {
        results.push({ id, status: 500, error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("Batch error:", err);
    res.status(500).json({ error: "Batch processing failed" });
  }
});

// Global error handler (Express 5 catches async rejections automatically)
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ═══════════════════════════════════════════════════
 *  STARTUP
 * ═══════════════════════════════════════════════════ */
export { app, players };

async function start() {
  initFirestore();
  await loadDb();
  app.listen(PORT, () => {
    console.log(`\n  🎮 Game Hub v${APP_VERSION} — http://localhost:${PORT}`);
    console.log(`     Farm 🌱 | Trivia 🧠 | Match-3 💎`);
    console.log(
      `     Discord: ${DISCORD_ENABLED ? "✅ enabled" : "⚠️  demo mode (no creds)"}`,
    );
    console.log(
      `     Storage: ${getBucket() ? "☁️  GCS" : "💾 local (ephemeral)"}`,
    );
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
