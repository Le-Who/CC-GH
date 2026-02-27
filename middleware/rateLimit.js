/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Rate Limiter Middleware
 *  In-memory sliding window per user ID
 * ═══════════════════════════════════════════════════════
 */

const windows = new Map(); // userId → [timestamps]

/**
 * Creates a rate limiter middleware.
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window duration in milliseconds
 */
export function createRateLimiter(maxRequests = 60, windowMs = 60_000) {
  // Cleanup old entries every 5 minutes (unref for clean test exit)
  setInterval(() => {
    const cutoff = Date.now() - windowMs * 2;
    for (const [key, timestamps] of windows.entries()) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) windows.delete(key);
      else windows.set(key, valid);
    }
  }, 300_000).unref();

  return (req, res, next) => {
    // Extract user ID from auth, body, or IP
    const userId =
      req.discordUser?.id || req.body?.userId || req.ip || "anonymous";
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
export const authLimiter = createRateLimiter(10, 60_000);
