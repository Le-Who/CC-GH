/* ═══════════════════════════════════════════════════
 *  Game Hub — Match-3 Module (v6.1.0)
 *  Client-side engine, CSS transitions, state restore
 *  ─ GameStore integration (match3 slice)
 *  ─ Pause/Continue overlay, touch swipe, default mode
 *  ─ Star Drop fixes: no deadlocks, mode persistence
 *  ─ v4.5.1: session persistence, auto-classic, zero-move save
 *
 *  Engine logic (findMatches, resolveBoard, etc.) in ./match3/engine.js
 *  v5: Native ES Module (was IIFE)
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { HUB, api, showToast, sleep } from "./shared.js";
import { HUD } from "./hud.js";
import {
  GEM_TYPES,
  GEM_ICONS,
  BOARD_SIZE,
  DROP_TYPES,
  DROP_ICONS,
  DROP_LABELS,
  REWARD_BASE,
  calcGoldReward,
  cloneBoard,
  cloneDropStars,
  hydrateBoard,
  hydrateArray,
  hydrateSavedModes,
  randomGem,
  generateBoard,
  findMatches,
  hasValidMoves,
  resolveBoard,
} from "./match3/engine.js";

const Match3GameImpl = (() => {
  // ─── Engine imports (extracted to match3/engine.js) ───
  // We re-import inside the IIFE via module-scoped references set below.
  // This avoids breaking the IIFE encapsulation while using the shared engine.

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

  /** Persist savedModes to localStorage AND server (cross-device sync)
   *  v4.16: Server sync is debounced to 3s to reduce network traffic.
   *  localStorage is written immediately (synchronous, instant).
   */
  let _m3SyncDirty = false;
  let _m3SyncTimerId = null;
  const M3_SYNC_INTERVAL = 3000;

  /* ─── v5.2.0: Perlin Noise Screen Shake (organic, non-repeating) ─── */
  // Simplex-inspired hash for 1D noise
  function _hashNoise(x) {
    let n = Math.sin(x * 127.1 + x * 311.7) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1; // -1..+1
  }
  function _smoothNoise(t) {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    return _hashNoise(i) * (1 - u) + _hashNoise(i + 1) * u;
  }
  /**
   * Perlin-noise-driven screen shake.
   * @param {HTMLElement} el  — element to shake
   * @param {number} intensity — max px displacement
   * @param {number} durationMs — total shake time
   */
  function perlinShake(el, intensity, durationMs) {
    if (!el) return;
    const start = performance.now();
    const seed = Math.random() * 1000;
    function frame(now) {
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        el.style.transform = "";
        return;
      }
      const progress = elapsed / durationMs;
      const decay = 1 - progress; // linear decay
      const t = elapsed * 0.015; // noise frequency
      const x = _smoothNoise(seed + t) * intensity * decay;
      const y = _smoothNoise(seed + t + 100) * intensity * decay;
      const r = _smoothNoise(seed + t + 200) * intensity * 0.15 * decay;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function persistSavedModes() {
    try {
      localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
    } catch (_) {
      /* quota exceeded — ignore */
    }
    // v4.16: Mark dirty — server sync fires on 3s timer, not per-action
    _m3SyncDirty = true;
    _ensureM3SyncTimer();
  }

  function _ensureM3SyncTimer() {
    if (_m3SyncTimerId || !HUB.userId) return;
    _m3SyncTimerId = setInterval(() => {
      if (!_m3SyncDirty) return;
      _m3SyncDirty = false;
      api("/api/game/sync-modes", {
        userId: HUB.userId,
        savedModes,
      }).catch(() => {});
    }, M3_SYNC_INTERVAL);
  }

  /** v4.16: Flush pending sync immediately (keepalive for tab close) */
  function _flushM3Sync() {
    if (!_m3SyncDirty || !HUB.userId) return;
    _m3SyncDirty = false;
    const headers = { "Content-Type": "application/json" };
    if (HUB.accessToken) headers["Authorization"] = `Bearer ${HUB.accessToken}`;
    fetch("/api/game/sync-modes", {
      method: "POST",
      headers,
      body: JSON.stringify({ userId: HUB.userId, savedModes }),
      keepalive: true,
    }).catch(() => {});
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
    // Hydrate dropStars in case it came from Firestore (object instead of array)
    const raw = saved.dropStars ? cloneDropStars(saved.dropStars) : [];
    dropStars = hydrateArray(raw);
    starsDropped = saved.starsDropped || 0;
  }

  let timedTimer = null;
  let timedSecondsLeft = 0;
  let dropStars = []; // [{x, y, dropped: bool}] for drop mode
  let starsDropped = 0;
  const TIMED_DURATION = 90; // seconds
  const DROP_MOVE_LIMIT = 30;
  const DROP_STAR_COUNT = 3;

  // activeMode tracks UI-selected mode, survives pause/restart
  let activeMode = "classic";

  const $ = (id) => document.getElementById(id);

  /** Sync match3 state to GameStore */
  function syncToStore() {
    GameStore.setState("match3", {
      mode: gameMode,
      score,
      movesLeft,
      combo,
      highScore,
      gameActive,
    });
  }

  /** v4.15.1: Animated reshuffle when no valid moves remain.
   *  Diagonal wave of 3D card-flips — gem types change mid-flip. */
  function triggerReshuffle() {
    showToast("🔄 No moves! Reshuffling...");
    const $b = $("m3-board");
    if (!$b) return;
    const cells = $b.querySelectorAll(".m3-cell");

    // Phase 1: Assign flip with diagonal wave delay
    cells.forEach((cell) => {
      const y = parseInt(cell.dataset.y);
      const x = parseInt(cell.dataset.x);
      const delay = (x + y) * 0.04; // diagonal wave
      cell.style.animationDelay = `${delay}s`;
      cell.classList.add("reshuffling");
    });

    // Phase 2: Mid-flip (at ~250ms per cell) swap gem types
    setTimeout(() => {
      // Preserve drop tokens
      const dropPositions = [];
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (DROP_TYPES.includes(board[y][x])) {
            dropPositions.push({ y, x, type: board[y][x] });
          }
        }
      }

      // Generate new board
      let attempts = 0;
      do {
        board = generateBoard();
        // Restore drop tokens
        for (const d of dropPositions) {
          board[d.y][d.x] = d.type;
        }
        attempts++;
      } while (!hasValidMoves(board) && attempts < 10);

      // Update DOM in-place (still mid-flip, invisible)
      renderBoard(false);
    }, 250);

    // Phase 3: Cleanup after full flip completes
    setTimeout(() => {
      const cells2 = $b.querySelectorAll(".m3-cell");
      cells2.forEach((cell) => {
        cell.classList.remove("reshuffling");
        cell.style.animationDelay = "";
      });
      isAnimating = false;
      $b.classList.remove("disabled");
    }, 600);
  }

  /* ═══ Init & Restore ═══ */
  async function init() {
    // Register match3 slice
    GameStore.registerSlice("match3", { mode: null });
    // v4.5.3: "New Game" button always goes through mode selector
    $("m3-btn-start").onclick = () => showModeSelector();
    $("m3-btn-lb").onclick = toggleLeaderboard;

    // Game-over + leaderboard tab bindings (moved from shared.js for SRP)
    $("btn-m3-dismiss")?.addEventListener("click", () => {
      const ov = $("m3-overlay");
      if (ov) ov.classList.remove("show");
      showModeSelector();
    });
    $("btn-lb-tab-all")?.addEventListener("click", () => setLbTab("all"));
    $("btn-lb-tab-room")?.addEventListener("click", () => setLbTab("room"));

    fetchLeaderboard();
    updateStartButton();

    // v4.15.1: Pre-load localStorage savedModes as a safety net.
    // restoreGame() will merge server state on top, but if the server
    // returns empty (debounce race / cold start), localStorage survives.
    loadSavedModes();

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

    // v4.15.1: Flush savedModes on tab close (beats 2s debounce race)
    window.addEventListener("beforeunload", () => {
      // Snapshot active game into savedModes before flushing
      if (gameActive) {
        savedModes[gameMode] = {
          board: cloneBoard(board),
          score,
          movesLeft,
          combo,
          dropStars: cloneDropStars(dropStars),
          starsDropped,
          timedSecondsLeft,
        };
      }
      // Persist to localStorage as safety net
      try {
        localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
      } catch (_) {}
      _flushM3Sync();
    });

    // v5.1.0: Board tilt — micro-parallax via mousemove (rAF-gated, ±2.5°)
    const boardContainer = $("m3-board-container");
    if (boardContainer) {
      let _tiltRaf = 0;
      boardContainer.addEventListener("mousemove", (e) => {
        if (_tiltRaf) return;
        _tiltRaf = requestAnimationFrame(() => {
          _tiltRaf = 0;
          const rect = boardContainer.getBoundingClientRect();
          const cx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..+0.5
          const cy = (e.clientY - rect.top) / rect.height - 0.5;
          const maxDeg = 2.5;
          const rotY = (cx * maxDeg * 2).toFixed(2);
          const rotX = (-cy * maxDeg * 2).toFixed(2);
          const board = boardContainer.querySelector(".m3-board");
          if (board)
            board.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        });
      });
      boardContainer.addEventListener("mouseleave", () => {
        const board = boardContainer.querySelector(".m3-board");
        if (board) board.style.transform = "";
      });
    }
  }

  /* ═══ Energy Gate ═══ */
  function updateStartButton() {
    const btn = $("m3-btn-start");
    if (!btn) return;
    const hasEnergy = HUD.hasEnergy(5);
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
            if (endData?.resources) {
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
    if (!overlay.open) overlay.showModal();
  }

  function hideM3PauseOverlay() {
    gamePaused = false;
    const overlay = $("m3-pause-overlay");
    if (overlay && overlay.open) overlay.close();
    // Block swipe when playing
    if (gameActive) HUB.swipeBlocked = true;
  }

  async function restoreGame() {
    // v4.15.1: Keep a snapshot of localStorage modes loaded during init().
    // If the server returns empty/stale savedModes, localStorage fills the gaps.
    const localSnapshot = { ...savedModes };

    try {
      const data = await api("/api/game/state", {
        userId: HUB.userId,
        username: HUB.username,
      });
      if (!data) return;

      // v4.11.1: Restore ALL saved modes from server (cross-device sync)
      const serverSavedModes = hydrateSavedModes(data.savedModes || {});

      // v4.15.1: Merge — server wins per-mode, but localStorage fills gaps
      // (handles debounce race / Cloud Run cold start data loss)
      const mergedModes = { ...localSnapshot };
      for (const mode of Object.keys(serverSavedModes)) {
        mergedModes[mode] = serverSavedModes[mode];
      }

      if (data.game) {
        const restoredMode = data.game.mode || gameMode;
        board = hydrateBoard(data.game.board) || generateBoard();
        score = data.game.score || 0;
        movesLeft = data.game.movesLeft || 0;
        combo = data.game.combo || 0;
        highScore = data.highScore || 0;
        gameActive = movesLeft > 0;
        gameMode = restoredMode;

        if (gameActive) {
          savedModes = { ...mergedModes };
          savedModes[restoredMode] = {
            board: JSON.parse(JSON.stringify(board)),
            score,
            movesLeft,
            combo,
            dropStars: JSON.parse(JSON.stringify(dropStars)),
            starsDropped,
            timedSecondsLeft,
          };
          try {
            localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
          } catch (_) {}
          updateStatsUI();
          renderBoard(true);
          showToast("💎 Game restored!");
        } else {
          savedModes = { ...mergedModes };
          try {
            localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
          } catch (_) {}
          highScore = data.highScore || 0;
          $("m3-best").textContent = highScore;

          const lastMode = localStorage.getItem(LAST_MODE_KEY) || "classic";
          const lastSaved = savedModes[lastMode];
          if (lastSaved && lastSaved.board) {
            gameMode = lastMode;
            board = cloneBoard(lastSaved.board);
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
        savedModes = { ...mergedModes };
        try {
          localStorage.setItem(SAVED_MODES_KEY, JSON.stringify(savedModes));
        } catch (_) {}
        highScore = data.highScore || 0;
        $("m3-best").textContent = highScore;

        const lastMode = localStorage.getItem(LAST_MODE_KEY) || "classic";
        const lastSaved = savedModes[lastMode];
        if (lastSaved && lastSaved.board) {
          gameMode = lastMode;
          board = cloneBoard(lastSaved.board);
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
      // v4.15.1: On network failure, localStorage snapshot is already in savedModes
      // from init() loadSavedModes() call — no data lost.
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
      board = hydrateBoard(cloneBoard(s.board));
      score = s.score;
      movesLeft = s.movesLeft;
      combo = s.combo;
      restoreDropState(s);
      timedSecondsLeft = s.timedSecondsLeft || TIMED_DURATION;
      gameActive = true;

      hideGameOver();
      hideM3PauseOverlay();
      hideModeSelector();
      selected = null;
      isAnimating = false;

      // Resume timer if needed
      if (gameMode === "timed") {
        $("m3-moves-label").textContent = "Time";
        $("m3-moves").style.color = timedSecondsLeft <= 10 ? "#ef4444" : "";
        startTimedCountdown();
      } else {
        $("m3-moves-label").textContent = "Moves";
      }

      // v5.0.2: Register session on server (fire-and-forget, no energy charge).
      // Without this, /api/game/end returns 403 "Invalid session" because
      // the resume path previously skipped /api/game/start entirely.
      api("/api/game/start", {
        userId: HUB.userId,
        username: HUB.username,
        mode: gameMode,
        isResume: true,
      }).catch(() => {});

      persistSavedModes();
      updateStatsUI();
      renderBoard(true);
      syncToStore();
      updateStartButton();
      showToast(`🔄 Resumed ${mode} game`);
      return;
    }

    // Energy gatekeep — checked BEFORE any mode state mutation (v4.4 fix)
    if (!HUD.hasEnergy(5)) {
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
        board: cloneBoard(board),
        score,
        movesLeft,
        combo,
        dropStars: cloneDropStars(dropStars),
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

    hideGameOver();
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

    // v5.0.2: Force-set score DOM to prevent animateNumber visual carryover
    $("m3-score").textContent = "0";

    // Mode-specific init (drop stars placed AFTER server board)
    if (gameMode === "timed") {
      movesLeft = 9999; // Unlimited moves in timed mode
      timedSecondsLeft = TIMED_DURATION;
      $("m3-moves-label").textContent = "Time";
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
    if (data && data.resources) {
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
      board: cloneBoard(board),
      score,
      movesLeft,
      combo,
      dropStars: cloneDropStars(dropStars),
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
    if (!HUD.hasEnergy(5)) {
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
      overlay = document.createElement("dialog");
      overlay.id = "m3-confirm-overlay";
      overlay.className = "modal";
      overlay.innerHTML = `
        <div class="modal-card" style="max-width:320px;text-align:center">
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
    if (!overlay.open) overlay.showModal();

    $("m3-confirm-yes").onclick = () => {
      overlay.close();
      startGame(mode);
    };
    $("m3-confirm-no").onclick = () => {
      overlay.close();
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
      // v5.1.0: Assign staggered entrance index to mode cards
      sel.querySelectorAll(".m3-mode-card").forEach((card, i) => {
        card.style.setProperty("--i", i);
      });
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
      // v5.2.0: Danger vignette — red pulse on screen edges when ≤15s
      const layout = document.querySelector(".m3-layout");
      if (layout) {
        layout.classList.toggle(
          "danger-vignette",
          timedSecondsLeft <= 15 && timedSecondsLeft > 0,
        );
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
    // v5.2.0: Remove danger vignette when timer stops
    const layout = document.querySelector(".m3-layout");
    if (layout) layout.classList.remove("danger-vignette");
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
    if (endData?.resources) {
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

  /* ═══ Render Board (v4.16: DOM-cached diff-update — zero innerHTML rebuild) ═══ */
  let _m3Cells = []; // 2D cache: _m3Cells[y][x] = DOM element

  function renderBoard(animate) {
    const $b = $("m3-board");
    $b.classList.remove("disabled");

    // First render: create cells once and cache them + set up event delegation
    if (_m3Cells.length === 0) {
      $b.innerHTML = "";
      for (let y = 0; y < BOARD_SIZE; y++) {
        _m3Cells[y] = [];
        for (let x = 0; x < BOARD_SIZE; x++) {
          const cell = document.createElement("div");
          cell.className = "m3-cell";
          cell.dataset.x = x;
          cell.dataset.y = y;
          cell.innerHTML = `<span class="gem-icon"></span>`;
          $b.appendChild(cell);
          _m3Cells[y][x] = cell;
        }
      }
      // Event delegation: single click handler on board (replaces 64 per-cell listeners)
      $b.addEventListener("click", (e) => {
        const cell = e.target.closest(".m3-cell");
        if (!cell) return;
        const cx = parseInt(cell.dataset.x, 10);
        const cy = parseInt(cell.dataset.y, 10);
        if (!isNaN(cx) && !isNaN(cy)) onCellClick(cx, cy);
      });
    }

    // Diff-update: only change attributes/styles on existing cached nodes
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cell = _m3Cells[y][x];
        const type = board[y][x];
        const isDrop = DROP_TYPES.includes(type);

        // Build class list efficiently
        let cls = "m3-cell";
        if (isDrop) cls += ` drop-gem drop-${type.replace("drop_", "")}`;
        if (animate) cls += " entering";
        cell.className = cls;

        cell.dataset.type = type;
        const icon = isDrop ? DROP_ICONS[type] || "🌟" : GEM_ICONS[type] || "?";
        cell.firstElementChild.textContent = icon;
        // v4.16: Clear ALL residual inline styles from swap/cascade animations
        // (with innerHTML rebuild these died automatically; cached cells retain them)
        cell.style.transform = "";
        cell.style.transition = "";
        cell.style.zIndex = "";
        if (animate) {
          cell.style.animationDelay = `${(x + y) * 25}ms`;
        } else {
          cell.style.animationDelay = "";
        }
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

    // v5.0.2: Dataset-type guard — self-heal visual/logical desync
    const clickedCell = getCell(x, y);
    if (clickedCell && clickedCell.dataset.type !== board[y][x]) {
      renderBoard(false);
    }

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
      // Invalid swap — v5.2.0: Perlin noise shake (organic)
      // Target container, not board (board has tilt transform)
      perlinShake($("m3-board-container"), 3, 400);
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

      // v5.0.2: Apply board swap BEFORE clearing transforms.
      // This way, when the CSS translate is removed and cells snap to grid
      // positions, they already show the swapped gem identity — no visible
      // "snapback" of the moved gem.
      [board[fromY][fromX], board[toY][toX]] = [
        board[toY][toX],
        board[fromY][fromX],
      ];

      // Update cell content to match swapped board state
      const updateSwappedCell = (cell, x, y) => {
        const type = board[y][x];
        const isDrop = DROP_TYPES.includes(type);
        cell.dataset.type = type;
        cell.firstElementChild.textContent = isDrop
          ? DROP_ICONS[type] || "\u{1F31F}"
          : GEM_ICONS[type] || "?";
        let cls = "m3-cell";
        if (isDrop) cls += ` drop-gem drop-${type.replace("drop_", "")}`;
        cell.className = cls;
      };
      updateSwappedCell(cellA, fromX, fromY);
      updateSwappedCell(cellB, toX, toY);

      // v5.0.2: Suppress base CSS transition during transform cleanup.
      // Without this, the .m3-cell base `transition: transform 0.18s` causes
      // the secondary piece to visibly re-animate back to its grid position.
      $b.classList.add("batch-update");
      cellA.style.transform = "";
      cellA.style.transition = "";
      cellA.style.zIndex = "";
      cellB.style.transform = "";
      cellB.style.transition = "";
      void $b.offsetHeight; // force synchronous layout flush
      $b.classList.remove("batch-update");
    } else {
      // Fallback: no visual cells, just do the board swap
      [board[fromY][fromX], board[toY][toX]] = [
        board[toY][toX],
        board[fromY][fromX],
      ];
    }

    // 3. Resolve cascades client-side
    const result = resolveBoard(
      board,
      gameMode === "drop" ? () => checkStarDrops() : null,
    );
    score += result.totalPoints;
    // Don't decrement moves in timed mode (unlimited)
    if (gameMode !== "timed") movesLeft--;
    combo = result.combo;

    // Drop mode: check if stars reached bottom
    if (gameMode === "drop") checkStarDrops();

    // 4. Animate the cascade steps
    await animateCascade(result.steps);

    // v5.0.2: Post-cascade full sync — guarantees all 64 cells match board[][]
    renderBoard(false);

    // 5. Update UI + persist state (v4.5.1)
    updateStatsUI();
    syncToStore();
    // Persist current game state after every swap so progress survives reload
    savedModes[gameMode] = {
      board: cloneBoard(board),
      score,
      movesLeft,
      combo,
      dropStars: cloneDropStars(dropStars),
      starsDropped,
      timedSecondsLeft,
    };
    persistSavedModes();

    // v5.2.0: Perlin noise shake for big combos (organic, non-repeating)
    // Target container, not board (board has tilt transform)
    if (combo >= 3) {
      perlinShake($("m3-board-container"), 6, 500);
    }

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
      if (endData?.resources) {
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
      // v4.15.1: Check for deadlock after cascade — reshuffle if stuck
      if (!hasValidMoves(board)) {
        triggerReshuffle();
        return; // triggerReshuffle handles isAnimating and disabled cleanup
      }
    }

    isAnimating = false;
    $b.classList.remove("disabled");
  }

  /* ═══ Cascade Animation (v5.0.2: phased — highlight → pop → sync → fall) ═══ */
  let _prevCascadeChanged = []; // cells that had --drop-dist set in previous step

  async function animateCascade(steps) {
    _prevCascadeChanged = [];
    const BASE_HIGHLIGHT_DUR = 200;
    const BASE_POP_DUR = 220;
    const BASE_FALL_WAIT = 200;
    const SPEED_DECAY = 0.85; // each successive step is 15% faster
    let speedMul = 1;

    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];

      // ── Phase 0: Highlight matched gems (flash border/glow so player sees WHAT matched) ──
      for (const { x, y } of step.cleared) {
        _m3Cells[y]?.[x]?.classList.add("matched-highlight");
      }
      // v5.1.0: Hit-stop — micro-pause on big matches (≥5) for cinematic impact
      if (step.cleared.length >= 5) {
        await sleep(40);
      }
      await sleep(Math.round(BASE_HIGHLIGHT_DUR * speedMul));

      // ── Phase 1: Pop matched gems (scale → 0, white flash) ──
      for (const { x, y } of step.cleared) {
        const cell = _m3Cells[y]?.[x];
        if (!cell) continue;
        cell.classList.remove("matched-highlight");
        cell.classList.add("popping");
      }
      await sleep(Math.round(BASE_POP_DUR * speedMul));

      // v5.2.0: Color Splash — flash board background with dominant gem color
      if (step.cleared.length >= 3) {
        const firstCleared = step.cleared[0];
        const splashCell = _m3Cells[firstCleared.y]?.[firstCleared.x];
        if (splashCell) {
          const gemColor = getComputedStyle(splashCell)
            .getPropertyValue("--gem-color")
            .trim();
          if (gemColor) {
            const container = $("m3-board-container");
            if (container) {
              container.style.setProperty("--splash-color", gemColor);
              container.classList.add("color-splash");
              setTimeout(() => container.classList.remove("color-splash"), 600);
            }
          }
        }
      }

      // ── Phase 1.5: Explicit popping cleanup (prevent stale scale(0)/opacity(0)) ──
      for (const { x, y } of step.cleared) {
        const cell = _m3Cells[y]?.[x];
        if (!cell) continue;
        cell.classList.remove("popping");
        cell.style.transform = "";
        cell.style.opacity = "";
      }

      // ── Phase 2: Clean up previous step's fall properties ──
      for (const cell of _prevCascadeChanged) {
        cell.style.removeProperty("--drop-dist");
        cell.style.removeProperty("--fall-dur");
        cell.style.animationDelay = "";
      }
      _prevCascadeChanged = [];

      // ── Phase 2.5: Full board sync from STEP SNAPSHOT ──
      // v5.0.2: Read from step.boardSnapshot (frozen at this cascade step)
      // instead of global board[][] (which is already in its final state).
      // This prevents false highlights on subsequent cascade steps.
      const snap = step.boardSnapshot;
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const cell = _m3Cells[y][x];
          const type = snap[y][x];
          const isDrop = DROP_TYPES.includes(type);
          let cls = "m3-cell";
          if (isDrop) cls += ` drop-gem drop-${type.replace("drop_", "")}`;
          cell.className = cls;
          cell.dataset.type = type;
          const icon = isDrop
            ? DROP_ICONS[type] || "\u{1F31F}"
            : GEM_ICONS[type] || "?";
          cell.firstElementChild.textContent = icon;
          cell.style.transform = "";
          cell.style.transition = "";
          cell.style.zIndex = "";
          cell.style.animationDelay = "";
        }
      }

      // ── Phase 3: Fall animation with column-stagger ──
      // Pre-compute fall distances for changed cells
      const fallDistMap = new Map();
      for (const f of step.fallen) {
        fallDistMap.set(`${f.x},${f.toY}`, f.toY - f.fromY);
      }
      for (const f of step.filled) {
        fallDistMap.set(`${f.x},${f.y}`, f.y + 1);
      }

      // Build unique set of cells that need fall animation
      const fallingCells = new Map();
      for (const f of step.fallen)
        fallingCells.set(`${f.x},${f.toY}`, { x: f.x, y: f.toY });
      for (const f of step.filled)
        fallingCells.set(`${f.x},${f.y}`, { x: f.x, y: f.y });

      for (const [key, { x, y }] of fallingCells) {
        const cell = _m3Cells[y][x];
        cell.classList.add("falling");

        const dist = fallDistMap.get(key) || 1;
        cell.style.setProperty("--drop-dist", dist);
        // v5.1.0: Kinematic gravity — sqrt gives natural deceleration
        const dur = Math.min(0.18 + Math.sqrt(dist) * 0.12, 0.55);
        cell.style.setProperty("--fall-dur", `${dur.toFixed(2)}s`);
        // Column-stagger: offset by column for wave effect
        cell.style.animationDelay = `${x * 30}ms`;
        _prevCascadeChanged.push(cell);
      }
      await sleep(Math.round(BASE_FALL_WAIT * speedMul));

      // Adaptive speed: each successive step is faster
      speedMul *= SPEED_DECAY;
    }

    // Final cleanup after all steps complete
    for (const cell of _prevCascadeChanged) {
      cell.style.removeProperty("--drop-dist");
      cell.style.removeProperty("--fall-dur");
      cell.style.animationDelay = "";
      cell.classList.remove("falling");
    }
    _prevCascadeChanged = [];
  }

  /* ═══ UI Helpers ═══ */
  function getCell(x, y) {
    return _m3Cells[y]?.[x] || null;
  }

  function updateStatsUI() {
    animateNumber($("m3-score"), score);
    // v5.0.2: Dynamic label — "Time" for timed mode, "Moves" otherwise
    $("m3-moves-label").textContent = gameMode === "timed" ? "Time" : "Moves";
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

  // ── Float-points Object Pool (avoids GC pressure during cascades) ──
  const FLOAT_POOL_SIZE = 8;
  let floatPool = [];
  let floatPoolIdx = 0;

  function ensureFloatPool() {
    if (floatPool.length > 0) return;
    const container = $("m3-board-container");
    if (!container) return;
    for (let i = 0; i < FLOAT_POOL_SIZE; i++) {
      const el = document.createElement("div");
      el.className = "m3-float-points";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      container.appendChild(el);
      floatPool.push(el);
    }
  }

  function showFloatingPoints(x, y, pts) {
    ensureFloatPool();
    if (floatPool.length === 0) return;
    const cs =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--m3-cell",
        ),
      ) || 48;
    // Recycle from pool via ring buffer
    const el = floatPool[floatPoolIdx % FLOAT_POOL_SIZE];
    floatPoolIdx++;
    // Reset animation by removing and re-adding class
    el.classList.remove("m3-float-points");
    // Force reflow to restart animation (single read, minimal cost)
    void el.offsetWidth;
    el.classList.add("m3-float-points");
    el.textContent = `+${pts}`;
    // Scattered trajectory: random horizontal offset and rotation
    const dx = Math.round((Math.random() - 0.5) * 30); // -15..+15px
    const rot = Math.round((Math.random() - 0.5) * 20); // -10..+10deg
    el.style.setProperty("--float-dx", `${dx}px`);
    el.style.setProperty("--float-rot", `${rot}deg`);
    el.style.left = `${10 + x * (cs + 3) + cs / 2}px`;
    el.style.top = `${10 + y * (cs + 3)}px`;
    el.style.opacity = "";
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
    const ov = $("m3-overlay");
    if (ov && !ov.open) ov.showModal();
  }

  function hideGameOver() {
    const ov = $("m3-overlay");
    if (ov && ov.open) ov.close();
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

export { Match3GameImpl as Match3Game };
