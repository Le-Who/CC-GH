/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Simple Auth Routes
 *  Username/password authentication without Discord
 *  Tokens use "sa_" prefix to distinguish from Discord OAuth
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getUsersCol, getSessionsCol } from "../playerManager.js";

// In-memory fallback for testing (when Firestore is unavailable)
const _memUsers = new Map();     // username → { userId, username, passwordHash }
const _memSessions = new Map();  // token → { userId, username, createdAt }

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PASSWORD_MIN_LEN = 4;
const BCRYPT_ROUNDS = 10;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Generate a crypto-random session token with sa_ prefix */
function generateToken() {
  return "sa_" + crypto.randomBytes(32).toString("hex");
}

/** Generate a stable userId from username (deterministic, collision-safe) */
function usernameToId(username) {
  return "sa_" + username.toLowerCase();
}

export default function authRoutes() {
  const router = Router();

  /* ─── POST /api/auth/register ─── */
  router.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body || {};

    // Validation
    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–20 characters (letters, numbers, underscore)",
      });
    }
    if (!password || password.length < PASSWORD_MIN_LEN) {
      return res.status(400).json({
        error: `Password must be at least ${PASSWORD_MIN_LEN} characters`,
      });
    }

    const usernameLower = username.toLowerCase();
    const usersCol = getUsersCol();
    const sessionsCol = getSessionsCol();

    try {
      // Check if user already exists
      if (usersCol) {
        const existing = await usersCol.doc(usernameLower).get();
        if (existing.exists) {
          return res.status(409).json({ error: "Username already taken" });
        }
      } else {
        if (_memUsers.has(usernameLower)) {
          return res.status(409).json({ error: "Username already taken" });
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const userId = usernameToId(username);

      const userData = {
        userId,
        username,
        passwordHash,
        createdAt: Date.now(),
      };

      // Store user
      if (usersCol) {
        await usersCol.doc(usernameLower).set(userData);
      } else {
        _memUsers.set(usernameLower, userData);
      }

      // Create session
      const token = generateToken();
      const sessionData = {
        userId,
        username,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      };

      if (sessionsCol) {
        await sessionsCol.doc(token).set(sessionData);
      } else {
        _memSessions.set(token, sessionData);
      }

      res.json({ token, userId, username });
    } catch (e) {
      console.error("Auth register error:", e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  /* ─── POST /api/auth/login ─── */
  router.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const usernameLower = username.toLowerCase();
    const usersCol = getUsersCol();
    const sessionsCol = getSessionsCol();

    try {
      let userData;
      if (usersCol) {
        const doc = await usersCol.doc(usernameLower).get();
        if (!doc.exists) {
          return res.status(401).json({ error: "Invalid username or password" });
        }
        userData = doc.data();
      } else {
        userData = _memUsers.get(usernameLower);
        if (!userData) {
          return res.status(401).json({ error: "Invalid username or password" });
        }
      }

      // Verify password
      const valid = await bcrypt.compare(password, userData.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Create session
      const token = generateToken();
      const sessionData = {
        userId: userData.userId,
        username: userData.username,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      };

      if (sessionsCol) {
        await sessionsCol.doc(token).set(sessionData);
      } else {
        _memSessions.set(token, sessionData);
      }

      res.json({
        token,
        userId: userData.userId,
        username: userData.username,
      });
    } catch (e) {
      console.error("Auth login error:", e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  /* ─── GET /api/auth/me ─── */
  router.get("/api/auth/me", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token || !token.startsWith("sa_")) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    const sessionsCol = getSessionsCol();

    try {
      let session;
      if (sessionsCol) {
        const doc = await sessionsCol.doc(token).get();
        if (!doc.exists) {
          return res.status(401).json({ error: "Session expired or invalid" });
        }
        session = doc.data();
      } else {
        session = _memSessions.get(token);
        if (!session) {
          return res.status(401).json({ error: "Session expired or invalid" });
        }
      }

      // Check expiry
      if (session.expiresAt && session.expiresAt < Date.now()) {
        // Clean up expired session
        if (sessionsCol) {
          await sessionsCol.doc(token).delete();
        } else {
          _memSessions.delete(token);
        }
        return res.status(401).json({ error: "Session expired" });
      }

      res.json({
        userId: session.userId,
        username: session.username,
      });
    } catch (e) {
      console.error("Auth me error:", e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  /* ─── POST /api/auth/logout ─── */
  router.post("/api/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.json({ success: true }); // Already logged out
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.json({ success: true });
    }

    const sessionsCol = getSessionsCol();

    try {
      if (sessionsCol) {
        await sessionsCol.doc(token).delete();
      } else {
        _memSessions.delete(token);
      }
      res.json({ success: true });
    } catch (e) {
      console.error("Auth logout error:", e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Expose in-memory stores for testing
  router._memUsers = _memUsers;
  router._memSessions = _memSessions;

  return router;
}

/**
 * Validate a simple-auth session token.
 * Returns { userId, username } or null if invalid/expired.
 */
export async function validateSimpleAuthToken(token) {
  if (!token || !token.startsWith("sa_")) return null;

  const sessionsCol = getSessionsCol();

  try {
    let session;
    if (sessionsCol) {
      const doc = await sessionsCol.doc(token).get();
      if (!doc.exists) return null;
      session = doc.data();
    } else {
      session = _memSessions.get(token);
      if (!session) return null;
    }

    // Check expiry
    if (session.expiresAt && session.expiresAt < Date.now()) {
      if (sessionsCol) {
        sessionsCol.doc(token).delete().catch(() => {});
      } else {
        _memSessions.delete(token);
      }
      return null;
    }

    return { userId: session.userId, username: session.username };
  } catch {
    return null;
  }
}
