import { parse, validate } from "@tma.js/init-data-node";
import { getOrCreateAccountForIdentity } from "../accountManager.js";
import { ensurePlayerLoaded } from "../playerManager.js";

const INIT_DATA_EXPIRES_IN_SECONDS = Number(
  process.env.TELEGRAM_INIT_DATA_TTL_SECONDS || 24 * 60 * 60,
);

function getDisplayName(user = {}) {
  return (
    user.username ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    "Player"
  );
}

function getTelegramUser(initData) {
  return initData?.user || initData?.receiver || null;
}

function isDevAuthAllowed() {
  return process.env.DEV_AUTH_ENABLED === "true" && process.env.NODE_ENV !== "production";
}

function parseAuthorization(authHeader = "") {
  const trimmed = String(authHeader || "").trim();
  if (!trimmed) return { type: "", data: "" };
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return { type: trimmed, data: "" };
  return {
    type: trimmed.slice(0, firstSpace).toLowerCase(),
    data: trimmed.slice(firstSpace + 1),
  };
}

async function resolveTelegramAuth(authData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    const err = new Error("TELEGRAM_BOT_TOKEN is not configured");
    err.status = 503;
    throw err;
  }
  if (!authData) {
    const err = new Error("Missing Telegram Mini App init data");
    err.status = 401;
    throw err;
  }

  validate(authData, botToken, { expiresIn: INIT_DATA_EXPIRES_IN_SECONDS });
  const initData = parse(authData);
  const user = getTelegramUser(initData);
  if (!user?.id) {
    const err = new Error("Telegram init data does not contain a user");
    err.status = 401;
    throw err;
  }

  const externalId = String(user.id);
  const username = getDisplayName(user);
  const accountId = await getOrCreateAccountForIdentity("telegram", externalId, {
    displayName: username,
    username: user.username || null,
    firstName: user.firstName || user.first_name || null,
    lastName: user.lastName || user.last_name || null,
    photoUrl: user.photoUrl || user.photo_url || null,
  });

  return {
    accountId,
    provider: "telegram",
    externalId,
    username,
    initData,
    telegramUser: user,
  };
}

async function resolveDevAuth(authData) {
  if (!isDevAuthAllowed()) {
    const err = new Error("Dev authorization is disabled");
    err.status = 401;
    throw err;
  }
  const externalId = String(authData || "").trim();
  if (!externalId) {
    const err = new Error("Missing dev user id");
    err.status = 401;
    throw err;
  }
  const username = `Dev ${externalId.slice(-6)}`;
  const accountId = await getOrCreateAccountForIdentity("dev", externalId, {
    displayName: username,
    username,
  });
  return { accountId, provider: "dev", externalId, username };
}

async function resolveTestAuth(req) {
  if (process.env.NODE_ENV !== "test") return null;
  const userId = req.body?.userId || req.query?.userId || req.headers["x-test-user-id"];
  if (!userId) return null;
  const username = req.body?.username || req.query?.username || "Test Player";
  const accountId = await getOrCreateAccountForIdentity("test", String(userId), {
    displayName: username,
    username,
  });
  return { accountId, provider: "test", externalId: String(userId), username };
}

export async function authenticateAuthorizationHeader(authHeader, req = {}) {
  const { type, data } = parseAuthorization(authHeader);
  if (type === "tma") return resolveTelegramAuth(data);
  if (type === "dev") return resolveDevAuth(data);
  if (process.env.NODE_ENV === "test") return resolveTestAuth(req);

  const err = new Error("Missing Telegram Mini App authorization");
  err.status = 401;
  throw err;
}

export const requireAuth = async (req, res, next) => {
  try {
    const auth = await authenticateAuthorizationHeader(req.headers.authorization || "", req);
    if (!auth) {
      return res.status(401).json({ error: "Missing authorization" });
    }
    req.authenticatedUser = auth;
    await ensurePlayerLoaded(auth.accountId);
    return next();
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ error: err.message || "Unauthorized" });
  }
};

export function resolveUser(req) {
  const user = req.authenticatedUser;
  if (user) {
    return {
      userId: user.accountId,
      username: user.username || "Player",
      provider: user.provider,
      externalId: user.externalId,
    };
  }

  if (process.env.NODE_ENV === "test") {
    if (req.method === "GET") {
      return {
        userId: req.query?.userId || "test-user",
        username: req.query?.username || "Test Player",
      };
    }
    return {
      userId: req.body?.userId || "test-user",
      username: req.body?.username || "Test Player",
    };
  }

  return { userId: null, username: "Player" };
}
