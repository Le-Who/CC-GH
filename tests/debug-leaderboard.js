import "dotenv/config";
import { initDb, getDb } from "../db.js";

async function debug() {
  const sql = initDb();
  if (!sql) {
    console.error("No DB connection");
    process.exit(1);
  }

  try {
    console.log("--- Checking for non-numeric high scores ---");
    // This query uses a regex to find values that are not strictly digits
    const badMatch3 = await sql`
      SELECT id, data->'match3'->>'highScore' as hs
      FROM players
      WHERE data->'match3'->>'highScore' IS NOT NULL
        AND data->'match3'->>'highScore' !~ '^\\d+$'
    `;
    console.log("Bad Match3 scores:", badMatch3);

    const badBlox = await sql`
      SELECT id, data->'blox'->>'highScore' as hs
      FROM players
      WHERE data->'blox'->>'highScore' IS NOT NULL
        AND data->'blox'->>'highScore' !~ '^\\d+$'
    `;
    console.log("Bad Blox scores:", badBlox);

    console.log("\n--- Checking for missing username in data ---");
    const missingUsername = await sql`
      SELECT id, data
      FROM players
      WHERE data->'username' IS NULL
      LIMIT 5
    `;
    console.log("Players missing username field:", missingUsername.length);
    if (missingUsername.length > 0) {
        console.log("Sample missing username:", JSON.stringify(missingUsername[0], null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error("Error during debug:", err);
    process.exit(1);
  }
}

debug();
