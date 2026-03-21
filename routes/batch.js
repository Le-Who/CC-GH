import { Router } from "express";
import fetch from "node-fetch";
import http from "http";
import { isRedisEnabled, isNonceSeenRedis } from "../redisAdapter.js";

// Global keep-alive agent to significantly optimize localhost loopback fetch speeds
const batchHttpAgent = new http.Agent({ keepAlive: true });

/**
 * Game Hub — Batch Request Router
 * Processes batched API requests with idempotency (nonce) protection.
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

export default function batchRoutes(requireAuth, resolveUser, PORT) {
  const router = Router();

  router.post("/api/batch", requireAuth, async (req, res) => {
    try {
      const { requests } = req.body;
      if (!Array.isArray(requests)) {
        return res.status(400).json({ error: "Invalid batch format" });
      }

      const user = resolveUser(req);
      const userId = req.body?.userId || req.discordUser?.id || req.simpleUser?.userId;
      const results = [];

      // Process sequentially to maintain data integrity
      for (const subReq of requests) {
        let { path: subPath, body, id, nonce } = subReq;

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
          // Direct loopback fetch to bypass Node 24 native stream parsing crashes 
          // caused by synthetic Express request objects in app.handle()
          const headers = { "Content-Type": "application/json" };
          if (req.headers.authorization) headers.authorization = req.headers.authorization;
          let fetchUrl = `http://127.0.0.1:${PORT}${subPath}`;
          if (req.method === "GET" || subPath.includes("?")) {
             const sep = fetchUrl.includes("?") ? "&" : "?";
             fetchUrl += `${sep}userId=${userId}`;
          }
          
          let subBody = body ? { ...body } : {};
          if (userId) {
            subBody.userId = userId;
            subBody.username = user.username;
          }
          
          const fetchCtx = { 
            method: body ? "POST" : "GET", 
            headers,
            agent: batchHttpAgent
          };
          
          if (fetchCtx.method === "POST" || fetchCtx.method === "PUT") {
            fetchCtx.body = JSON.stringify(subBody);
          }

          const response = await fetch(fetchUrl, fetchCtx);
          let data;
          try {
            data = await response.json();
          } catch {
            data = { error: "Invalid JSON response" };
          }
          
          results.push({ id, status: response.status, data });
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

  return router;
}
