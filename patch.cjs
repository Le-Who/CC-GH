const fs = require('fs');
let c = fs.readFileSync('src/vanilla/farm.js', 'utf8');

const target1 = `  function onLeave() {
    stopLocalGrowthTick();
  }

  return {`;

const repl1 = `  function onLeave() {
    stopLocalGrowthTick();
  }

  // Feature 1: Listen to cross-tab Realtime broadcasts
  document.addEventListener("farm_state_sync", (e) => {
    const payload = e.detail;
    if (state && payload) {
      if (payload.plots) state.plots = payload.plots;
      if (payload.inventory) state.inventory = payload.inventory;
      
      // Hydrate GameStore without triggering a return broadcast
      import('./store.js').then(({ GameStore }) => {
        GameStore.setState('farm', { ...state });
      });

      if (typeof render === 'function') render();
      if (typeof renderShop === 'function') renderShop();
    }
  });

  return {`;

// Standardise all CRLF to LF internally for matching
c = c.replace(/\r\n/g, '\n');
if (c.includes(target1)) {
  c = c.replace(target1, repl1);
  console.log("Patched farm_state_sync successfully.");
} else {
  console.log("Target 1 not found");
}

fs.writeFileSync('src/vanilla/farm.js', c);
