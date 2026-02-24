/**
 * GameStore class — Vanilla JS tiered store UI.
 *
 * v7.0.0: Removed fake client-side scarcity timer.
 * Timer now requires server-provided `scarcityEndTime`.
 * If no server time provided, merchant section is hidden.
 */
export class GameStore {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scarcityEndTime = null; // Must be provided by server
    this.timerInterval = null;
    this.tiers = [
      {
        title: "Farmer's Handful",
        gold: 100,
        price: "$0.99",
        tag: "",
        cta: "Buy Handful",
        style: "tier-base",
      },
      {
        title: "Stash Builder",
        gold: 250,
        price: "$2.49",
        tag: "+1 basic seed",
        cta: "Buy Stash",
        style: "tier-decoy",
      },
      {
        title: "💎 Megacorp Harvest",
        gold: 300,
        price: "$2.99",
        tag: "BEST VALUE",
        extras: "+3 Rare Seeds, +2h Energy Boost",
        cta: "Claim Megacorp",
        style: "tier-premium",
      },
    ];
  }

  /**
   * Set or update the scarcity timer from a server-provided timestamp.
   * @param {number} endTimeMs - Unix timestamp in milliseconds when the merchant departs.
   */
  setScarcityTimer(endTimeMs) {
    this.scarcityEndTime = endTimeMs;
    this.startCountdown();
  }

  startCountdown() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    const timerEl = this.container?.querySelector(".merchant-timer");
    if (!timerEl || !this.scarcityEndTime) return;

    this.timerInterval = setInterval(() => {
      const remaining = this.scarcityEndTime - Date.now();
      if (remaining <= 0) {
        timerEl.textContent = "DEPARTED";
        timerEl.classList.add("merchant-timer--departed");
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        return;
      }
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      timerEl.textContent = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }, 1000);
  }

  /**
   * Cleanup resources for unmount (intervals, DOM).
   */
  destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.container) {
      this.container.innerHTML = "";
    }
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="store-vanilla">
        ${
          this.scarcityEndTime
            ? `<div class="scarcity-badge">
                ⏰ Merchant leaves in <span class="merchant-timer font-numbers">--:--:--</span>
              </div>`
            : ""
        }
        <div class="store-tiers">
          ${this.tiers
            .map(
              (t) => `
            <div class="store-tier ${t.style} ${t.tag === "BEST VALUE" ? "store-card-neon" : ""}">
              ${t.tag === "BEST VALUE" ? '<div class="tier-badge">BEST VALUE</div>' : ""}
              <h4 class="tier-title">${t.title}</h4>
              <div class="tier-gold font-numbers">${t.gold} 🪙</div>
              ${t.tag && t.tag !== "BEST VALUE" ? `<div class="tier-tag">${t.tag}</div>` : ""}
              ${t.extras ? `<div class="tier-extras">${t.extras}</div>` : ""}
              <button class="tier-btn store-btn-squash" aria-label="${t.cta} for ${t.price}">
                ${t.cta} — ${t.price}
              </button>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
    if (this.scarcityEndTime) {
      this.startCountdown();
    }
  }
}
