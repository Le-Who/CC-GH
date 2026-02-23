/**
 * GameStore Component
 * Implements: Framing, Decoy Effect, Real Scarcity Heuristic
 */
export class GameStore {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    // Real Scarcity: Set a strict timestamp 12 hours from now
    this.scarcityEndTime = Date.now() + 11 * 60 * 60 * 1000 + 59 * 60 * 1000;
    this.timerInterval = null;
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
            <div style="background: var(--bg-surface); padding: 24px; color: var(--text-primary);">
                <!-- Scarcity / FOMO Banner -->
                <h2 style="color: var(--brand-primary); display: flex; align-items: center; gap: 8px;">
                    🚨 Wandering Merchant 
                    <span style="font-size: 0.6em; color: var(--text-muted); border: 1px solid var(--text-muted); padding: 4px 8px; border-radius: 4px;">
                        Leaves in <span id="merchant-timer" style="color: var(--brand-accent);">11:59:59</span>
                    </span>
                </h2>
                
                <div class="store-container">
                    <!-- Base Tier -->
                    <div class="store-tier">
                        <h3>Farmer's Handful</h3>
                        <h2 style="color: var(--ui-gold);">100 🪙</h2>
                        <p style="color:var(--text-muted); visibility: hidden;">placeholder</p> <!-- layout fix -->
                        <button class="btn-buy">Buy - $0.99</button>
                    </div>

                    <!-- Decoy Tier (Makes Premium look phenomenally better) -->
                    <div class="store-tier">
                        <h3>Stash Builder</h3>
                        <h2 style="color: var(--ui-gold);">250 🪙</h2>
                        <p style="color:var(--text-primary);">+ 1 basic seed</p>
                        <button class="btn-buy">Buy - $2.49</button>
                    </div>

                    <!-- Premium Tier (Best Value via Contrast Effect & Endowment) -->
                    <div class="store-tier premium">
                        <div style="position:absolute; top: -10px; right: 10px; background: var(--ui-gold); color: black; font-size: 10px; padding: 2px 6px; border-radius: 8px; font-weight: bold;">BEST VALUE</div>
                        <h3 style="color: var(--brand-accent);">💎 Megacorp Harvest</h3>
                        <h2 style="color: var(--ui-gold);">300 🪙</h2>
                        <p style="color:var(--brand-accent); font-weight: bold;">+ 3 Rare Seeds <br>+ 2hr Energy Booster</p>
                        <button class="btn-claim">CLAIM - $2.99</button>
                    </div>
                </div>
            </div>
        `;

    this._startTimer();
  }

  _startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      const remaining = this.scarcityEndTime - Date.now();
      if (remaining > 0) {
        const h = Math.floor(
          (remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((remaining % (1000 * 60)) / 1000);

        const timerEl = document.getElementById("merchant-timer");
        if (timerEl) {
          // Zero padding formatting
          timerEl.innerText = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }
      } else {
        clearInterval(this.timerInterval);
        const timerEl = document.getElementById("merchant-timer");
        if (timerEl) timerEl.innerText = "DEPARTED";
        // Optionally disable buy buttons here for strict enforcement
      }
    }, 1000);
  }
}
