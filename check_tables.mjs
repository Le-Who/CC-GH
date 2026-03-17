import { initDb, getDb, closeDb } from './db.js';

async function run() {
  initDb();
  await new Promise(r => setTimeout(r, 2000));
  const db = getDb();
  
  const result = await db`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  console.log("Tables:", result.map(r => r.table_name));
  await closeDb();
}

run().catch(e => { console.error(e.message); process.exit(1); });
