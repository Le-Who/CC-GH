/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Redis Adapter (Upstash REST)
 *  v8.0: Read-through / write-through cache layer
 *
 *  Architecture:
 *    Client → playerManager → [Redis ←→ Firestore]
 *
 *  Redis is the primary hot-cache. Firestore is the
 *  durable persistence layer. Reads hit Redis first;
 *  on miss, fetch from Firestore → populate Redis.
 *  Writes go to Redis immediately, then async to Firestore.
 *
 *  Feature-flagged via UPSTASH_REDIS_URL env var.
 *  When absent, gracefully degrades to in-memory Map.
 * ═══════════════════════════════════════════════════════
 */

import { Redis } from "@upstash/redis";

/* ─── Configuration ─── */
const REDIS_KEY_PREFIX = "player:";
const REDIS_TTL_SECONDS = 86400; // 24h — auto-evicts inactive players
const NONCE_TTL_SECONDS = 300; // 5 min — idempotency nonce expiry
const NONCE_KEY_PREFIX = "nonce:";

let redis = null;
let redisEnabled = false;

/**
 * Initialize the Redis connection.
 * Call this at startup. Safe to call multiple times (idempotent).
 * @returns {boolean} Whether Redis was successfully initialized
 */
export function initRedis() {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;

  if (!url || !token) {
    console.log("  Redis: disabled (UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN not set)");
    return false;
  }

  try {
    redis = new Redis({ url, token });
    redisEnabled = true;
    console.log("🔴 Redis: connected via Upstash REST");
    return true;
  } catch (e) {
    console.warn("⚠️ Redis init failed, falling back to in-memory:", e.message);
    redisEnabled = false;
    return false;
  }
}

/**
 * Check if Redis is enabled and available.
 */
export function isRedisEnabled() {
  return redisEnabled && redis !== null;
}

/**
 * Get the raw Redis client (for advanced use cases).
 * Returns null if Redis is not enabled.
 */
export function getRedisClient() {
  return redis;
}

/* ═══════════════════════════════════════════════════
 *  Player State — Read-Through / Write-Through
 * ═══════════════════════════════════════════════════ */

/**
 * Read a player from Redis cache.
 * @param {string} userId
 * @returns {object|null} Player data or null if not cached
 */
export async function redisGetPlayer(userId) {
  if (!redisEnabled) return null;
  try {
    const key = `${REDIS_KEY_PREFIX}${userId}`;
    const data = await redis.get(key);
    if (!data) return null;
    // Upstash REST SDK returns parsed JSON automatically
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch (e) {
    console.warn(`Redis GET failed for ${userId}:`, e.message);
    return null; // Graceful degradation
  }
}

/**
 * Write player data to Redis cache (with TTL).
 * This is the "write-through" half — called after in-memory mutation.
 * @param {string} userId
 * @param {object} playerData
 */
export async function redisSetPlayer(userId, playerData) {
  if (!redisEnabled) return;
  try {
    const key = `${REDIS_KEY_PREFIX}${userId}`;
    await redis.set(key, JSON.stringify(playerData), { ex: REDIS_TTL_SECONDS });
  } catch (e) {
    console.warn(`Redis SET failed for ${userId}:`, e.message);
    // Non-fatal: Firestore will still persist
  }
}

/**
 * Delete a player from Redis cache (e.g. on LRU eviction).
 * @param {string} userId
 */
export async function redisDeletePlayer(userId) {
  if (!redisEnabled) return;
  try {
    const key = `${REDIS_KEY_PREFIX}${userId}`;
    await redis.del(key);
  } catch (e) {
    console.warn(`Redis DEL failed for ${userId}:`, e.message);
  }
}

/**
 * Bulk-populate Redis from a Map of players (used during loadDb).
 * Uses Redis pipeline for efficiency.
 * @param {Map<string, object>} playersMap
 */
export async function redisBulkLoad(playersMap) {
  if (!redisEnabled || playersMap.size === 0) return;
  try {
    const pipeline = redis.pipeline();
    let count = 0;
    for (const [userId, data] of playersMap.entries()) {
      pipeline.set(
        `${REDIS_KEY_PREFIX}${userId}`,
        JSON.stringify(data),
        { ex: REDIS_TTL_SECONDS },
      );
      count++;
    }
    await pipeline.exec();
    console.log(`🔴 Redis: bulk-loaded ${count} players`);
  } catch (e) {
    console.warn("Redis bulk-load failed:", e.message);
  }
}

/* ═══════════════════════════════════════════════════
 *  Idempotency Nonce Deduplication
 *  Replaces in-memory nonceCache with Redis SET + TTL
 * ═══════════════════════════════════════════════════ */

/**
 * Check if a nonce has been seen before. If not, mark it as seen.
 * Uses Redis SET NX (set-if-not-exists) with TTL for atomic check-and-set.
 *
 * @param {string} userId
 * @param {string} nonce
 * @returns {boolean} true if nonce was ALREADY seen (duplicate), false if new
 */
export async function isNonceSeenRedis(userId, nonce) {
  if (!redisEnabled || !nonce) return false;
  try {
    const key = `${NONCE_KEY_PREFIX}${userId}:${nonce}`;
    // SET NX returns true if the key was set (new nonce), null if already exists (duplicate)
    const wasSet = await redis.set(key, "1", { nx: true, ex: NONCE_TTL_SECONDS });
    return wasSet === null; // null = key already existed = duplicate
  } catch (e) {
    console.warn(`Redis nonce check failed for ${userId}:${nonce}:`, e.message);
    return false; // Fail-open: allow the request through
  }
}

/* ═══════════════════════════════════════════════════
 *  Pub/Sub Helpers (Future: cross-instance sync)
 * ═══════════════════════════════════════════════════ */

/**
 * Publish a message to a Redis channel.
 * @param {string} channel
 * @param {object} message
 */
export async function redisPublish(channel, message) {
  if (!redisEnabled) return;
  try {
    await redis.publish(channel, JSON.stringify(message));
  } catch (e) {
    console.warn(`Redis PUBLISH failed on ${channel}:`, e.message);
  }
}

/* ═══════════════════════════════════════════════════
 *  Graceful Shutdown — Flush Redis
 * ═══════════════════════════════════════════════════ */

/**
 * Flush pending Redis operations on shutdown.
 * Redis is durable (Upstash persists), so this is mainly for cleanup.
 */
export async function redisShutdown() {
  if (!redisEnabled) return;
  try {
    // Upstash REST doesn't maintain persistent connections, so no cleanup needed.
    // Just log that we're shutting down.
    console.log("🔴 Redis: shutdown complete (REST-based, no connections to close)");
    redisEnabled = false;
  } catch (e) {
    console.warn("Redis shutdown error:", e.message);
  }
}
