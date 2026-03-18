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
  if (process.env.NODE_ENV === "test") return false;
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
 *  Distributed Lock — SETNX-based per-player mutex
 *  Replaces the in-memory withPlayerLock promise chain.
 *  Uses SET NX EX (set-if-not-exists with TTL).
 * ═══════════════════════════════════════════════════ */

const LOCK_KEY_PREFIX = "lock:player:";
const LOCK_TTL_SECONDS = 10;    // Auto-release after 10s (prevent deadlocks)
const LOCK_RETRY_MS = 50;       // Wait between retry attempts
const LOCK_MAX_RETRIES = 8;     // ~400ms total wait budget

/**
 * Acquire a distributed lock for a player.
 * @param {string} userId
 * @param {string} [lockValue] — Unique value for this lock holder (for safe release)
 * @returns {Promise<string|null>} The lock value if acquired, null if failed
 */
export async function redisLock(userId, lockValue) {
  if (!redisEnabled) return lockValue || "local"; // Degrade to no-lock (single-instance mode)
  const key = `${LOCK_KEY_PREFIX}${userId}`;
  const val = lockValue || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    try {
      const wasSet = await redis.set(key, val, { nx: true, ex: LOCK_TTL_SECONDS });
      if (wasSet !== null) return val; // Lock acquired
    } catch (e) {
      console.warn(`Redis LOCK attempt ${attempt + 1} failed for ${userId}:`, e.message);
      if (attempt >= LOCK_MAX_RETRIES - 1) return null;
    }
    // Wait before retrying
    await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
  }
  return null; // Could not acquire lock after all retries
}

/**
 * Release a distributed lock for a player.
 * Only releases if the lock value matches (prevents releasing someone else's lock).
 * @param {string} userId
 * @param {string} lockValue — The value returned by redisLock()
 */
export async function redisUnlock(userId, lockValue) {
  if (!redisEnabled) return;
  const key = `${LOCK_KEY_PREFIX}${userId}`;
  try {
    // Atomic check-and-delete via Lua script to prevent race conditions
    // If current value matches our lock value → delete; otherwise → no-op
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    await redis.eval(script, [key], [lockValue]);
  } catch (e) {
    // Fallback: simple DEL if Lua eval fails (Upstash REST may not support eval)
    try {
      const currentVal = await redis.get(key);
      if (currentVal === lockValue) {
        await redis.del(key);
      }
    } catch (delErr) {
      console.warn(`Redis UNLOCK failed for ${userId}:`, delErr.message);
    }
  }
}

/* ═══════════════════════════════════════════════════
 *  Player Get-Or-Load — Redis first, Firestore fallback
 *  This replaces direct reads from the in-memory players Map.
 * ═══════════════════════════════════════════════════ */

/**
 * Get a player from Redis, falling back to Firestore on cache miss.
 * On miss: fetches from Firestore → caches in Redis → returns.
 * @param {string} userId
 * @param {Function} firestoreLoader — async (userId) => playerData|null
 * @returns {Promise<object|null>} Player data or null if not found anywhere
 */
export async function redisGetOrLoadPlayer(userId, firestoreLoader) {
  if (!redisEnabled) return null; // Caller handles fallback

  // 1. Try Redis cache
  const cached = await redisGetPlayer(userId);
  if (cached) return cached;

  // 2. Cache miss — load from Firestore
  if (!firestoreLoader) return null;
  const firestoreData = await firestoreLoader(userId);
  if (!firestoreData) return null;

  // 3. Populate Redis for next read
  await redisSetPlayer(userId, firestoreData).catch((error) => {
    console.warn(`⚠️ Error populating Redis for ${userId}:`, error);
  });
  return firestoreData;
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
