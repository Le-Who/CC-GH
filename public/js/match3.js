/* ═══════════════════════════════════════════════════
 *  Game Hub — Match-3 Module (v4.12.3)
 *  Client-side engine, CSS transitions, state restore
 *  ─ GameStore integration (match3 slice)
 *  ─ Pause/Continue overlay, touch swipe, default mode
 *  ─ Star Drop fixes: no deadlocks, mode persistence
 *  ─ v4.5.1: session persistence, auto-classic, zero-move save
 *
 *  NOTE: calcGoldReward, findMatches, generateBoard, randomGem are
 *  intentionally duplicated from game-logic.js. The client needs its
 *  own copies for instant UI preview without server round-trips.
 *  The client findMatches uses Set<string> and excludes DROP_TYPES;
 *  the server version uses Array<{type, gems}> for different consumers.
 * ═══════════════════════════════════════════════════ */

const Match3Game = (() => {
  const GEM_TYPES = ["fire", "water", "earth", "air", "light", "dark"];
  const GEM_ICONS = {
    fire: "🔥",
    water: "💧",
    earth: "🌿",
    air: "💨",
    light: "⭐",
    dark: "🔮",
  };
  const BOARD_SIZE = 8;

  let board = [];
  let score = 0;
  let movesLeft = 30;
  let combo = 0;
  let selected = null;
  let isAnimating = false;
  let highScore = 0;
  let gameActive = false;
  let gamePaused = false;

  /* ─── Game Mode System ─── */
  let gameMode = "classic"; // "classic" | "timed" | "drop"
  let savedModes = {}; // { mode: { board, score, movesLeft, ... } }
  const SAVED_MODES_KEY = "m3_saved_modes";

  /** Persist savedModes to localStorage AND server (cross-device sync) */
  function persistSavedModes() {
    try {
      localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
    } catch (_) {
      /* quota exceeded — ignore */
    }
    // v4.11.1: sync to server for cross-device persistence
    if (HUB.userId) {
      api("/api/game/sync-modes", {
        userId: HUB.userId,
        savedModes,
      }).catch(() => {});
    }
  }
  /** Hydrate savedModes from localStorage */
  function loadSavedModes() {
    try {
      const raw = localStorage.getItem(SAVED_MODES_KEY);
      if (raw) savedModes = JSON.parse(raw);
    } catch (_) {
      savedModes = {};
    }
  }

  /** v4.12.1: Restore drop-mode state from a savedModes entry (DRY helper) */
  function restoreDropState(saved) {
    dropStars = saved.dropStars
      ? JSON.parse(JSON.stringify(saved.dropStars))
      : [];
    starsDropped = saved.starsDropped || 0;
  }

  let timedTimer = null;
  let timedSecondsLeft = 0;
  let dropStars = []; // [{x, y, dropped: bool}] for drop mode
  let starsDropped = 0;
  const TIMED_DURATION = 90; // seconds
  const DROP_MOVE_LIMIT = 30;
  const DROP_STAR_COUNT = 3;
  // v3.1: 3 unique reward drop types instead of single star
  const DROP_TYPES = ["drop_gold", "drop_seeds", "drop_energy"];
  const DROP_ICONS = { drop_gold: "💰", drop_seeds: "🌾", drop_energy: "⚡" };
  const DROP_LABELS = {
    drop_gold: "Gold Bag",
    drop_seeds: "Seed Pack",
    drop_energy: "Energy",
  };

  /* ─── Progressive gold reward (mirrors game-logic.js calcGoldReward) ─── */
  const REWARD_BASE = 40;
  const REWARD_LOSE = 5;
  function calcGoldReward(s) {
    if (typeof s !== "number" || s <= 0) return REWARD_LOSE;
    if (s < 1000)
      return Math.max(REWARD_LOSE, Math.floor(REWARD_BASE * (s / 1000)));
    let gold = REWARD_BASE;
    const tiers = [
      { min: 1000, max: 1999, r: 0.05 },
      { min: 2000, max: 2999, r: 0.1 },
      { min: 3000, max: 3999, r: 0.2 },
    ];
    for (const t of tiers) {
      if (s < t.min) break;
      gold += Math.floor(
        Math.floor((Math.min(s, t.max + 1) - t.min) / 100) * t.r * REWARD_BASE,
      );
    }
    if (s >= 4000) {
      let ts = 4000,
        rate = 0.4;
      while (ts <= s) {
        gold += Math.floor(
          Math.floor((Math.min(s, ts + 1000) - ts) / 100) * rate * REWARD_BASE,
        );
        ts += 1000;
        rate = Math.min(rate * 2, 2.0);
      }
    }
    return gold;
  }

  const $ = (id) => document.getElementById(id);

  /** Sync match3 state to GameStore */
  function syncToStore() {
    if (typeof GameStore !== "undefined") {
      GameStore.setState("match3", {
        board,
        score,
        movesLeft,
        combo,
        highScore,
        gameActive,
        gameMode,
      });
    }
  }

  /* ═══ Client-Side Match-3 Engine ═══ */
  function randomGem() {
    return GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
  }

  function generateBoard() {
    const b = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      b[y] = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        let gem;
        do {
          gem = randomGem();
        } while (
          (x >= 2 && b[y][x - 1] === gem && b[y][x - 2] === gem) ||
          (y >= 2 && b[y - 1]?.[x] === gem && b[y - 2]?.[x] === gem)
        );
        b[y][x] = gem;
      }
    }
    return b;
  }

  function findMatches(b) {
    // Optimized: Use Uint8Array visited map instead of Set<string> for performance
    const matched = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    let count = 0;

    // Horizontal
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE - 2; x++) {
        const type = b[y][x];
        // Skip star-type gems (they don't match)
        if (!type || DROP_TYPES.includes(type)) continue;

        if (type === b[y][x + 1] && type === b[y][x + 2]) {
          let end = x + 3;
          while (end < BOARD_SIZE && b[y][end] === type) end++;
          for (let k = x; k < end; k++) {
            const idx = y * BOARD_SIZE + k;
            if (matched[idx] === 0) {
              matched[idx] = 1;
              count++;
            }
          }
          x = end - 1;
        }
      }
    }
    // Vertical
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE - 2; y++) {
        const type = b[y][x];
        if (!type || DROP_TYPES.includes(type)) continue;

        if (type === b[y + 1][x] && type === b[y + 2][x]) {
          let end = y + 3;
          while (end < BOARD_SIZE && b[end][x] === type) end++;
          for (let k = y; k < end; k++) {
            const idx = k * BOARD_SIZE + x;
            if (matched[idx] === 0) {
              matched[idx] = 1;
              count++;
            }
          }
          y = end - 1;
        }
      }
    }

    const result = [];
    if (count > 0) {
      const len = BOARD_SIZE * BOARD_SIZE;
      for (let i = 0; i < len; i++) {
        if (matched[i]) result.push(i);
      }
    }
    return result;
  }

  /** Check if board has any valid moves (prevents deadlocks) */
  function hasValidMoves(b) {
    // Clone board validation is expensive but necessary for Star Drop
    // Try every horizontal swap
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE - 1; x++) {
        // Swap (x,y) with (x+1,y)
        [b[y][x], b[y][x + 1]] = [b[y][x + 1], b[y][x]];
        const hasMatch = findMatches(b).length > 0;
        // Swap back
        [b[y][x], b[y][x + 1]] = [b[y][x + 1], b[y][x]];
        if (hasMatch) return true;
      }
    }
    // Try every vertical swap
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE - 1; y++) {
        // Swap (x,y) with (x,y+1)
        [b[y + 1][x], b[y][x]] = [b[y][x], b[y + 1][x]];
        const hasMatch = findMatches(b).length > 0;
        // Swap back
        [b[y + 1][x], b[y][x]] = [b[y][x], b[y + 1][x]];
        if (hasMatch) return true;
      }
    }
    return false;
  }

  /** Run a full cascade: match → clear → gravity → fill → repeat.
   *  Returns { steps, totalPoints, combo } for animation.
   *  Drop tokens (star drop mode) survive gravity and never get replaced. */
  function resolveBoard(b) {
    const steps = [];
    let totalPoints = 0;
    let cascadeCombo = 0;
    let matches = findMatches(b);

    while (matches.length > 0) {
      cascadeCombo++;
      const cleared = matches.map((idx) => {
        const x = idx % BOARD_SIZE;
        const y = Math.floor(idx / BOARD_SIZE);
        return { x, y, type: b[y][x] };
      });
      totalPoints += cleared.length * 10 * Math.min(cascadeCombo, 5);

      // Clear matched cells (but NEVER clear drop tokens)
      for (const { x, y } of cleared) {
        if (!DROP_TYPES.includes(b[y][x])) b[y][x] = null;
      }

      // Gravity + fill (drop tokens fall with gravity but are never replaced)
      const fallen = [];
      const filled = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        let wy = BOARD_SIZE - 1;
        for (let y = BOARD_SIZE - 1; y >= 0; y--) {
          if (b[y][x]) {
            if (wy !== y) {
              b[wy][x] = b[y][x];
              b[y][x] = null;
              fallen.push({ x, fromY: y, toY: wy });
            }
            wy--;
          }
        }
        for (let y = wy; y >= 0; y--) {
          b[y][x] = randomGem();
          filled.push({ x, y, type: b[y][x] });
        }
      }

      steps.push({ cleared, fallen, filled, combo: cascadeCombo });

      // Check star drops after each cascade step
      if (gameMode === "drop") checkStarDrops();

      matches = findMatches(b);
    }

    return { steps, totalPoints, combo: cascadeCombo };
  }

  /* ═══ Init & Restore ═══ */
  async function init() {
    // Register match3 slice
    if (typeof GameStore !== "undefined") {
      GameStore.registerSlice("match3", {
        board,
        score,
        movesLeft,
        combo,
        highScore,
        gameActive,
      });
    }
    // v4.5.3: "New Game" button always goes through mode selector
    $("m3-btn-start").onclick = () => showModeSelector();
    $("m3-btn-lb").onclick = toggleLeaderboard;

    fetchLeaderboard();
    updateStartButton();

    // v4.9.1: Don't pre-load localStorage savedModes — restoreGame() will
    // set savedModes authoritatively from server state to prevent cross-device desync

    // v4.5.3: Eagerly create mode selector so it always exists for hideModeSelector()
    showModeSelector();

    // Try to restore an existing game from the server
    await restoreGame();
    syncToStore();

    // If no active game was restored:
    if (!gameActive) {
      const hasSaved = Object.keys(savedModes).length > 0;
      if (hasSaved) {
        // v4.5.1: saved sessions exist — show Resume/End overlay
        board = generateBoard();
        renderBoard(true);
        showM3PauseOverlay();
      } else {
        // v4.5.1: no saved sessions — auto-start classic
        await startGame("classic");
      }
    }
  }

  /* ═══ Energy Gate ═══ */
  function updateStartButton() {
    const btn = $("m3-btn-start");
    if (!btn) return;
    const hasEnergy = typeof HUD !== "undefined" ? HUD.hasEnergy(5) : true;
    btn.disabled = !hasEnergy && !gameActive;
    if (!hasEnergy && !gameActive) {
      btn.title = "Need 5⚡ to play";
    } else {
      btn.title = "";
    }
  }

  function onEnter() {
    /* v4.5.3: properly handle all states on screen re-entry */
    if (gameActive) {
      // Game in progress — show pause overlay with Resume/End
      showM3PauseOverlay();
    } else {
      const hasSaved = Object.keys(savedModes).length > 0;
      if (hasSaved) {
        // Saved sessions — show Continue/New/End overlay
        showM3PauseOverlay();
      } else {
        // No game, no saved sessions — show mode selector directly
        showModeSelector();
      }
    }
  }

  /* ── Pause / Resume overlay (mirror of Blox pattern) ── */
  /* v4.5.3: Button hierarchy — Continue (primary) > New Game (secondary) > End (muted)
   * Continue is always the most prominent action when a session can be resumed.
   * Handlers are reset each call to prevent leaking onclick from prior states. */
  function showM3PauseOverlay() {
    gamePaused = true;
    HUB.swipeBlocked = false; // allow screen swiping when paused

    let overlay = $("m3-pause-overlay");
    if (!overlay) return;

    const btnResume = $("m3-pause-resume");
    const btnNew = $("m3-pause-new");
    const btnEnd = $("m3-pause-end");
    const title = $("m3-pause-title");
    const actionsContainer = btnResume?.parentElement;

    // Reset all handlers to prevent leaks from prior overlay state
    if (btnResume) btnResume.onclick = null;
    if (btnNew) btnNew.onclick = null;
    if (btnEnd) btnEnd.onclick = null;

    const hasSaved = Object.keys(savedModes).length > 0;

    if (gameActive) {
      // Game in progress — Continue (primary), End (secondary)
      if (title) title.textContent = "⏸ Paused";
      if (btnResume) {
        btnResume.style.display = "";
        btnResume.className = "btn btn-primary";
        btnResume.textContent = "▶ Continue";
        btnResume.onclick = () => hideM3PauseOverlay();
      }
      if (btnNew) btnNew.style.display = "none";
      if (btnEnd) {
        btnEnd.style.display = "";
        btnEnd.className = "btn btn-danger";
        btnEnd.textContent = "🛑 End Game";
        btnEnd.onclick = async () => {
          hideM3PauseOverlay();
          if (gameActive) {
            gameActive = false;
            stopTimedCountdown();
            highScore = Math.max(highScore, score);
            const endData = await api("/api/game/end", {
              userId: HUB.userId,
              score,
              mode: gameMode,
            }).catch(() => null);
            if (endData?.highScore) highScore = endData.highScore;
            if (endData?.resources && typeof HUD !== "undefined") {
              HUD.syncFromServer(endData.resources);
              if (endData.goldReward) HUD.animateGoldChange(endData.goldReward);
            }
            showGameOver(score);
            fetchLeaderboard();
            syncToStore();
            updateStartButton();
          }
        };
      }
      // v4.5.3: DOM order — Continue first, End second
      if (actionsContainer && btnResume && btnEnd) {
        actionsContainer.insertBefore(btnResume, actionsContainer.firstChild);
      }
    } else if (hasSaved) {
      // Saved sessions — Continue (primary, prominent), New Game (secondary), End All (muted)
      const lastMode =
        localStorage.getItem(LAST_MODE_KEY) || Object.keys(savedModes)[0];
      const modeLabel =
        lastMode === "timed"
          ? "Time Attack"
          : lastMode === "drop"
            ? "Star Drop"
            : "Classic";
      if (title) title.textContent = `💎 Continue ${modeLabel}?`;
      if (btnResume) {
        btnResume.style.display = "";
        btnResume.className = "btn btn-primary";
        btnResume.textContent = `▶ Continue`;
        btnResume.onclick = () => {
          hideM3PauseOverlay();
          startGame(lastMode);
        };
      }
      if (btnNew) {
        btnNew.style.display = "";
        btnNew.className = "btn btn-secondary";
        btnNew.textContent = "🎮 New Game";
        btnNew.onclick = () => {
          hideM3PauseOverlay();
          showModeSelector();
        };
      }
      if (btnEnd) {
        btnEnd.style.display = "";
        btnEnd.className = "btn btn-muted";
        btnEnd.textContent = "🛑 End All Sessions";
        btnEnd.onclick = () => {
          savedModes = {};
          persistSavedModes();
          hideM3PauseOverlay();
          showModeSelector();
        };
      }
      // v4.5.3: DOM order — Continue first (most prominent), New Game second, End last
      if (actionsContainer && btnResume) {
        actionsContainer.insertBefore(btnResume, actionsContainer.firstChild);
        if (btnNew) actionsContainer.insertBefore(btnNew, btnEnd);
      }
    } else {
      // No saved sessions — show New Game only
      if (title) title.textContent = "💎 Gem Crush";
      if (btnNew) {
        btnNew.style.display = "";
        btnNew.className = "btn btn-primary";
        btnNew.textContent = "🎮 New Game";
        btnNew.onclick = () => {
          hideM3PauseOverlay();
          showModeSelector();
        };
      }
      if (btnResume) btnResume.style.display = "none";
      if (btnEnd) btnEnd.style.display = "none";
    }
    overlay.classList.add("show");
  }

  function hideM3PauseOverlay() {
    gamePaused = false;
    const overlay = $("m3-pause-overlay");
    if (overlay) overlay.classList.remove("show");
    // Block swipe when playing
    if (gameActive) HUB.swipeBlocked = true;
  }

  async function restoreGame() {
    try {
      const data = await api("/api/game/state", {
        userId: HUB.userId,
        username: HUB.username,
      });
      if (!data) return;

      // v4.11.1: Restore ALL saved modes from server (cross-device sync)
      const serverSavedModes = data.savedModes || {};

      if (data.game) {
        const restoredMode = data.game.mode || gameMode;
        board = data.game.board;
        score = data.game.score || 0;
        movesLeft = data.game.movesLeft || 0;
        combo = data.game.combo || 0;
        highScore = data.highScore || 0;
        gameActive = movesLeft > 0;
        gameMode = restoredMode;

        if (gameActive) {
          // Merge server savedModes + override the active mode from currentGame
          savedModes = { ...serverSavedModes };
          savedModes[restoredMode] = {
            board: JSON.parse(JSON.stringify(board)),
            score,
            movesLeft,
            combo,
            dropStars: JSON.parse(JSON.stringify(dropStars)),
            starsDropped,
            timedSecondsLeft,
          };
          // Only persist to localStorage (not back to server — avoid loop)
          try {
            localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
          } catch (_) {}
          updateStatsUI();
          renderBoard(true);
          showToast("💎 Game restored!");
        } else {
          // No active game — use server savedModes if present
          savedModes = { ...serverSavedModes };
          try {
            localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
          } catch (_) {}
          highScore = data.highScore || 0;
          $("m3-best").textContent = highScore;

          // v4.12.1: Hydrate last-mode board from savedModes (fix Star Drop state loss)
          const lastMode = localStorage.getItem(LAST_MODE_KEY) || "classic";
          const lastSaved = savedModes[lastMode];
          if (lastSaved && lastSaved.board) {
            gameMode = lastMode;
            board = JSON.parse(JSON.stringify(lastSaved.board));
            score = lastSaved.score || 0;
            movesLeft = lastSaved.movesLeft || 0;
            combo = lastSaved.combo || 0;
            timedSecondsLeft = lastSaved.timedSecondsLeft || TIMED_DURATION;
            restoreDropState(lastSaved);
          } else {
            board = generateBoard();
          }
          renderBoard(true);
        }
      } else {
        // No game on server — use server savedModes if any
        savedModes = { ...serverSavedModes };
        try {
          localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
        } catch (_) {}
        highScore = data.highScore || 0;
        $("m3-best").textContent = highScore;

        // v4.12.1: Hydrate last-mode board from savedModes (fix Star Drop state loss)
        const lastMode = localStorage.getItem(LAST_MODE_KEY) || "classic";
        const lastSaved = savedModes[lastMode];
        if (lastSaved && lastSaved.board) {
          gameMode = lastMode;
          board = JSON.parse(JSON.stringify(lastSaved.board));
          score = lastSaved.score || 0;
          movesLeft = lastSaved.movesLeft || 0;
          combo = lastSaved.combo || 0;
          timedSecondsLeft = lastSaved.timedSecondsLeft || TIMED_DURATION;
          restoreDropState(lastSaved);
        } else {
          board = generateBoard();
        }
        renderBoard(true);
      }
    } catch (e) {
      console.warn("Match-3 restore failed:", e);
    }
  }

  /* ═══ Start Game ═══ */
  const LAST_MODE_KEY = "m3_last_mode";
  async function startGame(mode) {
    // If no mode passed, use last mode or default to classic
    if (!mode) {
      const lastMode = localStorage.getItem(LAST_MODE_KEY);
      mode = lastMode || "classic";
    }

    // Check if we have a saved state for this mode — resume it (no energy cost)
    if (savedModes[mode]) {
      // Save current mode FIRST (if active) before restoring the target mode
      if (gameActive && gameMode !== mode) {
        savedModes[gameMode] = {
          board: JSON.parse(JSON.stringify(board)),
          score,
          movesLeft,
          combo,
          dropStars: JSON.parse(JSON.stringify(dropStars)),
          starsDropped,
          timedSecondsLeft,
        };
      }
      stopTimedCountdown();
      localStorage.setItem(LAST_MODE_KEY, mode);
      gameMode = mode;

      const s = savedModes[mode];
      board = JSON.parse(JSON.stringify(s.board));
      score = s.score;
      movesLeft = s.movesLeft;
      combo = s.combo;
      restoreDropState(s);
      timedSecondsLeft = s.timedSecondsLeft || TIMED_DURATION;
      gameActive = true;

      $("m3-overlay").classList.remove("show");
      hideM3PauseOverlay();
      hideModeSelector();
      selected = null;
      isAnimating = false;

      // Resume timer if needed
      if (gameMode === "timed") {
        $("m3-moves").style.color = timedSecondsLeft <= 10 ? "#ef4444" : "";
        startTimedCountdown();
      } else {
        $("m3-moves-label").textContent = "Moves";
      }

      persistSavedModes();
      updateStatsUI();
      renderBoard(true);
      syncToStore();
      updateStartButton();
      showToast(`🔄 Resumed ${mode} game`);
      return;
    }

    // Energy gatekeep — checked BEFORE any mode state mutation (v4.4 fix)
    if (typeof HUD !== "undefined" && !HUD.hasEnergy(5)) {
      if (HUD.showEnergyModal) {
        HUD.showEnergyModal(5, () => startGame(mode));
      } else {
        showToast("⚡ Need 5 energy to play Match-3!");
      }
      // v4.5: return to mode selector so user isn't trapped
      showModeSelector();
      return;
    }

    // Energy OK → save current mode state before switching
    if (gameActive && gameMode !== mode) {
      savedModes[gameMode] = {
        board: JSON.parse(JSON.stringify(board)),
        score,
        movesLeft,
        combo,
        dropStars: JSON.parse(JSON.stringify(dropStars)),
        starsDropped,
        timedSecondsLeft,
      };
      persistSavedModes();
    }

    // Stop any existing timers (timer bleed fix)
    stopTimedCountdown();

    // Save chosen mode
    localStorage.setItem(LAST_MODE_KEY, mode);
    gameMode = mode;

    $("m3-overlay").classList.remove("show");
    hideM3PauseOverlay();
    hideModeSelector();
    selected = null;
    isAnimating = false;
    gamePaused = false;

    // Generate board client-side
    board = generateBoard();
    score = 0;
    combo = 0;
    gameActive = true;
    starsDropped = 0;
    dropStars = [];

    // Mode-specific init (drop stars placed AFTER server board)
    if (gameMode === "timed") {
      movesLeft = 9999; // Unlimited moves in timed mode
      timedSecondsLeft = TIMED_DURATION;
      $("m3-moves-label").textContent = "";
      $("m3-moves").textContent = `${TIMED_DURATION}s`;
      $("m3-moves").style.color = "";
      startTimedCountdown();
    } else if (gameMode === "drop") {
      movesLeft = DROP_MOVE_LIMIT;
      // placeDropStars() will be called AFTER server board is applied
    } else {
      movesLeft = 30;
      $("m3-moves-label").textContent = "Moves";
    }

    // Notify server of new game (deducts energy)
    const data = await api("/api/game/start", {
      userId: HUB.userId,
      username: HUB.username,
      mode: gameMode,
    });

    // Handle energy error
    if (data && data.error === "NOT_ENOUGH_ENERGY") {
      showToast("⚡ Not enough energy!");
      gameActive = false;
      stopTimedCountdown();
      return;
    }

    if (data && data.highScore !== undefined) highScore = data.highScore;

    // 7.2: Increment total games counter (for recommended badge)
    const prevGames = parseInt(
      localStorage.getItem("hub_m3_total_games") || "0",
      10,
    );
    localStorage.setItem("hub_m3_total_games", String(prevGames + 1));

    // Sync resources from server response
    if (data && data.resources && typeof HUD !== "undefined") {
      HUD.syncFromServer(data.resources);
    }

    // Use server board if available (ensures consistency)
    if (data && data.game && data.game.board) {
      board = data.game.board;
      score = data.game.score || 0;
      if (gameMode === "classic") {
        movesLeft = data.game.movesLeft || 30;
      }
    }

    // Place drop stars AFTER server board is applied (critical fix!)
    // AND ensure board is solvable (deadlock fix)
    if (gameMode === "drop") {
      let attempts = 0;
      do {
        // If retrying, regenerate base board first
        if (attempts > 0) board = generateBoard();
        placeDropStars();
        attempts++;
      } while (!hasValidMoves(board) && attempts < 10);

      if (attempts >= 10) {
        console.warn("Could not generate valid drop board in 10 attempts");
        // Fallback: simple board, minimal stars
        board = generateBoard();
        placeDropStars();
      }
    }

    // v4.5.1: stash new game into savedModes immediately so it survives reload
    savedModes[mode] = {
      board: JSON.parse(JSON.stringify(board)),
      score,
      movesLeft,
      combo,
      dropStars: JSON.parse(JSON.stringify(dropStars)),
      starsDropped,
      timedSecondsLeft,
    };
    persistSavedModes();

    updateStatsUI();
    renderBoard(true);
    syncToStore();
    updateStartButton();
  }

  /* ─── Helper: get currently selected mode from mode bar ─── */
  function getSelectedMode() {
    const sel = $("m3-mode-selector");
    const active = sel?.querySelector(".m3-mode-card.active");
    return (
      active?.dataset.mode || localStorage.getItem(LAST_MODE_KEY) || "classic"
    );
  }

  /* ─── Energy confirmation before starting a new game (v4.8) ─── */
  function confirmAndStart(mode) {
    if (!mode) mode = getSelectedMode();

    // If there's a saved session → resume for free (no energy cost)
    if (savedModes[mode]) {
      startGame(mode);
      return;
    }

    // Energy gatekeep — show not-enough modal if insufficient
    if (typeof HUD !== "undefined" && !HUD.hasEnergy(5)) {
      if (HUD.showEnergyModal) {
        HUD.showEnergyModal(5, () => startGame(mode));
      } else {
        showToast("⚡ Need 5 energy to play!");
      }
      return;
    }

    // Enough energy → show inline confirmation overlay
    const modeLabel =
      mode === "timed"
        ? "Time Attack"
        : mode === "drop"
          ? "Star Drop"
          : "Classic";
    let overlay = $("m3-confirm-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "m3-confirm-overlay";
      overlay.className = "overlay";
      overlay.innerHTML = `
        <div class="overlay-card" style="max-width:320px;text-align:center">
          <h3 id="m3-confirm-title" style="margin:0 0 12px"></h3>
          <p id="m3-confirm-desc" style="font-size:0.9rem;color:var(--text-dim);margin-bottom:20px"></p>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn btn-primary" id="m3-confirm-yes">✅ Play</button>
            <button class="btn btn-secondary" id="m3-confirm-no">❌ Cancel</button>
          </div>
        </div>
      `;
      const m3Main =
        $("m3-board-container")?.closest(".m3-main") ||
        $("m3-board-container")?.parentElement;
      if (m3Main) m3Main.appendChild(overlay);
    }
    $("m3-confirm-title").textContent = `⚡ ${modeLabel}`;
    $("m3-confirm-desc").textContent = `Spend 5 energy to play ${modeLabel}?`;
    overlay.classList.add("show");

    $("m3-confirm-yes").onclick = () => {
      overlay.classList.remove("show");
      startGame(mode);
    };
    $("m3-confirm-no").onclick = () => {
      overlay.classList.remove("show");
    };
  }

  /* ─── Mode Selector UI ─── */
  function showModeSelector() {
    // v4.6: Dismiss any active overlays so mode selector is visible
    hideGameOver();
    hideM3PauseOverlay();
    // Ensure clean state — no stale game blocking input
    gameActive = false;
    gamePaused = false;
    HUB.swipeBlocked = false;

    let sel = $("m3-mode-selector");
    if (!sel) {
      sel = document.createElement("div");
      sel.id = "m3-mode-selector";
      sel.className = "m3-mode-selector show";
      sel.innerHTML = `
        <div class="m3-mode-title">Choose Mode</div>
        <div class="m3-mode-cards">
          <button class="m3-mode-card" data-mode="classic">
            <span class="m3-mode-icon">💎</span>
            <span class="m3-mode-name">Classic</span>
            <span class="m3-mode-desc">30 moves to score big</span>
            ${parseInt(localStorage.getItem("hub_m3_total_games") || "0", 10) < 3 ? '<span class="m3-recommended">⭐ Recommended</span>' : ""}
          </button>
          <button class="m3-mode-card" data-mode="timed">
            <span class="m3-mode-icon">⏱️</span>
            <span class="m3-mode-name">Time Attack</span>
            <span class="m3-mode-desc">90 seconds · 1.5× gold</span>
          </button>
          <button class="m3-mode-card" data-mode="drop">
            <span class="m3-mode-icon">🎯</span>
            <span class="m3-mode-name">Star Drop</span>
            <span class="m3-mode-desc">Drop tokens to bottom for loot</span>
          </button>
        </div>
      `;
      sel.addEventListener("click", (e) => {
        const card = e.target.closest(".m3-mode-card");
        if (!card) return;
        const newMode = card.dataset.mode;

        // v4.8: Update active highlight immediately
        sel
          .querySelectorAll(".m3-mode-card")
          .forEach((c) =>
            c.classList.toggle("active", c.dataset.mode === newMode),
          );

        // v4.9: Always route through energy confirmation for mode switches
        // This ensures energy consent is respected when switching modes mid-game
        if (gameActive && newMode !== gameMode && score > 0) {
          const label =
            card.querySelector(".m3-mode-name")?.textContent || newMode;
          if (typeof showToast === "function")
            showToast(`🔄 Switching to ${label}…`);
          confirmAndStart(newMode);
          return;
        }

        // v4.8: Route through energy confirmation for new games
        // (same mode restart or already-active game with no score)
        confirmAndStart(newMode);
      });
      // Insert inline inside m3-main, before the board
      const main = $("m3-board-container")?.closest(".m3-main");
      const boardC = $("m3-board-container");
      if (main && boardC) {
        main.insertBefore(sel, boardC);
      } else if (boardC) {
        boardC.parentElement.insertBefore(sel, boardC);
      }
    } else {
      sel.classList.add("show");
    }
    // Remove playing state, then highlight last-played mode (v4.8)
    sel.classList.remove("playing");
    const lastMode = localStorage.getItem(LAST_MODE_KEY) || "classic";
    sel
      .querySelectorAll(".m3-mode-card")
      .forEach((c) =>
        c.classList.toggle("active", c.dataset.mode === lastMode),
      );

    // v4.12.1: Show saved-session badges on mode cards (Solution #6)
    updateModeBadges(sel);
  }

  /** v4.12.1: Update mode cards with saved-session info */
  function updateModeBadges(sel) {
    if (!sel) sel = $("m3-mode-selector");
    if (!sel) return;
    const defaultDescs = {
      classic: "30 moves to score big",
      timed: "90 seconds · 1.5× gold",
      drop: "Drop tokens to bottom for loot",
    };
    sel.querySelectorAll(".m3-mode-card").forEach((card) => {
      const mode = card.dataset.mode;
      const desc = card.querySelector(".m3-mode-desc");
      if (!desc) return;
      const saved = savedModes[mode];
      if (saved && saved.movesLeft > 0 && saved.board) {
        const pts = saved.score || 0;
        if (mode === "timed") {
          const sec = saved.timedSecondsLeft || 0;
          desc.textContent = `▶ ${pts}pts · ${sec}s left`;
        } else {
          desc.textContent = `▶ ${pts}pts · ${saved.movesLeft} moves`;
        }
        card.classList.add("has-save");
      } else {
        desc.textContent = defaultDescs[mode] || "";
        card.classList.remove("has-save");
      }
    });
  }
  function hideModeSelector() {
    const sel = $("m3-mode-selector");
    if (!sel) return;
    // Don't hide — keep visible but mark as playing with active mode
    sel.classList.add("playing");
    sel.querySelectorAll(".m3-mode-card").forEach((c) => {
      c.classList.toggle("active", c.dataset.mode === gameMode);
    });
    // Re-enable mode switching during play (clickable but dimmed)
    sel.querySelectorAll(".m3-mode-card:not(.active)").forEach((c) => {
      c.style.pointerEvents = "auto";
    });
  }

  /* ─── Timed Mode Countdown ─── */
  function startTimedCountdown() {
    stopTimedCountdown();
    timedTimer = setInterval(() => {
      timedSecondsLeft--;
      $("m3-moves").textContent = `${timedSecondsLeft}s`;
      if (timedSecondsLeft <= 10) {
        $("m3-moves").style.color = "#ef4444";
      }
      if (timedSecondsLeft <= 0) {
        stopTimedCountdown();
        endTimedGame();
      }
    }, 1000);
  }
  function stopTimedCountdown() {
    if (timedTimer) clearInterval(timedTimer);
    timedTimer = null;
  }
  async function endTimedGame() {
    if (!gameActive) return;
    gameActive = false;
    // Timed mode: 1.5x score for reward calculation
    const adjustedScore = Math.floor(score * 1.5);
    highScore = Math.max(highScore, score);

    const endData = await api("/api/game/end", {
      userId: HUB.userId,
      score: adjustedScore,
      mode: "timed",
    }).catch(() => null);
    if (endData?.highScore) highScore = endData.highScore;
    if (endData?.resources && typeof HUD !== "undefined") {
      HUD.syncFromServer(endData.resources);
      if (endData.goldReward) HUD.animateGoldChange(endData.goldReward);
    }
    // Clear saved state for this mode on game over
    delete savedModes["timed"];
    persistSavedModes();

    setTimeout(() => showGameOver(score), 500);
    fetchLeaderboard();
    syncToStore();
    updateStartButton();
  }

  /* ─── Drop Mode: Star Objects ─── */
  function placeDropStars() {
    dropStars = [];
    starsDropped = 0;
    // Place 3 unique reward objects in top 2 rows at random columns
    const usedCols = new Set();
    for (let i = 0; i < DROP_STAR_COUNT; i++) {
      let col;
      do {
        col = Math.floor(Math.random() * BOARD_SIZE);
      } while (usedCols.has(col));
      usedCols.add(col);
      const row = Math.floor(Math.random() * 2); // row 0 or 1
      const dropType = DROP_TYPES[i];
      board[row][col] = dropType;
      dropStars.push({ x: col, y: row, dropped: false, type: dropType });
    }
  }

  function checkStarDrops() {
    // Reward objects "drop" when they reach the bottom row (row 7)
    for (const star of dropStars) {
      if (star.dropped) continue;
      // Find the drop item on the board
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board[y][x] === star.type) {
            star.x = x;
            star.y = y;
          }
        }
      }
      if (star.y === BOARD_SIZE - 1) {
        // Reached bottom — mark as dropped
        star.dropped = true;
        starsDropped++;
        board[star.y][star.x] = randomGem(); // Replace with regular gem
        const icon = DROP_ICONS[star.type] || "🌟";
        const label = DROP_LABELS[star.type] || "Reward";
        showToast(
          `${icon} ${label} dropped! (${starsDropped}/${DROP_STAR_COUNT})`,
        );
      }
    }
  }

  function calcDropReward() {
    // Returns a reward object describing what the player earned
    const rewards = { gold: 0, seeds: null, energy: 0 };
    for (const star of dropStars) {
      if (!star.dropped) continue;
      if (star.type === "drop_gold") rewards.gold += 40; // Enough for another game
      if (star.type === "drop_seeds") rewards.seeds = getRandomSeedPack(); // ≤60🪙 worth
      if (star.type === "drop_energy") rewards.energy += 7;
    }
    // Bonus for all 3 collected
    if (starsDropped >= DROP_STAR_COUNT) rewards.gold += 20;
    return rewards;
  }

  function getRandomSeedPack() {
    // Pick a random seed type that costs ≤60 gold
    // Return { cropId, quantity } for server to award
    const affordable =
      Object.entries(GEM_ICONS).length > 0
        ? ["carrot", "tomato", "corn", "wheat"] // fallbacks
        : ["carrot"];
    const cropId = affordable[Math.floor(Math.random() * affordable.length)];
    return { cropId, quantity: 3 };
  }

  /* ═══ Render Board (persistent DOM elements) ═══ */
  function renderBoard(animate) {
    const $b = $("m3-board");
    $b.innerHTML = "";
    $b.classList.remove("disabled");

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const type = board[y][x];
        const cell = document.createElement("div");
        cell.className = "m3-cell";
        const isDrop = DROP_TYPES.includes(type);
        if (isDrop)
          cell.classList.add("drop-gem", `drop-${type.replace("drop_", "")}`);
        if (animate) cell.classList.add("entering");
        cell.dataset.type = type;
        cell.dataset.x = x;
        cell.dataset.y = y;
        const icon = isDrop ? DROP_ICONS[type] || "🌟" : GEM_ICONS[type] || "?";
        cell.innerHTML = `<span class="gem-icon">${icon}</span>`;
        if (animate) cell.style.animationDelay = `${(x + y) * 25}ms`;
        cell.addEventListener("click", () => onCellClick(x, y));
        $b.appendChild(cell);
      }
    }

    // Bind pointer swipe on board (once)
    initBoardPointerSwipe();
  }

  /* ─── Pointer Swipe (unified touch + mouse drag for gem swapping) ─── */
  let _swipeBound = false;
  function initBoardPointerSwipe() {
    const $b = $("m3-board");
    if (!$b || _swipeBound) return;
    _swipeBound = true;

    let startX = 0,
      startY = 0;
    let startCellX = -1,
      startCellY = -1;
    let swiping = false;

    $b.addEventListener("pointerdown", (e) => {
      // v4.8: Auto-start game on piece interaction when mode is pre-selected
      if (!gameActive && !isAnimating && !gamePaused) {
        confirmAndStart(getSelectedMode());
        return;
      }
      if (isAnimating || !gameActive || gamePaused) return;
      const cell = e.target.closest(".m3-cell");
      if (!cell) return;

      startX = e.clientX;
      startY = e.clientY;
      startCellX = parseInt(cell.dataset.x);
      startCellY = parseInt(cell.dataset.y);
      swiping = true;

      // Block screen swipe while interacting with board
      HUB.swipeBlocked = true;
      e.preventDefault();
    });

    $b.addEventListener("pointerup", (e) => {
      if (!swiping || startCellX < 0) {
        swiping = false;
        return;
      }
      swiping = false;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const THRESHOLD = 20; // px

      // Restore screen swipe
      setTimeout(() => {
        if (!gameActive) HUB.swipeBlocked = false;
      }, 100);

      // If movement is too small, treat as click (handled by click listener)
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;

      // Determine dominant direction
      let toX = startCellX,
        toY = startCellY;
      if (Math.abs(dx) >= Math.abs(dy)) {
        toX += dx > 0 ? 1 : -1; // horizontal
      } else {
        toY += dy > 0 ? 1 : -1; // vertical
      }

      // Bounds check
      if (toX < 0 || toX >= BOARD_SIZE || toY < 0 || toY >= BOARD_SIZE) return;

      // Clear any click-selection and attempt swap
      if (selected) {
        getCell(selected.x, selected.y)?.classList.remove("selected");
        selected = null;
      }
      attemptSwap(startCellX, startCellY, toX, toY);
      startCellX = -1;
    });

    // Prevent default to avoid text selection during swipe
    $b.addEventListener("pointermove", (e) => {
      if (swiping) e.preventDefault();
    });

    // Cancel swipe if pointer leaves board
    $b.addEventListener("pointerleave", () => {
      swiping = false;
      startCellX = -1;
    });
  }

  /* ═══ Cell Click ═══ */
  function onCellClick(x, y) {
    // v4.8: Auto-start game on piece interaction when mode is pre-selected
    if (!gameActive && !isAnimating && !gamePaused) {
      confirmAndStart(getSelectedMode());
      return;
    }
    if (isAnimating || !gameActive || gamePaused) return;
    if (!selected) {
      selected = { x, y };
      getCell(x, y)?.classList.add("selected");
      return;
    }
    if (selected.x === x && selected.y === y) {
      getCell(x, y)?.classList.remove("selected");
      selected = null;
      return;
    }
    const dx = Math.abs(selected.x - x),
      dy = Math.abs(selected.y - y);
    if (dx + dy === 1) {
      attemptSwap(selected.x, selected.y, x, y);
    } else {
      getCell(selected.x, selected.y)?.classList.remove("selected");
      selected = { x, y };
      getCell(x, y)?.classList.add("selected");
    }
  }

  /* ═══ Swap — Client-Side with Smooth Animations ═══ */
  async function attemptSwap(fromX, fromY, toX, toY) {
    isAnimating = true;
    const $b = $("m3-board");
    $b.classList.add("disabled");
    getCell(fromX, fromY)?.classList.remove("selected");
    selected = null;

    // 1. Client-side: try swap
    const testBoard = board.map((r) => [...r]);
    [testBoard[fromY][fromX], testBoard[toY][toX]] = [
      testBoard[toY][toX],
      testBoard[fromY][fromX],
    ];

    const matches = findMatches(testBoard);
    if (matches.length === 0) {
      // Invalid swap — shake
      $b.classList.add("shake");
      setTimeout(() => $b.classList.remove("shake"), 400);
      isAnimating = false;
      $b.classList.remove("disabled");
      return;
    }

    // 1.5 Visual swap slide animation — cells glide into each other's positions
    const cellA = getCell(fromX, fromY);
    const cellB = getCell(toX, toY);
    const cellSize = cellA?.offsetWidth || 48;
    const dx = (toX - fromX) * cellSize;
    const dy = (toY - fromY) * cellSize;

    if (cellA && cellB) {
      cellA.style.transition = "transform 0.18s ease";
      cellB.style.transition = "transform 0.18s ease";
      cellA.style.transform = `translate(${dx}px, ${dy}px)`;
      cellB.style.transform = `translate(${-dx}px, ${-dy}px)`;
      cellA.style.zIndex = "2";
      await sleep(200);
    }

    // 2. Apply swap to real board
    [board[fromY][fromX], board[toY][toX]] = [
      board[toY][toX],
      board[fromY][fromX],
    ];

    // 3. Resolve cascades client-side
    const result = resolveBoard(board);
    score += result.totalPoints;
    // Don't decrement moves in timed mode (unlimited)
    if (gameMode !== "timed") movesLeft--;
    combo = result.combo;

    // Drop mode: check if stars reached bottom
    if (gameMode === "drop") checkStarDrops();

    // 4. Animate the cascade steps
    await animateCascade(result.steps);

    // 5. Update UI + persist state (v4.5.1)
    updateStatsUI();
    syncToStore();
    // Persist current game state after every swap so progress survives reload
    savedModes[gameMode] = {
      board: JSON.parse(JSON.stringify(board)),
      score,
      movesLeft,
      combo,
      dropStars: JSON.parse(JSON.stringify(dropStars)),
      starsDropped,
      timedSecondsLeft,
    };
    persistSavedModes();

    if (combo > 1) showComboBanner(combo);
    if (result.totalPoints > 0)
      showFloatingPoints(toX, toY, result.totalPoints);

    // 6. Check game over (mode-specific)
    const isGameOver = gameMode === "timed" ? false : movesLeft <= 0;
    const isDropComplete =
      gameMode === "drop" && starsDropped >= DROP_STAR_COUNT;

    if (isGameOver || isDropComplete) {
      highScore = Math.max(highScore, score);
      gameActive = false;
      stopTimedCountdown();

      // v4.7: Do NOT send /api/game/move here — it races with /api/game/end
      // and causes 400 "no active game" errors. The server computes rewards
      // from the final score, so the last move doesn't need server validation.

      // Calculate end score/rewards based on mode
      let endScore = score;
      if (gameMode === "drop") {
        // Drop mode: structured rewards, not score-based gold
        const dropRewards = calcDropReward();
        endScore = dropRewards.gold + dropRewards.energy * 5; // normalized for leaderboard
        // Show reward breakdown
        const parts = [];
        if (dropRewards.gold > 0) parts.push(`💰 ${dropRewards.gold}🪙`);
        if (dropRewards.energy > 0) parts.push(`⚡ +${dropRewards.energy}`);
        if (dropRewards.seeds)
          parts.push(`🌾 ${dropRewards.seeds.quantity}× seeds`);
        showToast(`🎁 Rewards: ${parts.join(" · ")}`);
      }

      const endData = await api("/api/game/end", {
        userId: HUB.userId,
        score: endScore,
        mode: gameMode,
      }).catch(() => null);
      if (endData?.highScore) highScore = endData.highScore;
      if (endData?.resources && typeof HUD !== "undefined") {
        HUD.syncFromServer(endData.resources);
        if (endData.goldReward) HUD.animateGoldChange(endData.goldReward);
      }
      // Clear saved state for this mode
      delete savedModes[gameMode];
      persistSavedModes();

      setTimeout(() => showGameOver(score), 500);
      fetchLeaderboard();
      syncToStore();
      updateStartButton();
    } else {
      // Send move to server in background (fire-and-forget for validation)
      api("/api/game/move", {
        userId: HUB.userId,
        fromX,
        fromY,
        toX,
        toY,
      }).catch(() => {});
    }

    isAnimating = false;
    $b.classList.remove("disabled");
  }

  /* ═══ Cascade Animation (smooth CSS transitions) ═══ */
  async function animateCascade(steps) {
    for (const step of steps) {
      // Phase 1: Pop matched gems (with brightness flash)
      for (const { x, y } of step.cleared) {
        getCell(x, y)?.classList.add("popping");
      }
      await sleep(300); // Longer pop phase for satisfying clear feel

      // Phase 2: Update cells with new types + staggered falling animation
      const $b = $("m3-board");
      $b.innerHTML = "";
      const changedSet = new Set();
      for (const { x, y } of step.cleared) changedSet.add(`${x},${y}`);
      for (const f of step.fallen) changedSet.add(`${f.x},${f.toY}`);
      for (const f of step.filled) changedSet.add(`${f.x},${f.y}`);

      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const type = board[y][x];
          const cell = document.createElement("div");
          cell.className = "m3-cell";
          const isDrop = DROP_TYPES.includes(type);
          if (isDrop)
            cell.classList.add("drop-gem", `drop-${type.replace("drop_", "")}`);
          cell.dataset.type = type;
          cell.dataset.x = x;
          cell.dataset.y = y;
          const icon = isDrop
            ? DROP_ICONS[type] || "🌟"
            : GEM_ICONS[type] || "?";
          cell.innerHTML = `<span class="gem-icon">${icon}</span>`;
          if (changedSet.has(`${x},${y}`)) {
            cell.classList.add("falling");
            // Column-based stagger: each column starts slightly later for cascade effect
            cell.style.animationDelay = `${x * 25 + y * 15}ms`;
          }
          cell.addEventListener("click", () => onCellClick(x, y));
          $b.appendChild(cell);
        }
      }
      await sleep(260); // Longer settle phase for bounce to complete
    }
  }

  /* ═══ UI Helpers ═══ */
  function getCell(x, y) {
    return $("m3-board").querySelector(
      `.m3-cell[data-x="${x}"][data-y="${y}"]`,
    );
  }

  function updateStatsUI() {
    animateNumber($("m3-score"), score);
    // Mode-specific moves/timer display
    if (gameMode === "timed") {
      $("m3-moves").textContent = `${timedSecondsLeft}s`;
      $("m3-moves").style.color = timedSecondsLeft <= 10 ? "#ef4444" : "";
    } else {
      $("m3-moves").textContent = movesLeft === 9999 ? "∞" : movesLeft;
      $("m3-moves").style.color =
        movesLeft <= 5 && gameMode !== "timed" ? "#ef4444" : "";
    }
    const $c = $("m3-combo");
    $c.textContent = combo > 0 ? `${combo}×` : "—";
    if (combo > 1) {
      $c.classList.add("m3-combo-flash");
      setTimeout(() => $c.classList.remove("m3-combo-flash"), 400);
    }
    $("m3-best").textContent = highScore;
    // Live gold reward preview (mode-aware)
    const $g = $("m3-gold");
    if ($g) {
      let reward;
      if (!gameActive) {
        reward = 0;
      } else if (gameMode === "drop") {
        const dr = calcDropReward();
        // Build compact preview: gold + energy
        const parts = [];
        if (dr.gold > 0) parts.push(`${dr.gold}g`);
        if (dr.energy > 0) parts.push(`${dr.energy}⚡`);
        if (dr.seeds) parts.push(`🌾`);
        $g.textContent = gameActive
          ? parts.length
            ? `+${parts.join("+")}`
            : "+0"
          : "—";
        $g.style.color = dr.gold > 0 ? "#fbbf24" : "";
        reward = null; // skip generic display below
      } else if (gameMode === "timed") {
        reward = calcGoldReward(Math.floor(score * 1.5));
      } else {
        reward = calcGoldReward(score);
      }
      if (reward !== null) {
        $g.textContent = gameActive ? `+${reward}` : "—";
        $g.style.color = reward > REWARD_BASE ? "#fbbf24" : "";
      }
    }
  }

  function animateNumber(el, target) {
    const cur = parseInt(el.textContent) || 0;
    if (cur === target) {
      el.textContent = target;
      return;
    }
    const diff = target - cur,
      steps = Math.min(Math.abs(diff), 20),
      step = diff / steps;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (i >= steps) {
        el.textContent = target;
        clearInterval(iv);
      } else el.textContent = Math.round(cur + step * i);
    }, 25);
  }

  function showFloatingPoints(x, y, pts) {
    const container = $("m3-board-container");
    const cs =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--m3-cell",
        ),
      ) || 48;
    const el = document.createElement("div");
    el.className = "m3-float-points";
    el.textContent = `+${pts}`;
    el.style.left = `${10 + x * (cs + 3) + cs / 2}px`;
    el.style.top = `${10 + y * (cs + 3)}px`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  function showComboBanner(c) {
    const labels = [
      "",
      "",
      "Double! ✨",
      "Triple! 🔥",
      "Mega! 💥",
      "ULTRA! ⚡",
    ];
    const $cb = $("m3-combo-banner");
    $cb.textContent = labels[Math.min(c, 5)] || `${c}× Combo! 🌟`;
    $cb.classList.add("show");
    setTimeout(() => $cb.classList.remove("show"), 1200);
  }

  function showGameOver(finalScore) {
    $("m3-final-score").textContent = finalScore;
    $("m3-final-best").textContent = highScore;
    // v4.8: Show "New Record!" congrats when player beats their high score
    const isNewRecord = finalScore >= highScore && finalScore > 0;
    const recordEl = $("m3-new-record");
    if (recordEl) recordEl.style.display = isNewRecord ? "block" : "none";
    $("m3-overlay").classList.add("show");
  }

  function hideGameOver() {
    const ov = $("m3-overlay");
    if (ov) ov.classList.remove("show");
  }

  /* ═══ Leaderboard (v4.12.2: always-visible on desktop, toggle on mobile) ═══ */
  function toggleLeaderboard() {
    const panel = $("m3-lb-panel");
    if (!panel) return;
    panel.classList.toggle("show-mobile");
    if (panel.classList.contains("show-mobile")) fetchLeaderboard();
  }

  async function fetchLeaderboard(scope) {
    const url =
      scope === "room"
        ? "/api/leaderboard?scope=room&roomId=demo"
        : "/api/leaderboard";
    const data = await api(url);
    renderLeaderboard(data);
  }

  function renderLeaderboard(entries) {
    const tbody = $("m3-lb-body");
    if (!entries || entries.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="m3-lb-empty">No scores yet — play to be first! 🏆</td></tr>';
      return;
    }
    tbody.innerHTML = entries
      .map((e, i) => {
        const cls =
          i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return `<tr>
        <td class="m3-lb-rank ${cls}">#${e.rank}</td>
        <td>${e.username}</td>
        <td class="m3-lb-score">${e.highScore}</td>
      </tr>`;
      })
      .join("");
  }

  function setLbTab(scope) {
    document
      .querySelectorAll(".m3-lb-tab")
      .forEach((t) => t.classList.remove("active"));
    const activeTab =
      scope === "room"
        ? document.getElementById("btn-lb-tab-room")
        : document.getElementById("btn-lb-tab-all");
    if (activeTab) activeTab.classList.add("active");
    fetchLeaderboard(scope);
  }

  return {
    init,
    onEnter,
    startGame,
    confirmAndStart,
    showModeSelector,
    toggleLeaderboard,
    setLbTab,
  };
})();
