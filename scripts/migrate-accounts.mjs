import crypto from "node:crypto";
import postgres from "postgres";

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--verify")
    ? "verify"
    : "dry-run";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  prepare: false,
});

async function ensureIdentitySchema(client = sql) {
  await client`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT 'Player',
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await client`
    CREATE TABLE IF NOT EXISTS account_identities (
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, external_id)
    );
  `;
  await client`
    CREATE INDEX IF NOT EXISTS account_identities_account_id_idx
      ON account_identities (account_id);
  `;
}

async function collectReport(client = sql) {
  const [accounts] = await client`SELECT COUNT(*)::int AS count FROM accounts`;
  const identities = await client`
    SELECT provider, COUNT(*)::int AS count
    FROM account_identities
    GROUP BY provider
    ORDER BY provider
  `;
  const [legacyPlayers] = await client`
    SELECT COUNT(*)::int AS count
    FROM players
    WHERE id NOT LIKE 'acct:%'
  `;
  const [orphanPlayers] = await client`
    SELECT COUNT(*)::int AS count
    FROM players p
    LEFT JOIN accounts a ON a.id = p.id
    WHERE p.id LIKE 'acct:%' AND a.id IS NULL
  `;
  const duplicateIdentities = await client`
    SELECT provider, external_id, COUNT(*)::int AS count
    FROM account_identities
    GROUP BY provider, external_id
    HAVING COUNT(*) > 1
  `;
  const [missingMappings] = await client`
    SELECT COUNT(*)::int AS count
    FROM players p
    LEFT JOIN account_identities i
      ON i.provider = 'legacy' AND i.external_id = p.id
    WHERE p.id NOT LIKE 'acct:%' AND i.account_id IS NULL
  `;

  return {
    accounts: accounts.count,
    identities,
    legacyPlayers: legacyPlayers.count,
    orphanPlayers: orphanPlayers.count,
    duplicateIdentities,
    missingLegacyMappings: missingMappings.count,
  };
}

async function applyMigration() {
  await sql.begin(async (tx) => {
    await ensureIdentitySchema(tx);
    const rows = await tx`
      SELECT id, data
      FROM players
      WHERE id NOT LIKE 'acct:%'
      ORDER BY id
    `;

    for (const row of rows) {
      const existing = await tx`
        SELECT account_id
        FROM account_identities
        WHERE provider = 'legacy' AND external_id = ${row.id}
      `;
      const accountId = existing[0]?.account_id || `acct:${crypto.randomUUID()}`;
      const data = {
        ...(row.data || {}),
        id: accountId,
        _legacyPlayerId: row.id,
      };
      const displayName = data.username || `Player_${String(row.id).slice(-4)}`;

      await tx`
        INSERT INTO accounts (id, display_name, profile)
        VALUES (${accountId}, ${displayName}, ${tx.json({ migratedFrom: row.id })})
        ON CONFLICT (id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            updated_at = now()
      `;
      await tx`
        INSERT INTO account_identities (provider, external_id, account_id, profile)
        VALUES ('legacy', ${row.id}, ${accountId}, ${tx.json({ migratedAt: new Date().toISOString() })})
        ON CONFLICT (provider, external_id) DO UPDATE
        SET account_id = EXCLUDED.account_id,
            updated_at = now()
      `;
      await tx`
        INSERT INTO players (id, data, updated_at)
        VALUES (${accountId}, ${data}, now())
        ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = now()
      `;
      await tx`DELETE FROM players WHERE id = ${row.id}`;
    }
  });
}

try {
  await ensureIdentitySchema();
  if (mode === "dry-run") {
    const rows = await sql`
      SELECT id
      FROM players
      WHERE id NOT LIKE 'acct:%'
      ORDER BY id
      LIMIT 20
    `;
    console.log(JSON.stringify({ mode, report: await collectReport(), sampleLegacyIds: rows.map((r) => r.id) }, null, 2));
  } else if (mode === "apply") {
    await applyMigration();
    console.log(JSON.stringify({ mode, report: await collectReport() }, null, 2));
  } else {
    const report = await collectReport();
    console.log(JSON.stringify({ mode, report }, null, 2));
    if (report.orphanPlayers > 0 || report.duplicateIdentities.length > 0 || report.missingLegacyMappings > 0) {
      process.exitCode = 1;
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
