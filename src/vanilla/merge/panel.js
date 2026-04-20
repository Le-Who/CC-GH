import { GameStore } from "../store.js";
import { showToast, safeShowModal } from "../shared.js";
import { MERGE_CHAINS, ECONOMY, CROPS, CROP_TIERS } from "/game-logic.js";
import { tapGenerator, rollGacha, freePull, claimFreeTaps } from "./api.js";
import { isTrashMode, toggleTrashMode } from "./board.js";
import { getHarvestedCrops } from "../../services/inventoryService.js";

let _genPanel = null;
let _selectedFuel = {}; // chainId → cropId
let _cooldownTimer = null;

export function renderGeneratorPanel() {
  _genPanel = document.getElementById("merge-generators");
  if (!_genPanel) return;
  const mergeState = GameStore.getState("merge");
  const res = GameStore.getState("resources");
  if (!mergeState) return;

  _genPanel.textContent = "";
  const harvestedCrops = getHarvestedCrops();

  // ─── Primary Section: Generators ───
  const genSection = document.createElement("div");
  genSection.className = "merge-panel-section merge-gen-section";

  const genLabel = document.createElement("span");
  genLabel.className = "merge-section-label";
  genLabel.textContent = "⚡ Generators";
  genSection.appendChild(genLabel);

  const genRow = document.createElement("div");
  genRow.className = "merge-gen-row";

  for (const chainId of mergeState.generators) {
    const chain = MERGE_CHAINS[chainId];
    if (!chain) continue;
    const gs = mergeState.generatorState?.[chainId] || {
      tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
      cooldownEnd: 0,
    };

    const btn = document.createElement("button");
    btn.className = "merge-gen-btn";
    const onCooldown = gs.cooldownEnd > Date.now();

    if (onCooldown) {
      const mins = Math.ceil((gs.cooldownEnd - Date.now()) / 60000);
      btn.textContent = `${chain.emoji[0]} ⏳${mins}m`;
      btn.disabled = true;
      btn.classList.add("merge-gen-btn--cooldown");
    } else {
      btn.textContent = `${chain.emoji[0]} Tap (${gs.tapsLeft}/${ECONOMY.GENERATOR_TAP_LIMIT})`;
      btn.title = `Costs 1 crop → ${chain.name} items`;
    }

    btn.addEventListener("click", () => _tapWithFuel(chainId));
    genRow.appendChild(btn);

    const fuelCrop = _selectedFuel[chainId];
    if (fuelCrop && !onCooldown) {
      const cfg = CROPS[fuelCrop];
      const qty = harvestedCrops[fuelCrop] || 0;
      if (cfg && qty > 0) {
        const fuelBadge = document.createElement("button");
        fuelBadge.className = "merge-fuel-badge";
        fuelBadge.textContent = `${cfg.emoji} ×${qty}`;
        fuelBadge.title = `Fuel: ${cfg.name} (click to change)`;
        fuelBadge.addEventListener("click", (e) => {
          e.stopPropagation();
          _showCropPicker(chainId);
        });
        genRow.appendChild(fuelBadge);
      }
    }
  }

  genSection.appendChild(genRow);
  _genPanel.appendChild(genSection);

  // ─── Secondary Section: Tools ───
  const toolsRow = document.createElement("div");
  toolsRow.className = "merge-panel-section merge-tools-row";

  const tokenCount = res?.gachaTokens || 0;
  const gachaBtn = document.createElement("button");
  gachaBtn.className = "merge-gen-btn merge-gacha-btn";
  gachaBtn.textContent = `🎰 Gacha (${tokenCount}/${ECONOMY.GACHA_PULL_COST})`;
  gachaBtn.title = `Spend ${ECONOMY.GACHA_PULL_COST} Gacha Tokens`;
  gachaBtn.disabled = tokenCount < ECONOMY.GACHA_PULL_COST;
  gachaBtn.addEventListener("click", rollGacha);
  toolsRow.appendChild(gachaBtn);

  const lastPull = mergeState.lastFreePull || 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastStr = new Date(lastPull).toISOString().slice(0, 10);
  const canFreePull = lastStr !== todayStr;

  const freeBtn = document.createElement("button");
  freeBtn.className = "merge-gen-btn merge-free-btn";
  freeBtn.textContent = canFreePull ? "🎁 Free" : "🎁 Used";
  freeBtn.disabled = !canFreePull;
  freeBtn.addEventListener("click", freePull);
  toolsRow.appendChild(freeBtn);

  const trashBtn = document.createElement("button");
  const tm = isTrashMode();
  trashBtn.className = `merge-gen-btn merge-trash-btn${tm ? " active" : ""}`;
  trashBtn.textContent = "🗑️";
  trashBtn.title = "Click items on board to remove them";
  trashBtn.addEventListener("click", () => {
    const state = toggleTrashMode();
    trashBtn.classList.toggle("active", state);
  });
  toolsRow.appendChild(trashBtn);

  const lastFreeTaps = mergeState.lastFreeTaps || 0;
  const lastFreeTapsStr = new Date(lastFreeTaps).toISOString().slice(0, 10);
  const canClaimTaps = lastFreeTapsStr !== todayStr;

  const claimTapsBtn = document.createElement("button");
  claimTapsBtn.className = "merge-gen-btn merge-free-taps-btn";
  claimTapsBtn.textContent = canClaimTaps ? "🎁 +30 Taps" : "🎁 30/30";
  claimTapsBtn.title = canClaimTaps ? "Claim 30 free daily taps!" : "Already claimed today";
  claimTapsBtn.disabled = !canClaimTaps;
  claimTapsBtn.addEventListener("click", async () => {
    const success = await claimFreeTaps();
    if (success) renderGeneratorPanel();
  });
  toolsRow.appendChild(claimTapsBtn);

  _genPanel.appendChild(toolsRow);
}

function _showCropPicker(chainId) {
  const harvestedCrops = getHarvestedCrops();
  const cropIds = Object.keys(harvestedCrops).filter(
    (id) => harvestedCrops[id] > 0,
  );

  if (cropIds.length === 0) {
    showToast("🌱 No harvested crops! Grow some on the farm first.", "error");
    return;
  }

  const dialog = document.createElement("dialog");
  dialog.className = "modal merge-crop-picker";

  const title = document.createElement("h3");
  title.textContent = "Choose crop to fuel generator";
  dialog.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "merge-crop-picker__hint";
  subtitle.textContent = "Better crops → more items spawned";
  dialog.appendChild(subtitle);

  const list = document.createElement("div");
  list.className = "merge-crop-picker__list";

  for (const cropId of cropIds) {
    const cfg = CROPS[cropId];
    if (!cfg) continue;
    const tier = CROP_TIERS[cropId] || "cheap";
    const btn = document.createElement("button");
    btn.className = `merge-crop-btn merge-crop-btn--${tier}`;
    btn.textContent = `${cfg.emoji} ${cfg.name} (×${harvestedCrops[cropId]}) [${tier}]`;
    btn.addEventListener("click", () => {
      dialog.close();
      _selectedFuel[chainId] = cropId;
      tapGenerator(chainId, cropId);
    });
    list.appendChild(btn);
  }

  dialog.appendChild(list);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "merge-crop-btn merge-crop-btn--cancel";
  cancelBtn.textContent = "✕ Cancel";
  cancelBtn.addEventListener("click", () => dialog.close());
  dialog.appendChild(cancelBtn);

  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  safeShowModal(dialog);
}

function _tapWithFuel(chainId) {
  const fuelCrop = _selectedFuel[chainId];
  const harvestedCrops = getHarvestedCrops();

  if (fuelCrop && harvestedCrops[fuelCrop] && harvestedCrops[fuelCrop] > 0) {
    tapGenerator(chainId, fuelCrop);
    return;
  }
  _showCropPicker(chainId);
}

export function handleCooldownTimers(HUB) {
  _cooldownTimer = setInterval(() => {
    if (document.hidden || HUB.currentScreen !== 4) return;
    const mergeState = GameStore.getState("merge");
    if (!mergeState) return;
    for (const chainId of mergeState.generators) {
      const gs = mergeState.generatorState?.[chainId];
      if (gs && gs.cooldownEnd > 0 && gs.cooldownEnd <= Date.now()) {
        gs.tapsLeft = ECONOMY.GENERATOR_TAP_LIMIT;
        gs.cooldownEnd = 0;
        renderGeneratorPanel();
        break;
      }
    }
  }, 10000); // Check every 10s
}

export function clearCooldownTimers() {
  if (_cooldownTimer) {
    clearInterval(_cooldownTimer);
    _cooldownTimer = null;
  }
}
