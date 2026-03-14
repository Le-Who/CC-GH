import { GameStore } from "./store.js";

export class QuestDropdown {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.isVisible = false;

    if (!this.container) return;

    // Listen to global toggle command
    document.addEventListener("toggle-quests", () => this.toggle());

    // Unobtrusive click-outside-to-close behavior (Nudge Theory / Friction Reduction)
    document.addEventListener("click", (e) => {
      if (
        this.isVisible &&
        !e.target.closest("#" + this.containerId) &&
        !e.target.closest("#quest-log-btn")
      ) {
        this.close();
      }
    });

    // Close button
    const closeBtn = document.getElementById("quest-dropdown-close");
    if (closeBtn) closeBtn.addEventListener("click", () => this.close());

    // Make the UI Reactive
    GameStore.subscribe("pet", () => {
      if (this.isVisible) this.render();
    });
    GameStore.subscribe("resources", () => {
      if (this.isVisible) this.render();
    });
    GameStore.subscribe("merge", () => {
      if (this.isVisible) this.render();
    });
  }

  // Format requirement internal logic pulled from hud.js
  _formatReq(r) {
    if (r.type === "crop") {
      const emojis = {
        strawberry: "🍓",
        blueberry: "🫐",
        tomato: "🍅",
        golden: "🌹",
        corn: "🌽",
        sunflower: "🌻",
        watermelon: "🍉",
        pumpkin: "🎃",
      };
      return `${emojis[r.id] || "🌱"} x${r.qty}`;
    }
    if (r.type === "merge") {
      const e = {
        thread: "🧵",
        yarn: "🧶",
        fabric: "🪡",
        shirt: "👕",
        jacket: "🧥",
      };
      return `${e[r.id] || "🧩"} x${r.qty}`;
    }
    return r.id;
  }

  _getPlayerQty(req) {
    if (req.type === "crop") {
      const res = GameStore.getState("resources");
      return (res?.harvested || {})[req.id] || 0;
    } else if (req.type === "merge") {
      const mergeState = GameStore.getState("merge");
      const board = mergeState?.board;
      if (!board) return 0;
      let found = 0;
      for (const row of board) {
        for (const cell of row) {
          if (cell && cell.id === req.id) found++;
        }
      }
      return found;
    }
    return 0;
  }

  _generateQuestOrders() {
    return new Promise((resolve) => {
      // Just dispatch a window event that the game-logic handles, or call API
      // For simplicity, HUD already handles real API calls. We'll simply proxy to the API.
      resolve();
    });
  }

  render() {
    if (!this.container) return;

    const pet = GameStore.getState("pet");
    const orders = pet?.activeOrders || [];

    let content;
    if (orders.length === 0) {
      content =
        '<p class="text-dim" style="font-size:0.82rem;margin:8px 0;text-align:center">No active quests. Generate some!</p>';
    } else {
      content = orders
        .map((o) => {
          // Build progress-bar requirements
          const reqsHtml = o.requirements
            .map((r) => {
              const haveRaw = this._getPlayerQty(r);
              const need = r.qty;
              // Goal-Gradient Effect: Give artificial +1 headway visually if have=0
              // to reduce activation energy block.
              const artificialStart =
                haveRaw === 0 ? Math.max(1, Math.floor(need * 0.1)) : 0;
              const visualHave = Math.min(need, haveRaw + artificialStart);

              const pct = Math.min(100, Math.round((visualHave / need) * 100));
              const done = haveRaw >= need;

              return `
                <div class="quest-item" style="margin-bottom: 12px;">
                    <p style="color:var(--text-primary); margin-bottom:4px; font-weight: 500; font-size: 14px;">
                        ${this._formatReq(r)}
                    </p>
                    <p style="color:var(--brand-accent); font-size:12px; margin:0; font-weight: bold;">
                        Progress: ${haveRaw}/${need} ${artificialStart > 0 ? "(Bonus Started!)" : ""}
                    </p>
                    <div class="quest-progress-bar" style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; margin-top: 4px; overflow: hidden;">
                        <!-- Native CSS Transition handles the gradient fill linearly -->
                        <div class="quest-progress-fill" style="height: 100%; border-radius: 4px; width: ${pct}%; background: ${done ? "linear-gradient(90deg, #34d399, #22c55e)" : "linear-gradient(90deg, #60a5fa, #818cf8)"}; transition: width 0.3s ease;"></div>
                    </div>
                </div>
             `;
            })
            .join("");

          return `
            <div class="quest-log-item" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 12px; margin-bottom: 12px;">
              ${reqsHtml}
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                  <div class="quest-log-reward" style="font-size: 13px; color: var(--ui-gold);">🏆 ${o.reward ? o.reward.gold + " 🪙" : "Reward!"}</div>
                  <button class="quest-log-submit" data-order-id="${o.id}" style="padding: 4px 14px; border: 1px solid rgba(100, 200, 120, 0.4); border-radius: 8px; background: rgba(34, 197, 94, 0.12); color: #6ee7b7; cursor: pointer;">Submit</button>
              </div>
            </div>
           `;
        })
        .join("");
    }

    // Endowment Effect: Progress visually starts at 20% to reduce Activation Energy
    const itemsContainer = document.getElementById("quest-log-items");
    if (itemsContainer) {
      itemsContainer.innerHTML = content;
    }

    this.container.classList.toggle("active", this.isVisible);
    this.container.style.display = this.isVisible ? "block" : "none";

    // Hook up submit buttons
    const submits = this.container.querySelectorAll(".quest-log-submit");
    submits.forEach((btn) => {
      btn.addEventListener("click", () => {
        document.dispatchEvent(
          new CustomEvent("quest-submit", { detail: btn.dataset.orderId }),
        );
      });
    });

    // Generate button if under 3 orders
    if (orders.length < 3) {
      const genBtn = document.createElement("button");
      genBtn.className = "quest-log-gen-btn";
      genBtn.style.width = "100%";
      genBtn.style.padding = "8px";
      genBtn.style.marginTop = "8px";
      genBtn.style.background = "rgba(255, 255, 255, 0.05)";
      genBtn.style.border = "1px dashed rgba(255, 255, 255, 0.2)";
      genBtn.style.borderRadius = "8px";
      genBtn.style.cursor = "pointer";
      genBtn.style.color = "var(--text-muted)";
      genBtn.textContent = `🔄 ${orders.length === 0 ? "Get Orders" : "Get More Orders"}`;
      genBtn.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("quest-generate"));
      });
      const itemsContainer = document.getElementById("quest-log-items");
      if (itemsContainer) itemsContainer.appendChild(genBtn);
    }
  }

  toggle() {
    this.isVisible = !this.isVisible;
    this.render();
  }

  close() {
    if (this.isVisible) {
      this.isVisible = false;
      this.render();
    }
  }
}
