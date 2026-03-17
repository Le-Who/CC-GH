import fetch from "node-fetch";
import { ensurePlayerLoaded } from "../playerManager.js";
import { validateSimpleAuthToken } from "../routes/auth.js";

/**
 * Game Hub — Tri-Mode Authentication Middleware
 * Centralizes Discord OAuth, Simple Auth, and Demo mode validation.
 */

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
export const DISCORD_ENABLED = process.env.NODE_ENV === "test" ? false : !!(CLIENT_ID && CLIENT_SECRET);

/**
 * requireAuth — validates authentication via one of three modes:
 *   1. Simple-auth token (prefix "sa_") → Firestore sessions lookup
 *   2. Discord OAuth token → Discord API validation
 *   3. No auth configured → demo mode (skip auth)
 */
export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(" ")[1] : null;

  // Mode 1: Simple-auth session token (sa_ prefix)
  if (token && token.startsWith("sa_")) {
    const user = await validateSimpleAuthToken(token);
    if (!user) return res.status(401).json({ error: "Session expired or invalid" });
    req.simpleUser = user;
    await ensurePlayerLoaded(user.userId);
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
      await ensurePlayerLoaded(req.discordUser.id);
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
export function resolveUser(req) {
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
