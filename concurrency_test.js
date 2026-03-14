import { players, withPlayerLock } from "./playerManager.js";
import assert from "node:assert/strict";

players.set("test1", { resources: { gold: 100 } });

async function concurrentBuy() {
  await withPlayerLock("test1", async () => {
    const p = players.get("test1");
    // Simulate async DB check or delay
    await new Promise(r => setTimeout(r, 50)); 
    if (p.resources.gold >= 60) {
      // Intentionally delay again to widen the race window
      await new Promise(r => setTimeout(r, 50));
      p.resources.gold -= 60;
    }
  });
}

async function run() {
  console.log("Starting gold: ", players.get("test1").resources.gold);
  
  // Fire 10 concurrent requests
  const promises = [];
  for(let i=0; i<10; i++) {
    promises.push(concurrentBuy());
  }
  
  await Promise.all(promises);
  
  const finalGold = players.get("test1").resources.gold;
  console.log("Final gold (should be 40):", finalGold);
  
  try {
    assert.equal(finalGold, 40, "Double spend occurred!");
    console.log("✅ Concurrency Mutex Works!");
  } catch(e) {
    console.error("❌ " + e.message);
  }
  process.exit(0);
}

run();
