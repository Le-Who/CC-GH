/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Rate Limiter Middleware
 *  v11.0: Redis INCR + TTL when available, in-memory fallback
 *
 *  Uses Redis fixed-window counter for distributed rate limiting.
 *  Falls back to in-memory sliding window when Redis is disabled.
 * ═══════════════════════════════════════════════════════
 */

import { isRedisEnabled, getRedisClient } from "../redisAdapter.js";

const RATE_KEY_PREFIX = "rate:";

/* ─── In-memory fallback (original implementation) ─── */
const windows = new Map(); // accountId -> [timestamps]

let _cleanupStarted = false;
function ensureCleanup() {
  if (_cleanupStarted) return;
  _cleanupStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - 120_000;
    for (const [key, timestamps] of windows.entries()) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) windows.delete(key);
      else windows.set(key, valid);
    }
  }, 300_000).unref();
}

/**
 * Creates a rate limiter middleware.
 * Redis path: INCR key with TTL = windowMs (fixed-window counter, shared across instances).
 * Local path: in-memory sliding window (original behavior, single-instance only).
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window duration in milliseconds
 */
export function createRateLimiter(maxRequests = 60, windowMs = 60_000) {
  ensureCleanup();
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === "test") return next();

    // Skip rate limiting for internal batch dispatch (already rate-limited at /api/batch level)
    if (req._isBatchInternal) return next();

    const accountId = req.authenticatedUser?.accountId || req.ip || "anonymous";
    const bucketKey = `${accountId}:${maxRequests}`;

    if (isRedisEnabled()) {
      // ─── Redis fixed-window counter ───
      try {
        const redis = getRedisClient();
        const redisKey = `${RATE_KEY_PREFIX}${bucketKey}:${Math.floor(Date.now() / windowMs)}`;
        const count = await redis.incr(redisKey);
        if (count === 1) {
          // First request in this window: set TTL.
          await redis.expire(redisKey, windowSec + 1); // +1s safety margin
        }

        if (count > maxRequests) {
          const retryAfter = windowSec;
          res.set("Retry-After", String(retryAfter));
          return res.status(429).json({
            error: "Too many requests",
            retryAfter,
          });
        }
        return next();
      } catch (e) {
        // Redis error — fall through to in-memory
        console.warn("Rate limiter Redis error, using in-memory fallback:", e.message);
      }
    }

    // ─── In-memory sliding window (fallback) ───
    const now = Date.now();
    if (!windows.has(bucketKey)) windows.set(bucketKey, []);
    const timestamps = windows.get(bucketKey);

    // Remove expired timestamps
    const cutoff = now - windowMs;
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Too many requests",
        retryAfter,
      });
    }

    timestamps.push(now);
    next();
  };
}

/** Pre-configured limiters */
export const defaultLimiter = createRateLimiter(60, 60_000);
export const farmLimiter = createRateLimiter(30, 60_000);
export const authLimiter = createRateLimiter(20, 60_000);
