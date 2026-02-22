/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Unified Server (Production-Ready)
 *  Farm + Trivia (Solo & Duel) + Match-3 (with Leaderboard)
 *  Discord OAuth2 · GCS Persistence · Dual-Mode Auth
 * ═══════════════════════════════════════════════════════
 */
import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import compression from "compression";
import { initStorage, getBucket } from "./storage.js";
import { players, loadDb } from "./playerManager.js";

/* ─── Route Modules ─── */
import farmRoutes from "./routes/farm.js";
import resourcesRoutes from "./routes/resources.js";
import triviaRoutes from "./routes/trivia.js";
import match3Routes from "./routes/match3.js";
import bloxRoutes from "./routes/blox.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import mergeRoutes from "./routes/mergeRoutes.js";
import questRoutes from "./routes/questRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Global Version Constant (single source: package.json) ───
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"),
);
const APP_VERSION = pkg.version;

const app = express();
app.use(compression());
app.use(express.json());

const PORT = process.env.PORT || 8090;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "";
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const DISCORD_ENABLED = !!(CLIENT_ID && CLIENT_SECRET);

// Initialize GCS (no-op if GCS_BUCKET is empty)
initStorage(GCS_BUCKET);

/* ═══════════════════════════════════════════════════
 *  AUTH MIDDLEWARE
 * ═══════════════════════════════════════════════════ */

/* ─── Discord Auth (dual-mode) ─── */
const requireAuth = async (req, res, next) => {
  if (!DISCORD_ENABLED) return next(); // demo mode — skip auth
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  const token = authHeader.split(" ")[1];
  try {
    const userReq = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!userReq.ok) throw new Error("Invalid token");
    req.discordUser = await userReq.json();
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

/**
 * resolveUser — extracts userId/username from either Discord auth or request body.
 * In production (Discord enabled): uses req.discordUser from requireAuth.
 * In demo mode: uses req.body.userId / req.body.username.
 */
function resolveUser(req) {
  if (req.discordUser) {
    return {
      userId: req.discordUser.id,
      username: req.discordUser.username || "Player",
    };
  }
  return { userId: req.body.userId, username: req.body.username || "Player" };
}

/* ═══════════════════════════════════════════════════
 *  CONFIG & HEALTH ENDPOINTS
 * ═══════════════════════════════════════════════════ */

/* ─── Public Config (exposes non-secret settings to frontend) ─── */
app.get("/api/config", (_req, res) => {
  res.json({
    clientId: CLIENT_ID || "",
    discordEnabled: DISCORD_ENABLED,
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
app.use(farmRoutes(requireAuth, resolveUser));
app.use(resourcesRoutes(requireAuth, resolveUser));
app.use(triviaRouter);
app.use(match3Routes(requireAuth, resolveUser));
app.use(bloxRoutes(requireAuth, resolveUser));
app.use(leaderboardRoutes());
app.use(mergeRoutes(requireAuth, resolveUser));
app.use(questRoutes(requireAuth, resolveUser));

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
    sdkBundleCache = fs.readFileSync(
      path.join(__dirname, "public", "js", "discord-sdk-bundle.js"),
      "utf-8",
    );
  }
  const prefix = `window.__DISCORD_CLIENT_ID=${JSON.stringify(CLIENT_ID || "")};\n`;
  res
    .type("application/javascript")
    .set("Cache-Control", "no-cache")
    .send(prefix + sdkBundleCache);
});

// ─── Content-Hash Cache Busting ───
const assetHashes = {};
function computeAssetHashes() {
  const pubDir = path.join(__dirname, "public");
  const scanDirs = ["js", "css"];
  for (const dir of scanDirs) {
    const dirPath = path.join(pubDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    // Recursive scan to handle sub-modules (match3/, blox/)
    const entries = fs.readdirSync(dirPath, {
      withFileTypes: true,
      recursive: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name === "discord-sdk-bundle.js") continue; // served dynamically
      const filePath = path.join(entry.parentPath || entry.path, entry.name);
      const relPath = path.relative(pubDir, filePath).replace(/\\/g, "/");
      const content = fs.readFileSync(filePath);
      const hash = crypto
        .createHash("md5")
        .update(content)
        .digest("hex")
        .slice(0, 8);
      assetHashes[relPath] = hash;
    }
  }
  // Hash root-level game-logic.js (served via explicit route, not public/)
  const glPath = path.join(__dirname, "game-logic.js");
  if (fs.existsSync(glPath)) {
    const content = fs.readFileSync(glPath);
    const hash = crypto
      .createHash("md5")
      .update(content)
      .digest("hex")
      .slice(0, 8);
    assetHashes["game-logic.js"] = hash;
  }
  console.log(
    "  📦 Asset hashes computed:",
    Object.keys(assetHashes).length,
    "files",
  );
}

// Serve index.html with injected content hashes + version constant
let indexHtmlTemplate = null;
function getIndexHtml() {
  if (!indexHtmlTemplate) {
    indexHtmlTemplate = fs.readFileSync(
      path.join(__dirname, "public", "index.html"),
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

  // v5: Inject import map for ES Module cache busting
  const jsModules = [
    "store.js",
    "shared.js",
    "hud.js",
    "pet.js",
    "farm.js",
    "trivia.js",
    "match3.js",
    "blox.js",
    "merge.js",
    "main.js",
    // Sub-modules (Phase 4)
    "match3/engine.js",
    "blox/pieces.js",
    "crops.js",
  ];
  const importMapEntries = {};
  for (const mod of jsModules) {
    const key = `js/${mod}`;
    const hash = assetHashes[key];
    if (hash) {
      importMapEntries[`./${key}`] = `./${key}?v=${hash}`;
    }
  }
  // Root-level game-logic.js (served via explicit route)
  const glHash = assetHashes["game-logic.js"];
  if (glHash) {
    importMapEntries["/game-logic.js"] = `/game-logic.js?v=${glHash}`;
  }
  const importMapTag = `<script type="importmap">{"imports":${JSON.stringify(importMapEntries)}}</script>`;
  html = html.replace("<!--IMPORT_MAP_INJECT-->", importMapTag);

  // Replace all ?v=X.Y.Z with ?v=<content-hash> (CSS files)
  for (const [asset, hash] of Object.entries(assetHashes)) {
    // Match href="css/file.css?v=..." or src="js/file.js?v=..."
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp(`(${escaped})\\?v=[^"']+`, "g"),
      `$1?v=${hash}`,
    );
  }
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

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false, // Don't serve index.html statically — we inject hashes
  }),
);

// Serve root-level game-logic.js with correct MIME type (not in public/)
app.get("/game-logic.js", (_req, res) => {
  res
    .type("application/javascript")
    .set("Cache-Control", "no-cache")
    .sendFile(path.join(__dirname, "game-logic.js"));
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

/* ═══════════════════════════════════════════════════
 *  STARTUP
 * ═══════════════════════════════════════════════════ */
export { app, players };

async function start() {
  await loadDb();
  computeAssetHashes();
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
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isDirectRun) {
  start().catch((e) => {
    console.error("Fatal startup error:", e);
    process.exit(1);
  });
}
