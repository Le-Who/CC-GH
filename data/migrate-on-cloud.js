import { Firestore } from '@google-cloud/firestore';
import postgres from 'postgres';
import 'dotenv/config';

async function run() {
  console.log("=== STARTING CLOUD FIRESTORE -> POSTGRES MIGRATION ===");
  
  const DB_ID = process.env.FIRESTORE_DB_ID || "game-hub-db";
  const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "test-unigames";
  const PG_URL = process.env.DATABASE_URL;

  if (!PG_URL) {
    console.error("FATAL: DATABASE_URL not set.");
    process.exit(1);
  }

  const firestore = new Firestore({ databaseId: DB_ID, projectId: PROJECT_ID });
  
  // Use a max of 4 connections to not exhaust Supabase Free Tier transaction pooler
  const sql = postgres(PG_URL, { max: 4, idle_timeout: 10, prepare: false });

  try {
    // 1. Migrate auth_users (from 'users')
    console.log("\nMigrating [users] -> auth_users...");
    const usersCol = await firestore.collection('users').get();
    let userCount = 0;
    for (const doc of usersCol.docs) {
      const data = doc.data();
      const id = doc.id;
      await sql`
        INSERT INTO auth_users (id, data)
        VALUES (${id}, ${data})
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      `;
      userCount++;
    }
    console.log(`✅ Migrated ${userCount} users.`);

    // 2. Migrate auth_sessions (from 'sessions')
    console.log("\nMigrating [sessions] -> auth_sessions...");
    const sessionsCol = await firestore.collection('sessions').get();
    let sessionCount = 0;
    for (const doc of sessionsCol.docs) {
      const data = doc.data();
      const id = doc.id;
      const expiresAt = data.expiresAt || 0;
      await sql`
        INSERT INTO auth_sessions (id, data, expires_at)
        VALUES (${id}, ${data}, ${expiresAt})
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at
      `;
      sessionCount++;
    }
    console.log(`✅ Migrated ${sessionCount} sessions.`);

    // 3. Migrate players (from 'players')
    console.log("\nMigrating [players] -> players...");
    const playersCol = await firestore.collection('players').get();
    let playerCount = 0;
    for (const doc of playersCol.docs) {
      const data = doc.data();
      const id = doc.id;
      // Sanitize undefined fields from Firestore JSON
      const serializedData = JSON.stringify(data);
      await sql`
        INSERT INTO players (id, data, updated_at)
        VALUES (${id}, ${serializedData}, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
      playerCount++;
    }
    console.log(`✅ Migrated ${playerCount} players.`);

    // Verification
    console.log("\n--- Verification ---");
    const [uCountRow] = await sql`SELECT COUNT(*) FROM auth_users`;
    const [sCountRow] = await sql`SELECT COUNT(*) FROM auth_sessions`;
    const [pCountRow] = await sql`SELECT COUNT(*) FROM players`;
    console.log(`Postgres auth_users: ${uCountRow.count}`);
    console.log(`Postgres auth_sessions: ${sCountRow.count}`);
    console.log(`Postgres players: ${pCountRow.count}`);

  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
