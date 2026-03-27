/* ═══════════════════════════════════════════════════
 *  Farm Module — Tabs (Badges, Journal, Season Pass)
 *  Renders secondary farm panel tabs.
 * ═══════════════════════════════════════════════════ */
import { HUB, showToast, api } from "../shared.js";
import { CROPS as CROPS_CONFIG, ACHIEVEMENTS, SEASON_PASS } from "/game-logic.js";
import { HUD } from "../hud.js";
import { $ } from "./utils.js";
import { renderInventory } from "./inventory.js";

let _state = null;
let _actions = null;

export function setTabsDeps(deps) { _actions = deps; }
export function syncTabsState(state) { _state = state; }

/* ─── Tab Switching ─── */
export function switchFarmTab(tab) {
  const tabs = document.querySelectorAll(".farm-tab");
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  const contents = document.querySelectorAll(".farm-tab-content");
  contents.forEach((c) => c.classList.toggle("active", c.id === `farm-tab-content-${tab}`));
  if (tab === "inv") renderInventory();
  if (tab === "badges") renderBadges();
  if (tab === "journal") renderJournal();
  if (tab === "season") renderSeasonPass();
}

/* ─── Badges ─── */
export function renderBadges() {
  const grid = $("farm-badges-grid");
  if (!grid) return;
  const achievements = _state?.achievements || {};
  grid.innerHTML = "";
  for (const [id, badge] of Object.entries(ACHIEVEMENTS)) {
    const unlocked = !!achievements[id];
    const claimed = achievements[id]?.seen;
    const card = document.createElement("div");
    card.className = `farm-badge-card${unlocked ? " unlocked" : " locked"}${claimed ? " claimed" : ""}`;
    card.innerHTML = `
      <div class="badge-emoji">${unlocked ? badge.emoji : "🔒"}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.desc}</div>
      ${unlocked && !claimed ? `<button class="badge-claim-btn">🎁 Claim ${badge.reward.gold ? badge.reward.gold + "🪙" : badge.reward.gachaTokens + "🎫"}</button>` : ""}
      ${claimed ? '<div class="badge-claimed">✅ Claimed</div>' : ""}
    `;
    if (unlocked && !claimed) {
      card.querySelector(".badge-claim-btn").addEventListener("click", async () => {
        const data = await api("/api/achievements/claim", { userId: HUB.userId, badgeId: id });
        if (data?.success) {
          _state.achievements[id] = { ..._state.achievements[id], seen: true };
          if (data.resources) HUD.syncFromServer(data.resources);
          renderBadges();
          showToast(`🏆 Claimed: ${badge.emoji} ${badge.name}!`);
        }
      });
    }
    grid.appendChild(card);
  }
}

/* ─── Journal ─── */
export function renderJournal() {
  const grid = $("farm-journal-grid");
  if (!grid) return;
  const discovered = _state?._journal?.discovered || [];
  grid.innerHTML = "";
  const allCrops = Object.values(CROPS_CONFIG);
  for (const cfg of allCrops) {
    const found = discovered.includes(cfg.id);
    const card = document.createElement("div");
    card.className = `farm-journal-card${found ? " discovered" : " undiscovered"}`;
    card.innerHTML = found
      ? `<div class="journal-emoji">${cfg.emoji}</div>
         <div class="journal-name">${cfg.name}</div>
         <div class="journal-lore">${cfg.lore || ""}</div>
         <div class="journal-stats">🪙${cfg.sellPrice} · ⏱${Math.round(cfg.growthTime / 60000)}m · ⭐${cfg.xp}XP</div>`
      : `<div class="journal-emoji">❓</div>
         <div class="journal-name">???</div>
         <div class="journal-lore">Grow this crop to discover it!</div>`;
    grid.appendChild(card);
  }
}

/* ─── Season Pass ─── */
export function renderSeasonPass() {
  const container = $("farm-season-pass");
  if (!container) return;
  const sp = _state?._seasonPass || { season: 1, xp: 0, tier: 0, claimed: [] };
  const tiers = SEASON_PASS.tiers;
  const maxXp = tiers[tiers.length - 1].xp;
  const pct = Math.min(100, Math.round((sp.xp / maxXp) * 100));

  let html = `
    <div class="season-header">
      <span class="season-title">⭐ ${SEASON_PASS.name}</span>
      <span class="season-xp">${sp.xp} / ${maxXp} XP</span>
    </div>
    <div class="season-progress-bar"><div class="season-progress-fill" style="width:${pct}%"></div></div>
    <div class="season-tiers">`;

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const unlocked = sp.xp >= t.xp;
    const claimed = sp.claimed?.includes(i);
    const rewardText = t.reward.gold ? `${t.reward.gold}🪙`
      : t.reward.theme ? `🎨 ${t.reward.theme}`
      : t.reward.seeds ? "🌱 Seeds"
      : t.reward.gachaTokens ? `${t.reward.gachaTokens}🎫`
      : t.reward.title || "";
    html += `
      <div class="season-tier${unlocked ? " unlocked" : ""}${claimed ? " claimed" : ""}" data-tier="${i}">
        <div class="tier-label">${t.label}</div>
        <div class="tier-reward">${rewardText}</div>
        <div class="tier-xp">${t.xp} XP</div>
        ${unlocked && !claimed ? `<button class="tier-claim-btn" data-tier-idx="${i}">🎁 Claim</button>` : ""}
        ${claimed ? '<div class="tier-claimed">✅</div>' : ""}
      </div>`;
  }
  html += "</div>";
  container.innerHTML = html;

  container.querySelectorAll(".tier-claim-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.tierIdx);
      const data = await api("/api/season-pass/claim", { userId: HUB.userId, tierIndex: idx });
      if (data?.success) {
        _state._seasonPass = data.seasonPass;
        if (data.resources) HUD.syncFromServer(data.resources);
        renderSeasonPass();
        showToast(`⭐ Season reward claimed: ${tiers[idx].label}!`);
      }
    });
  });
}
