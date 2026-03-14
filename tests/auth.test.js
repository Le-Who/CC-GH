/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Simple Auth Tests
 *  Tests for register, login, logout, session validation
 *  Run:  node --test tests/auth.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test"; // Bypass rate limiting
import { app } from "../server.js";

const PORT = 9877;
let server;
const BASE = `http://localhost:${PORT}`;

/** POST helper */
async function post(path, body = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

/** GET helper */
async function get(path, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  const data = await res.json();
  return { status: res.status, data };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

after(() => {
  server?.close();
  setTimeout(() => process.exit(0), 100);
});

/* ─────────────────────────────────────────────────────
 *  Register
 * ───────────────────────────────────────────────────── */
describe("POST /api/auth/register", () => {
  it("creates a new user and returns token", async () => {
    const { status, data } = await post("/api/auth/register", {
      username: "testuser1",
      password: "pass1234",
    });
    assert.equal(status, 200);
    assert.ok(data.token, "Should return a token");
    assert.ok(data.token.startsWith("sa_"), "Token should have sa_ prefix");
    assert.ok(data.userId, "Should return userId");
    assert.equal(data.username, "testuser1");
  });

  it("rejects duplicate username", async () => {
    await post("/api/auth/register", {
      username: "dupuser",
      password: "pass1234",
    });
    const { status, data } = await post("/api/auth/register", {
      username: "dupuser",
      password: "different_pass",
    });
    assert.equal(status, 409);
    assert.ok(data.error.includes("taken"));
  });

  it("rejects username shorter than 3 chars", async () => {
    const { status } = await post("/api/auth/register", {
      username: "ab",
      password: "pass1234",
    });
    assert.equal(status, 400);
  });

  it("rejects username with invalid characters", async () => {
    const { status } = await post("/api/auth/register", {
      username: "bad user!",
      password: "pass1234",
    });
    assert.equal(status, 400);
  });

  it("rejects empty password", async () => {
    const { status } = await post("/api/auth/register", {
      username: "nopass",
      password: "",
    });
    assert.equal(status, 400);
  });

  it("rejects password shorter than 4 chars", async () => {
    const { status } = await post("/api/auth/register", {
      username: "shortpw",
      password: "abc",
    });
    assert.equal(status, 400);
  });
});

/* ─────────────────────────────────────────────────────
 *  Login
 * ───────────────────────────────────────────────────── */
describe("POST /api/auth/login", () => {
  it("succeeds with correct credentials", async () => {
    // Register first
    await post("/api/auth/register", {
      username: "loginuser",
      password: "loginpass",
    });

    const { status, data } = await post("/api/auth/login", {
      username: "loginuser",
      password: "loginpass",
    });
    assert.equal(status, 200);
    assert.ok(data.token, "Should return a token");
    assert.ok(data.token.startsWith("sa_"));
    assert.equal(data.username, "loginuser");
  });

  it("fails with wrong password", async () => {
    await post("/api/auth/register", {
      username: "wrongpw",
      password: "correctpass",
    });

    const { status, data } = await post("/api/auth/login", {
      username: "wrongpw",
      password: "wrongpass",
    });
    assert.equal(status, 401);
    assert.ok(data.error);
  });

  it("fails with nonexistent user", async () => {
    const { status } = await post("/api/auth/login", {
      username: "nonexistent_user_xyz",
      password: "anypass",
    });
    assert.equal(status, 401);
  });

  it("is case-insensitive for username", async () => {
    await post("/api/auth/register", {
      username: "CaseTest",
      password: "pass1234",
    });

    const { status, data } = await post("/api/auth/login", {
      username: "casetest",
      password: "pass1234",
    });
    assert.equal(status, 200);
    assert.ok(data.token);
  });
});

/* ─────────────────────────────────────────────────────
 *  Session Validation (GET /api/auth/me)
 * ───────────────────────────────────────────────────── */
describe("GET /api/auth/me", () => {
  it("returns user info with valid token", async () => {
    const reg = await post("/api/auth/register", {
      username: "meuser",
      password: "pass1234",
    });
    const { status, data } = await get("/api/auth/me", reg.data.token);
    assert.equal(status, 200);
    assert.equal(data.username, "meuser");
    assert.ok(data.userId);
  });

  it("returns 401 with invalid token", async () => {
    const { status } = await get("/api/auth/me", "sa_invalid_token_xyz");
    assert.equal(status, 401);
  });

  it("returns 401 without token", async () => {
    const { status } = await get("/api/auth/me");
    assert.equal(status, 401);
  });

  it("returns 401 with non-sa_ token", async () => {
    const { status } = await get("/api/auth/me", "discord_fake_token");
    assert.equal(status, 401);
  });
});

/* ─────────────────────────────────────────────────────
 *  Logout
 * ───────────────────────────────────────────────────── */
describe("POST /api/auth/logout", () => {
  it("invalidates session", async () => {
    const reg = await post("/api/auth/register", {
      username: "logoutuser",
      password: "pass1234",
    });
    const token = reg.data.token;

    // Verify session works before logout
    const before = await get("/api/auth/me", token);
    assert.equal(before.status, 200);

    // Logout
    const { status, data } = await post("/api/auth/logout", {}, token);
    assert.equal(status, 200);
    assert.equal(data.success, true);

    // Verify session is invalid after logout
    const after = await get("/api/auth/me", token);
    assert.equal(after.status, 401);
  });
});

/* ─────────────────────────────────────────────────────
 *  Protected Routes with Simple Auth Token
 * ───────────────────────────────────────────────────── */
describe("Protected routes with simple-auth token", () => {
  it("farm state works with simple-auth token", async () => {
    // Register and get token
    const reg = await post("/api/auth/register", {
      username: "farmplayer",
      password: "pass1234",
    });
    const token = reg.data.token;

    // Use token to access farm state
    const { status, data } = await post(
      "/api/farm/state",
      { userId: reg.data.userId },
      token,
    );
    assert.equal(status, 200);
    assert.ok(data.plots, "Should return farm plots");
  });

  it("trivia start works with simple-auth token", async () => {
    const reg = await post("/api/auth/register", {
      username: "triviaplayer",
      password: "pass1234",
    });
    const token = reg.data.token;

    const { status, data } = await post(
      "/api/trivia/start",
      { userId: reg.data.userId, count: 3 },
      token,
    );
    assert.equal(status, 200);
    assert.ok(data.question, "Should return a trivia question");
  });
});

/* ─────────────────────────────────────────────────────
 *  Config Endpoint
 * ───────────────────────────────────────────────────── */
describe("GET /api/config", () => {
  it("exposes simpleAuthEnabled flag", async () => {
    const { status, data } = await get("/api/config");
    assert.equal(status, 200);
    assert.equal(data.simpleAuthEnabled, true);
    assert.ok("discordEnabled" in data);
  });
});
