/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Rate Limiter Middleware
 *  In-memory sliding window per user ID
 * ═══════════════════════════════════════════════════════
 */

const windows = new Map(); // userId → [timestamps]

// Single module-level cleanup (unref for clean test exit)
let _cleanupStarted = false;
function ensureCleanup(_windowMs) {
  if (_cleanupStarted) return;
  _cleanupStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - 120_000; // 2× longest window
    for (const [key, timestamps] of windows.entries()) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) windows.delete(key);
      else windows.set(key, valid);
    }
  }, 300_000).unref();
}

/**
 * Creates a rate limiter middleware.
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window duration in milliseconds
 */
export function createRateLimiter(maxRequests = 60, windowMs = 60_000) {
  ensureCleanup(windowMs);

  return (req, res, next) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === "test") return next();

    // Extract user ID from auth, body, or IP
    const userId =
      req.discordUser?.id || req.simpleUser?.userId || req.body?.userId || req.ip || "anonymous";
    const now = Date.now();
    const key = `${userId}:${maxRequests}`;

    if (!windows.has(key)) windows.set(key, []);
    const timestamps = windows.get(key);

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
