import { Redis } from "ioredis";

const REDIS_KEY_PREFIX = "player:";
const REDIS_TTL_SECONDS = 86_400;
const NONCE_TTL_SECONDS = 300;
const NONCE_KEY_PREFIX = "nonce:";

let redis = null;
let redisEnabled = false;

export function initRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("  Redis: disabled (REDIS_URL not set)");
    return false;
  }

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 50, 2000);
      },
    });
    redis.on("error", (e) => console.warn("Redis error:", e.message));
    redisEnabled = true;
    console.log("🔴 Redis: connected via TCP");
    return true;
  } catch (e) {
    console.warn("⚠️ Redis init failed:", e.message);
    redisEnabled = false;
    return false;
  }
}

export function isRedisEnabled() {
  if (process.env.NODE_ENV === "test") return false;
  return redisEnabled && redis !== null;
}

export function getRedisClient() {
  return redis;
}

export async function getRedisHealth() {
  const configured = !!process.env.REDIS_URL;
  if (!configured) {
    return {
      configured: false,
      connected: false,
      status: "disabled",
      distributedGuarantees: false,
    };
  }
  if (!redis || !redisEnabled) {
    return {
      configured: true,
      connected: false,
      status: "unavailable",
      distributedGuarantees: false,
    };
  }

  try {
    const pong = await redis.ping();
    const connected = pong === "PONG";
    return {
      configured: true,
      connected,
      status: connected ? "ok" : "unexpected_response",
      distributedGuarantees: connected,
    };
  } catch (e) {
    return {
      configured: true,
      connected: false,
      status: "error",
      error: e.message,
      distributedGuarantees: false,
    };
  }
}

export async function redisGetPlayer(userId) {
  if (!redisEnabled) return null;
  try {
    const data = await redis.get(`${REDIS_KEY_PREFIX}${userId}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.warn(`Redis GET failed for ${userId}:`, e.message);
    return null;
  }
}

export async function redisSetPlayer(userId, playerData) {
  if (!redisEnabled) return;
  try {
    await redis.set(
      `${REDIS_KEY_PREFIX}${userId}`,
      JSON.stringify(playerData),
      "EX",
      REDIS_TTL_SECONDS,
    );
  } catch (e) {
    console.warn(`Redis SET failed for ${userId}:`, e.message);
  }
}

export async function redisDeletePlayer(userId) {
  if (!redisEnabled) return;
  try {
    await redis.del(`${REDIS_KEY_PREFIX}${userId}`);
  } catch (e) {
    console.warn(`Redis DEL failed for ${userId}:`, e.message);
  }
}

export async function redisGetOrLoadPlayer(userId, postgresLoader) {
  if (!redisEnabled) return null;
  const cached = await redisGetPlayer(userId);
  if (cached) return cached;

  const loaded = postgresLoader ? await postgresLoader(userId) : null;
  if (!loaded) return null;
  await redisSetPlayer(userId, loaded);
  return loaded;
}

export async function isNonceSeenRedis(userId, nonce) {
  if (!redisEnabled || !nonce) return false;
  try {
    const key = `${NONCE_KEY_PREFIX}${userId}:${nonce}`;
    const wasSet = await redis.set(key, "1", "EX", NONCE_TTL_SECONDS, "NX");
    return wasSet === null;
  } catch (e) {
    console.warn(`Redis nonce check failed for ${userId}:${nonce}:`, e.message);
    return false;
  }
}

export async function redisPublish(channel, message) {
  if (!redisEnabled) return;
  try {
    await redis.publish(channel, JSON.stringify(message));
  } catch (e) {
    console.warn(`Redis PUBLISH failed on ${channel}:`, e.message);
  }
}

export async function redisShutdown() {
  if (!redisEnabled) return;
  try {
    redis.disconnect();
    redisEnabled = false;
    console.log("🔴 Redis: shutdown complete");
  } catch (e) {
    console.warn("Redis shutdown error:", e.message);
  }
}
