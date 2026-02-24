/**
 * ═══════════════════════════════════════════════════════
 *  Retention UX Module — Daily Rewards, Achievement Pop-ups,
 *  Tomorrow Preview, Post-Game Cards, Streak Badge, Account Level
 * ═══════════════════════════════════════════════════════
 */
import { api, showToast, safeShowModal } from "./shared.js";

/* ─── Daily Login Reward Modal ─── */
let _dailyRewardDialog = null;

function _ensureDailyRewardDialog() {
  if (_dailyRewardDialog && _dailyRewardDialog.isConnected)
    return _dailyRewardDialog;
  _dailyRewardDialog = document.createElement("dialog");
  _dailyRewardDialog.id = "daily-reward-dialog";
  _dailyRewardDialog.className = "retention-dialog daily-reward-dialog";
  _dailyRewardDialog.innerHTML = `
    <div class="retention-card">
      <h2 class="retention-title">📅 Daily Gift</h2>
      <div id="daily-reward-calendar" class="daily-calendar"></div>
      <div id="daily-reward-claim" class="daily-claim-area"></div>
      <button class="retention-close" aria-label="Close">✕</button>
    </div>
  `;
  document.body.appendChild(_dailyRewardDialog);
  _dailyRewardDialog
    .querySelector(".retention-close")
    .addEventListener("click", () => _dailyRewardDialog.close());
  _dailyRewardDialog.addEventListener("click", (e) => {
    if (e.target === _dailyRewardDialog) _dailyRewardDialog.close();
  });
  return _dailyRewardDialog;
}

function _renderCalendar(data) {
  const dialog = _ensureDailyRewardDialog();
  const cal = dialog.querySelector("#daily-reward-calendar");
  const claim = dialog.querySelector("#daily-reward-claim");

  cal.innerHTML = (data.calendar || [])
    .map(
      (d) => `
    <div class="daily-day ${d.claimed ? "claimed" : ""} ${d.isToday ? "today" : ""}">
      <span class="daily-day-num">Day ${d.day}</span>
      <span class="daily-day-emoji">${d.emoji}</span>
      <span class="daily-day-label">${d.label}</span>
      ${d.claimed ? '<span class="daily-check">✓</span>' : ""}
    </div>
  `,
    )
    .join("");

  if (data.alreadyClaimed || data.claimed) {
    claim.innerHTML = `<p class="daily-done">✅ Today's gift claimed! See you tomorrow.</p>`;
  } else {
    claim.innerHTML = `<button class="daily-claim-btn" id="claim-daily-btn">🎁 Claim Today's Gift</button>`;
    claim
      .querySelector("#claim-daily-btn")
      .addEventListener("click", async () => {
        const result = await api("/api/daily-reward/claim", {});
        if (result.claimed) {
          showToast(`${result.emoji} ${result.label}: Claimed!`, "success");
          _renderCalendar({ ...result, alreadyClaimed: true });
          // Refresh HUD
          document.dispatchEvent(new CustomEvent("retention-refresh"));
        }
      });
  }

  // Streak badge
  const streak = data.streak;
  if (streak?.current > 0) {
    const streakEl = dialog.querySelector(".retention-title");
    streakEl.innerHTML = `📅 Daily Gift <span class="streak-inline">🔥 ${streak.current}-day streak</span>`;
  }
}

export async function showDailyRewardModal() {
  const data = await api("/api/daily-reward/state");
  if (data.error) return;
  _renderCalendar(data);
  safeShowModal(_ensureDailyRewardDialog());
}

/** Auto-check on boot: show modal if unclaimed today */
export async function checkDailyReward() {
  const data = await api("/api/daily-reward/state");
  if (data.error) return;
  if (!data.alreadyClaimed) {
    // Brief delay so player sees the game first
    setTimeout(() => showDailyRewardModal(), 1500);
  }
}

/* ─── Achievement Pop-up ─── */
export async function checkAndShowAchievements() {
  const data = await api("/api/achievements/check", {});
  if (data.error || !data.newlyUnlocked?.length) return;

  for (const ach of data.newlyUnlocked) {
    _showAchievementPopup(ach);
    await new Promise((r) => setTimeout(r, 2200)); // Stagger multiple
  }
}

function _showAchievementPopup(achievement) {
  // Remove any existing popup
  const existing = document.getElementById("achievement-popup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.id = "achievement-popup";
  popup.className = "achievement-popup";
  popup.innerHTML = `
    <div class="achievement-popup-inner">
      <div class="achievement-confetti"></div>
      <span class="achievement-emoji">${achievement.emoji || "🏆"}</span>
      <div class="achievement-text">
        <strong>Achievement Unlocked!</strong>
        <span>${achievement.name}</span>
        <small>${achievement.desc}</small>
      </div>
      ${achievement.reward?.gold ? `<span class="achievement-reward">+${achievement.reward.gold}🪙</span>` : ""}
    </div>
  `;
  document.body.appendChild(popup);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => popup.classList.add("show"));
  });

  // Auto-dismiss
  setTimeout(() => {
    popup.classList.remove("show");
    popup.addEventListener("transitionend", () => popup.remove(), {
      once: true,
    });
  }, 3000);
}

/* ─── Tomorrow's Preview Card ─── */
let _previewDialog = null;

function _ensurePreviewDialog() {
  if (_previewDialog && _previewDialog.isConnected) return _previewDialog;
  _previewDialog = document.createElement("dialog");
  _previewDialog.id = "tomorrow-preview-dialog";
  _previewDialog.className = "retention-dialog preview-dialog";
  _previewDialog.innerHTML = `
    <div class="retention-card preview-card">
      <h2 class="retention-title">🌅 Tomorrow's Outlook</h2>
      <div id="preview-items" class="preview-items"></div>
      <p class="preview-goodbye">See you tomorrow! 👋</p>
      <button class="retention-close" aria-label="Close">✕</button>
    </div>
  `;
  document.body.appendChild(_previewDialog);
  _previewDialog
    .querySelector(".retention-close")
    .addEventListener("click", () => _previewDialog.close());
  _previewDialog.addEventListener("click", (e) => {
    if (e.target === _previewDialog) _previewDialog.close();
  });
  return _previewDialog;
}

export async function showTomorrowPreview() {
  const data = await api("/api/tomorrow-preview");
  if (data.error || !data.preview?.length) return;

  const dialog = _ensurePreviewDialog();
  const items = dialog.querySelector("#preview-items");
  items.innerHTML = data.preview
    .map(
      (p) => `
    <div class="preview-item">
      <span class="preview-emoji">${p.emoji}</span>
      <span class="preview-text">${p.text}</span>
    </div>
  `,
    )
    .join("");

  safeShowModal(dialog);
}

/* ─── Post-Game "What's Next" Card ─── */
export function showPostGameCard(gameData) {
  // Remove any existing card
  const existing = document.getElementById("postgame-card");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.id = "postgame-card";
  card.className = "postgame-card";

  const { gameName, score, goldEarned, xpEarned, suggestions } = gameData;
  const emoji =
    { farm: "🌱", trivia: "🧠", match3: "💎", blox: "🧱", merge: "✨" }[
      gameName
    ] || "🎮";

  card.innerHTML = `
    <div class="postgame-inner">
      <h3 class="postgame-title">${emoji} ${_capitalize(gameName)} Complete!</h3>
      ${score ? `<div class="postgame-score">Score: ${score.toLocaleString()}</div>` : ""}
      <div class="postgame-stats">
        ${goldEarned ? `<span>+${goldEarned}🪙</span>` : ""}
        ${xpEarned ? `<span>+${xpEarned} XP</span>` : ""}
      </div>
      <div class="postgame-whats-next">
        <strong>What's next?</strong>
        ${(suggestions || [])
          .map(
            (s) => `
          <div class="postgame-suggestion" data-action="${s.action || ""}">
            <span>${s.emoji}</span> <span>${s.text}</span>
          </div>
        `,
          )
          .join("")}
      </div>
      <div class="postgame-actions">
        <button class="postgame-btn primary" data-action="replay">Play Again</button>
        <button class="postgame-btn secondary" data-action="farm">Back to Farm</button>
      </div>
    </div>
  `;
  document.body.appendChild(card);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add("show"));
  });

  // Button handlers
  card.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      card.classList.remove("show");
      card.addEventListener("transitionend", () => card.remove(), {
        once: true,
      });
      document.dispatchEvent(
        new CustomEvent("postgame-action", { detail: btn.dataset.action }),
      );
    });
  });
}

function _capitalize(s) {
  const names = {
    farm: "Cozy Farm",
    trivia: "Brain Blitz",
    match3: "Gem Crush",
    blox: "Building Blox",
    merge: "Gacha Merge",
  };
  return names[s] || s;
}

/* ─── HUD Retention Badges (Streak + Account Level) ─── */
export function updateRetentionHUD(container) {
  if (!container) return;
  let badge = container.querySelector("#retention-hud-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "retention-hud-badge";
    badge.className = "retention-hud-badge";
    container.appendChild(badge);
  }

  // Fetch both concurrently
  Promise.all([api("/api/account-level"), api("/api/daily-reward/state")]).then(
    ([level, daily]) => {
      if (level.error && daily.error) return;
      const lvl = level.level || 1;
      const xp = level.xp || 0;
      const xpMax = level.xpToNext || 150;
      const pct = Math.round((xp / xpMax) * 100);
      const streak = daily.streak?.current || 0;
      const hasDailyGift = !daily.alreadyClaimed;

      badge.innerHTML = `
      <div class="rhud-level" title="Account Level ${lvl}">
        <span class="rhud-level-num">⭐ Lv.${lvl}</span>
        <div class="rhud-xp-bar"><div class="rhud-xp-fill" style="width:${pct}%"></div></div>
      </div>
      ${streak > 0 ? `<span class="rhud-streak" title="${streak}-day streak">🔥${streak}</span>` : ""}
      ${hasDailyGift ? `<button class="rhud-gift-btn" id="rhud-gift-btn" title="Daily gift available!">🎁</button>` : ""}
    `;

      const giftBtn = badge.querySelector("#rhud-gift-btn");
      if (giftBtn) {
        giftBtn.addEventListener("click", () => showDailyRewardModal());
      }
    },
  );
}

/* ─── Weekly Challenges Section (for quest dropdown or dedicated UI) ─── */
export async function getWeeklyChallengesHtml() {
  const data = await api("/api/weekly-challenges");
  if (data.error) return "";

  const completed = (data.challenges || []).filter((c) => c.completed).length;
  const total = (data.challenges || []).length;
  const msLeft = data.msUntilReset || 0;
  const hoursLeft = Math.floor(msLeft / 3_600_000);
  const daysLeft = Math.floor(hoursLeft / 24);
  const timeLabel =
    daysLeft > 0 ? `${daysLeft}d ${hoursLeft % 24}h` : `${hoursLeft}h`;

  return `
    <div class="weekly-challenges">
      <div class="wc-header">
        <strong>📋 Weekly Challenges</strong>
        <span class="wc-counter">${completed}/${total} done</span>
      </div>
      ${(data.challenges || [])
        .map(
          (ch) => `
        <div class="wc-item ${ch.completed ? "done" : ""}">
          <span class="wc-emoji">${ch.emoji}</span>
          <span class="wc-desc">${ch.desc}</span>
          <span class="wc-progress">${ch.completed ? "✅" : `${Math.min(ch.progress || 0, ch.target)}/${ch.target}`}</span>
        </div>
      `,
        )
        .join("")}
      <div class="wc-footer">
        <span class="wc-reward">🏆 All 5 → ${data.completionReward?.gold || 200}🪙 + ${data.completionReward?.gachaTokens || 3} Gacha</span>
        <span class="wc-timer">⏰ Resets in ${timeLabel}</span>
      </div>
    </div>
  `;
}

/* ─── Pet Mood Badge ─── */
export async function updatePetMoodBadge(container) {
  if (!container) return;
  const data = await api("/api/pet/mood");
  if (data.error) return;

  let badge = container.querySelector("#pet-mood-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "pet-mood-badge";
    badge.className = "pet-mood-badge";
    container.appendChild(badge);
  }
  badge.textContent = data.emoji;
  badge.title = data.label;
  badge.dataset.mood = data.mood;
}
