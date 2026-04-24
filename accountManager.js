import crypto from "crypto";
import { ensureDbSchema, getDb } from "./db.js";

const ACCOUNT_ID_PREFIX = "acct:";

function createAccountId() {
  return `${ACCOUNT_ID_PREFIX}${crypto.randomUUID()}`;
}

function normalizeProfile(profile = {}) {
  return {
    displayName: profile.displayName || profile.username || "Player",
    username: profile.username || null,
    firstName: profile.firstName || null,
    lastName: profile.lastName || null,
    photoUrl: profile.photoUrl || null,
  };
}

export function isCanonicalAccountId(value) {
  return typeof value === "string" && value.startsWith(ACCOUNT_ID_PREFIX);
}

export async function getOrCreateAccountForIdentity(provider, externalId, profile = {}) {
  if (!provider || !externalId) {
    throw new Error("Provider and externalId are required");
  }

  const sql = getDb();
  if (!sql) {
    if (process.env.NODE_ENV === "test" || process.env.DEV_AUTH_ENABLED === "true") {
      return `${provider}:${externalId}`;
    }
    throw new Error("DATABASE_URL is required for account resolution");
  }

  const normalizedProvider = String(provider);
  const normalizedExternalId = String(externalId);
  const normalizedProfile = normalizeProfile(profile);

  await ensureDbSchema();

  const existing = await sql`
    SELECT account_id
    FROM account_identities
    WHERE provider = ${normalizedProvider}
      AND external_id = ${normalizedExternalId}
    LIMIT 1
  `;
  if (existing.length) return existing[0].account_id;

  const accountId = createAccountId();
  const displayName = normalizedProfile.displayName || `Player_${normalizedExternalId.slice(-4)}`;

  return sql.begin(async (tx) => {
    const locked = await tx`
      SELECT account_id
      FROM account_identities
      WHERE provider = ${normalizedProvider}
        AND external_id = ${normalizedExternalId}
      FOR UPDATE
    `;
    if (locked.length) return locked[0].account_id;

    await tx`
      INSERT INTO accounts (id, display_name, profile, created_at, updated_at)
      VALUES (${accountId}, ${displayName}, ${normalizedProfile}, now(), now())
    `;
    await tx`
      INSERT INTO account_identities (provider, external_id, account_id, profile, created_at, updated_at)
      VALUES (${normalizedProvider}, ${normalizedExternalId}, ${accountId}, ${normalizedProfile}, now(), now())
    `;
    return accountId;
  });
}

export async function getAccountReport() {
  const sql = getDb();
  if (!sql) return { database: false };

  await ensureDbSchema();

  const [accounts] = await sql`SELECT COUNT(*)::int AS count FROM accounts`;
  const identities = await sql`
    SELECT provider, COUNT(*)::int AS count
    FROM account_identities
    GROUP BY provider
    ORDER BY provider
  `;
  const orphans = await sql`
    SELECT COUNT(*)::int AS count
    FROM account_identities i
    LEFT JOIN accounts a ON a.id = i.account_id
    WHERE a.id IS NULL
  `;

  return {
    database: true,
    accounts: accounts.count,
    identities,
    orphanIdentities: orphans[0]?.count || 0,
  };
}
