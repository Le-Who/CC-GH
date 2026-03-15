import { initDb } from './db.js';
import 'dotenv/config';

async function run() {
  const sql = initDb();
  if (!sql) {
    console.log("No sql object");
    return;
  }
  const authCount = await sql`SELECT COUNT(*) FROM auth_users`;
  const playersCount = await sql`SELECT COUNT(*) FROM players`;
  console.log('Auth Users:', authCount[0].count);
  console.log('Players:', playersCount[0].count);
  process.exit(0);
}
run();
