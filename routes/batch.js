import { Router } from "express";
import { isRedisEnabled, isNonceSeenRedis } from "../redisAdapter.js";

/**
 * Game Hub — Batch Request Router (v10.4 — Zero-Loopback)
 *
 * v10.4: Eliminated HTTP loopback fetch. Sub-requests are now dispatched
 * through the Express app's internal router stack via a lightweight
 * mock req/res pair. This eliminates TCP socket exhaustion, double
 * JSON serialization, and unnecessary rate-limiter overhead.
 *
 * Architecture:
 *   Client → POST /api/batch { requests: [...] }
 *          → For each sub-request:
 *            1. Nonce idempotency check (Redis or in-memory)
 *            2. Build a minimal IncomingMessage-like object
 *            3. app.handle(mockReq, mockRes) — routes internally
 *            4. Capture JSON response via mockRes
 *          → Return aggregated { results: [...] }
 */

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

/**
 * Dispatches a sub-request through the Express app's internal router stack
 * without any network I/O. Uses a lightweight mock req/res to capture output.
 */
function dispatchInternal(app, method, path, body, headers) {
  return new Promise((resolve) => {
    // Build a minimal req-like object that Express can route
    const mockReq = {
      method: method.toUpperCase(),
      url: path,
      path: path.split("?")[0],
      headers: { ...headers, "content-type": "application/json" },
      body: body || {},
      query: {},
      params: {},
      // Express needs these to not throw
      get(name) {
        return this.headers[name.toLowerCase()];
      },
      header(name) {
        return this.headers[name.toLowerCase()];
      },
      // Indicate this is an internal batch dispatch (skip rate limiting)
      _isBatchInternal: true,
    };

    // Parse query string from path if any
    const qIdx = path.indexOf("?");
    if (qIdx !== -1) {
      const searchParams = new URLSearchParams(path.slice(qIdx + 1));
      for (const [k, v] of searchParams) mockReq.query[k] = v;
      mockReq.url = path;
      mockReq.path = path.slice(0, qIdx);
    }

    // Build a minimal res-like object that captures the JSON response
    let statusCode = 200;
    let responseData = null;
    let resolved = false;

    const mockRes = {
      statusCode: 200,
      _headers: {},
      
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      
      json(data) {
        if (resolved) return this;
        resolved = true;
        responseData = data;
        resolve({ status: statusCode, data: responseData });
        return this;
      },

      send(data) {
        if (resolved) return this;
        resolved = true;
        responseData = typeof data === "string" ? { _raw: data } : data;
        resolve({ status: statusCode, data: responseData });
        return this;
      },
      
      sendStatus(code) {
        if (resolved) return this;
        resolved = true;
        statusCode = code;
        resolve({ status: code, data: {} });
        return this;
      },

      set(name, value) {
        if (typeof name === "string") this._headers[name.toLowerCase()] = value;
        return this;
      },

      header(name, value) {
        return this.set(name, value);
      },

      get headersSent() {
        return resolved;
      },

      type() { return this; },
      end() {
        if (!resolved) {
          resolved = true;
          resolve({ status: statusCode, data: responseData || {} });
        }
        return this;
      },
    };

    // Safety timeout: if handler hangs, resolve with 504
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ status: 504, data: { error: "Internal dispatch timeout" } });
      }
    }, 10_000);

    // Dispatch through Express router stack
    app.handle(mockReq, mockRes, (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        if (err) {
          resolve({ status: 500, data: { error: err.message || "Internal error" } });
        } else {
          resolve({ status: 404, data: { error: "Route not found" } });
        }
      }
    });
  });
}

export default function batchRoutes(requireAuth, resolveUser, _PORT, app) {
  const router = Router();

  router.post("/api/batch", requireAuth, async (req, res) => {
    try {
      const { requests } = req.body;
      if (!Array.isArray(requests)) {
        return res.status(400).json({ error: "Invalid batch format" });
      }

      const user = resolveUser(req);
      const userId = req.body?.userId || req.discordUser?.id || req.simpleUser?.userId;

      // v8.3: Concurrency-limited processing to prevent DB pool exhaustion.
      const BATCH_CONCURRENCY = 3;

      async function processSubReq(subReq) {
        let { path: subPath, body, id, nonce } = subReq;

        // Idempotency check: prefer Redis (distributed), fallback to in-memory
        if (nonce) {
          let isDuplicate;
          if (isRedisEnabled()) {
            isDuplicate = await isNonceSeenRedis(userId, nonce);
          } else {
            isDuplicate = isNonceSeen(userId, nonce);
          }
          if (isDuplicate) {
            return { id, status: 409, data: { error: "Duplicate request" } };
          }
        }

        try {
          let subBody = body ? { ...body } : {};
          if (userId) {
            subBody.userId = userId;
            subBody.username = user.username;
          }

          // Forward auth headers so internal dispatch passes requireAuth
          const headers = {};
          if (req.headers.authorization) headers.authorization = req.headers.authorization;

          const result = await dispatchInternal(
            app,
            body ? "POST" : "GET",
            subPath,
            subBody,
            headers
          );

          return { id, status: result.status, data: result.data };
        } catch (err) {
          return { id, status: 500, error: err.message };
        }
      }

      // Process in chunks of BATCH_CONCURRENCY
      const results = [];
      for (let i = 0; i < requests.length; i += BATCH_CONCURRENCY) {
        const chunk = requests.slice(i, i + BATCH_CONCURRENCY);
        const chunkResults = await Promise.all(chunk.map(processSubReq));
        results.push(...chunkResults);
      }

      res.json({ results });
    } catch (err) {
      console.error("Batch error:", err);
      res.status(500).json({ error: "Batch processing failed" });
    }
  });

  return router;
}
