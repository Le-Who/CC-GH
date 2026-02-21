/* ═══════════════════════════════════════════════════
 *  Game Hub — Building Blox Module (v5.0.0)
 *  10×10 Block Puzzle: place pieces, clear lines
 *  ─ localStorage persistence, pause overlay, touch drag,
 *    grab-point anchor ghost, mouse drag-and-drop,
 *    swipe blocking
 *  v5: Native ES Module (was IIFE)
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { HUB, api, showToast, sleep } from "./shared.js";
import { HUD } from "./hud.js";

import { GRID, PIECE_COUNT, PIECES } from "./blox/pieces.js";

const BloxGameImpl = (() => {
  const STORAGE_KEY = "blox_state";

  // ── State ──
  let board = [];
  let tray = [];
  let score = 0;
  let linesCleared = 0;
  let highScore = 0;
  let gameActive = false;
  let gamePaused = false;
  let selectedPiece = -1;

  // v4.15.1: Object-pooled floating score points
  const BLOX_FLOAT_POOL_SIZE = 5;
  let bloxFloatPool = [];
  let bloxFloatPoolIdx = 0;

  // Drag state (touch)
  let dragPieceIdx = -1;
  let dragPreviewEl = null;
  let dragPreviewCellSize = 28; // default, updated dynamically

  // v4.16: Cached board geometry during drag (eliminates per-frame getBoundingClientRect)
  let _cachedBoardRect = null;

  // v4.16: Debounced server sync (3s throttle instead of per-placement HTTP)
  let _syncDirty = false;
  let _syncTimerId = null;
  const SYNC_INTERVAL_MS = 3000;

  // v4.16: Reusable Uint8Array for clearLines (zero-allocation)
  const _clearMap = new Uint8Array(GRID * GRID);

  const $ = (id) => document.getElementById(id);

  // ── Leaderboard (v4.9) ──
  let bloxLbScope = "global";
  async function fetchBloxLeaderboard(scope) {
    scope = scope || bloxLbScope;
    const qs =
      scope === "room" && HUB.roomId ? `?scope=room&roomId=${HUB.roomId}` : "";
    try {
      const data = await api(`/api/blox/leaderboard${qs}`);
      if (Array.isArray(data)) renderBloxLeaderboard(data);
    } catch (_) {}
  }
  function renderBloxLeaderboard(entries) {
    const body = $("blox-lb-body");
    if (!body) return;
    if (!entries.length) {
      body.innerHTML =
        '<tr><td colspan="3" class="blox-lb-empty">No scores yet</td></tr>';
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    body.innerHTML = entries
      .map((e) => {
        const isMe = e.username === HUB.username;
        const rank = e.rank <= 3 ? medals[e.rank - 1] : e.rank;
        return `<tr class="${isMe ? "blox-lb-me" : ""}">
        <td class="blox-lb-rank">${rank}</td>
        <td class="blox-lb-name">${e.username || "???"}</td>
        <td class="blox-lb-score">${e.highScore.toLocaleString()}</td>
      </tr>`;
      })
      .join("");
  }
  function setBloxLbTab(scope) {
    bloxLbScope = scope;
    $("blox-lb-tab-all")?.classList.toggle("active", scope === "global");
    $("blox-lb-tab-room")?.classList.toggle("active", scope === "room");
    fetchBloxLeaderboard(scope);
  }

  // ── Click-to-attach state (v4.9) ──
  let attachedPieceIdx = -1;
  let attachMoveHandler = null;

  // ── Board helpers ──
  function createEmptyBoard() {
    return Array.from({ length: GRID }, () => Array(GRID).fill(null));
  }

  function randomPiece() {
    return PIECES[Math.floor(Math.random() * PIECES.length)];
  }

  function refillTray() {
    tray = [];
    for (let i = 0; i < PIECE_COUNT; i++) {
      tray.push({ piece: randomPiece(), placed: false });
    }
    selectedPiece = -1;
  }

  function canPlace(piece, row, col) {
    for (const [dr, dc] of piece.cells) {
      const r = row + dr,
        c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (board[r][c] !== null) return false;
    }
    return true;
  }

  function placePiece(piece, row, col) {
    for (const [dr, dc] of piece.cells) {
      board[row + dr][col + dc] = piece.color;
    }
  }

  // ── Grab-point anchor: nearest real cell to geometric center ──
  // Returns the cell [dr, dc] from the piece that's closest to its
  // geometric center. This ensures the anchor is always an actual
  // cell, preventing the ghost from "wobbling" between grid positions.
  function getCenterOffset(piece) {
    const rows = piece.cells.map((c) => c[0]);
    const cols = piece.cells.map((c) => c[1]);
    const avgR = rows.reduce((a, b) => a + b, 0) / rows.length;
    const avgC = cols.reduce((a, b) => a + b, 0) / cols.length;
    // Snap to nearest actual cell in the piece
    let bestCell = piece.cells[0];
    let bestDist = Infinity;
    for (const [r, c] of piece.cells) {
      const d = (r - avgR) ** 2 + (c - avgC) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestCell = [r, c];
      }
    }
    return { dr: bestCell[0], dc: bestCell[1] };
  }

  // ── Line clearing ──
  // v4.7: Board cells are cleared SYNCHRONOUSLY so canAnyPieceFit()
  // checks the correct state. Only the visual re-render is delayed
  // for the .clearing CSS animation.
  // v4.16: Uint8Array visited map instead of Set<string> (zero GC pressure)
  function clearLines() {
    let cleared = 0;
    const rowsToClear = [];
    const colsToClear = [];

    for (let r = 0; r < GRID; r++) {
      if (board[r].every((c) => c !== null)) rowsToClear.push(r);
    }
    for (let c = 0; c < GRID; c++) {
      let full = true;
      for (let r = 0; r < GRID; r++) {
        if (board[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) colsToClear.push(c);
    }

    // v4.16: Use reusable Uint8Array instead of Set<string> — no allocations
    _clearMap.fill(0);
    let cellCount = 0;
    for (const r of rowsToClear) {
      for (let c = 0; c < GRID; c++) {
        const idx = r * GRID + c;
        if (_clearMap[idx] === 0) {
          _clearMap[idx] = 1;
          cellCount++;
        }
      }
    }
    for (const c of colsToClear) {
      for (let r = 0; r < GRID; r++) {
        const idx = r * GRID + c;
        if (_clearMap[idx] === 0) {
          _clearMap[idx] = 1;
          cellCount++;
        }
      }
    }

    cleared = rowsToClear.length + colsToClear.length;

    if (cleared > 0) {
      // 1. Start CSS animation + clear board state via cached DOM refs
      // v5.0.1: Stagger animation delay so only 2–3 cells are GPU-promoted at once
      let staggerIdx = 0;
      for (let i = 0; i < GRID * GRID; i++) {
        if (_clearMap[i] === 0) continue;
        const r = (i / GRID) | 0;
        const c = i % GRID;
        if (_boardCells[r]?.[c]) {
          const cell = _boardCells[r][c];
          cell.style.animationDelay = `${staggerIdx * 20}ms`;
          cell.classList.add("clearing");
          cell.classList.remove("filled");
          cell.style.background = "";
          staggerIdx++;
        }
        // 2. Clear board state IMMEDIATELY (sync) so game-over check is correct
        board[r][c] = null;
      }

      // 3. Re-render board AFTER animation completes (visual only)
      setTimeout(() => renderBoard(), 300);

      const bonus = cleared > 1 ? cleared * 5 : 0;
      const pts = cleared * 10 + bonus;
      score += pts;
      linesCleared += cleared;

      // Juicy UI: hit-stop freeze for multi-line clears (cinematic micro-feedback)
      if (cleared >= 2) {
        const gridEl2 = $("blox-board");
        if (gridEl2) {
          gridEl2.classList.add("shake-heavy");
          setTimeout(() => gridEl2.classList.remove("shake-heavy"), 500);
        }
      }

      const msg =
        cleared > 1
          ? `✨ ${cleared} lines! +${pts} pts`
          : `📏 Line clear! +${pts} pts`;
      showToast(msg);
      // v4.15.1: Floating score points over the board
      showBloxFloat(pts);
    }

    return cleared;
  }

  // v4.15.1: Float pool — ported from Match-3
  function initBloxFloatPool() {
    if (bloxFloatPool.length > 0) return;
    const container = $("blox-board");
    if (!container) return;
    for (let i = 0; i < BLOX_FLOAT_POOL_SIZE; i++) {
      const el = document.createElement("div");
      el.className = "blox-float-points";
      el.style.display = "none";
      el.style.position = "absolute";
      container.parentElement.appendChild(el);
      bloxFloatPool.push(el);
    }
  }

  function showBloxFloat(pts) {
    if (bloxFloatPool.length === 0) return;
    const container = $("blox-board");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const parentRect = container.parentElement.getBoundingClientRect();
    // Center of board relative to parent
    const cx = rect.left - parentRect.left + rect.width / 2;
    const cy = rect.top - parentRect.top + rect.height / 2;

    const el = bloxFloatPool[bloxFloatPoolIdx % BLOX_FLOAT_POOL_SIZE];
    bloxFloatPoolIdx++;

    el.classList.remove("blox-float-points");
    void el.offsetWidth; // force reflow to re-trigger animation
    el.textContent = `+${pts}`;
    el.style.display = "";
    el.style.left = `${cx - 20}px`;
    el.style.top = `${cy - 10}px`;
    const dx = Math.round(Math.random() * 30 - 15);
    const rot = Math.round(Math.random() * 12 - 6);
    el.style.setProperty("--float-dx", `${dx}px`);
    el.style.setProperty("--float-rot", `${rot}deg`);
    el.classList.add("blox-float-points");
    setTimeout(() => {
      el.style.display = "none";
    }, 1000);
  }

  // ── Game-over check ──
  function canAnyPieceFit() {
    for (const t of tray) {
      if (t.placed) continue;
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (canPlace(t.piece, r, c)) return true;
        }
      }
    }
    return false;
  }

  // ── Persistence (v4.16: debounced server sync — 3s throttle) ──
  function _buildSavePayload() {
    return {
      board,
      tray: tray.map((t) => ({
        pieceId: t.piece.id,
        placed: t.placed,
      })),
      score,
      linesCleared,
      highScore,
      gameActive,
    };
  }

  function saveState() {
    try {
      const state = _buildSavePayload();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // v4.16: Mark dirty — server sync happens on 3s timer, not per-placement
      _syncDirty = true;
      _ensureSyncTimer();
    } catch (_) {
      /* quota exceeded - silent */
    }
  }

  /** v4.16: Start 3s debounce timer for server sync (if not already running) */
  function _ensureSyncTimer() {
    if (_syncTimerId) return;
    _syncTimerId = setInterval(() => {
      if (!_syncDirty) return;
      _syncDirty = false;
      const payload = _buildSavePayload();
      api("/api/blox/sync", {
        userId: HUB.userId,
        savedState: payload,
      }).catch(() => {});
    }, SYNC_INTERVAL_MS);
  }

  /** v4.16: Flush pending sync immediately (used on beforeunload/game-over) */
  function _flushSync() {
    if (!_syncDirty) return;
    _syncDirty = false;
    const payload = _buildSavePayload();
    const headers = { "Content-Type": "application/json" };
    if (HUB.accessToken) headers["Authorization"] = `Bearer ${HUB.accessToken}`;
    // keepalive guarantees delivery even after tab close
    fetch("/api/blox/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ userId: HUB.userId, savedState: payload }),
      keepalive: true,
    }).catch(() => {});
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!state || !state.board || !state.tray) return null;
      // Firestore converts arrays to objects — convert back
      const hydratedBoard = Array.isArray(state.board)
        ? state.board
        : Object.keys(state.board)
            .sort((a, c) => Number(a) - Number(c))
            .map((k) => {
              const row = state.board[k];
              return Array.isArray(row) ? row : Object.values(row);
            });
      const hydratedTray = Array.isArray(state.tray)
        ? state.tray
        : Object.values(state.tray);
      // Reconstruct tray pieces from IDs (graceful fallback for unknown IDs)
      const fallbackPiece = PIECES[0]; // "dot" — safest fallback
      const restoredTray = hydratedTray.map((t) => {
        const piece = PIECES.find((p) => p.id === t.pieceId) || fallbackPiece;
        return { piece, placed: t.placed };
      });
      return {
        board: hydratedBoard,
        tray: restoredTray,
        score: state.score || 0,
        linesCleared: state.linesCleared || 0,
        highScore: state.highScore || 0,
        gameActive: !!state.gameActive,
      };
    } catch (_) {
      return null;
    }
  }

  function clearSavedState() {
    localStorage.removeItem(STORAGE_KEY);
    // v4.15.0: clear server state too
    api("/api/blox/sync", {
      userId: HUB.userId,
      savedState: null,
    }).catch(() => {});
  }

  // ── Rendering (v4.16: DOM-cached diff-update — zero innerHTML rebuild) ──
  let _boardCells = []; // 2D cache: _boardCells[r][c] = DOM element

  function renderBoard() {
    const gridEl = $("blox-board");
    if (!gridEl) return;

    // v5.0.1: Flush stale ghost references BEFORE resetting classNames.
    // Without this, _ghostCells holds orphaned refs after className wipe,
    // causing partial/broken ghost preview on subsequent showGhostAt().
    clearGhost();

    // First render: create cells once and cache them
    if (_boardCells.length === 0) {
      gridEl.innerHTML = "";
      for (let r = 0; r < GRID; r++) {
        _boardCells[r] = [];
        for (let c = 0; c < GRID; c++) {
          const cell = document.createElement("div");
          cell.className = "blox-cell";
          cell.dataset.r = r;
          cell.dataset.c = c;
          gridEl.appendChild(cell);
          _boardCells[r][c] = cell;
        }
      }
    }

    // v5.0.1: Suppress CSS transitions during batch update.
    // Cached DOM nodes inherit the .blox-cell transition (background 0.12s),
    // causing a visible cell-by-cell fill effect on programmatic updates.
    gridEl.classList.add("batch-update");

    // Diff-update: only change classes + background on existing cached nodes
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = _boardCells[r][c];
        const val = board[r][c];
        if (val) {
          cell.className = "blox-cell filled";
          cell.style.background = val;
        } else {
          cell.className = "blox-cell";
          cell.style.background = "";
        }
        // v5.0.1: Clear residual ghost CSS property from previous showGhostAt()
        cell.style.removeProperty("--ghost-color");
      }
    }

    // Flush layout so transition suppression takes effect, then re-enable
    void gridEl.offsetHeight;
    gridEl.classList.remove("batch-update");
  }

  function renderTray() {
    const trayEl = $("blox-tray");
    if (!trayEl) return;
    trayEl.innerHTML = "";
    tray.forEach((t, i) => {
      const wrapper = document.createElement("div");
      wrapper.className = "blox-piece-wrapper" + (t.placed ? " placed" : "");
      if (i === selectedPiece && !t.placed) wrapper.classList.add("selected");
      wrapper.addEventListener("click", () => selectPiece(i));

      // Touch drag
      wrapper.addEventListener("touchstart", (e) => onTrayTouchStart(e, i), {
        passive: false,
      });

      // Mouse drag (PC)
      wrapper.addEventListener("mousedown", (e) => onTrayMouseDown(e, i));

      const preview = document.createElement("div");
      preview.className = "blox-piece-preview";
      const maxR = Math.max(...t.piece.cells.map((c) => c[0])) + 1;
      const maxC = Math.max(...t.piece.cells.map((c) => c[1])) + 1;
      preview.style.gridTemplateColumns = `repeat(${maxC}, 1fr)`;
      preview.style.gridTemplateRows = `repeat(${maxR}, 1fr)`;

      for (let r = 0; r < maxR; r++) {
        for (let c = 0; c < maxC; c++) {
          const mini = document.createElement("div");
          mini.className = "blox-mini-cell";
          const isActive = t.piece.cells.some(
            ([pr, pc]) => pr === r && pc === c,
          );
          if (isActive) {
            mini.classList.add("active");
            mini.style.background = t.piece.color;
          }
          preview.appendChild(mini);
        }
      }
      wrapper.appendChild(preview);
      trayEl.appendChild(wrapper);
    });
  }

  function updateStats() {
    const scoreEl = $("blox-score");
    const linesEl = $("blox-lines");
    const bestEl = $("blox-best");
    const rewardEl = $("blox-reward");
    if (scoreEl) scoreEl.textContent = score;
    if (linesEl) linesEl.textContent = linesCleared;
    if (bestEl) bestEl.textContent = highScore;
    if (rewardEl) {
      const reward = calcBloxRewardClient(score);
      rewardEl.textContent = gameActive ? `+${reward}` : "—";
    }
  }

  function calcBloxRewardClient(s) {
    const BASE = 35,
      LOSE = 5;
    if (typeof s !== "number" || s <= 0) return LOSE;
    if (s < 100) return Math.max(LOSE, Math.floor(BASE * (s / 100)));
    let gold = BASE;
    if (s >= 100)
      gold += Math.floor(((Math.min(s, 300) - 100) / 50) * 0.08 * BASE);
    if (s >= 300)
      gold += Math.floor(((Math.min(s, 600) - 300) / 50) * 0.15 * BASE);
    if (s >= 600) gold += Math.floor(((s - 600) / 50) * 0.25 * BASE);
    return Math.min(gold, 400);
  }

  // ── Ghost preview + click (board-level, center-of-mass offset) ──
  // v5.0.1: _lastGhostKey prevents clearGhost/showGhostAt on every pixel move
  //         (was restarting ghostBreathe CSS animation, causing janky visuals)
  let _lastGhostKey = "";

  function initBoardMouseTracking() {
    const gridEl = $("blox-board");
    if (!gridEl) return;

    // Guard: only bind once per DOM element
    if (gridEl._bloxBound) return;
    gridEl._bloxBound = true;

    // Shared function: compute placement target from mouse/click position
    function getTargetFromEvent(e) {
      if (selectedPiece < 0 || !gameActive || gamePaused) return null;
      const t = tray[selectedPiece];
      if (!t || t.placed) return null;

      const rect = gridEl.getBoundingClientRect();
      const cellSize = rect.width / GRID;
      const hoveredR = Math.floor((e.clientY - rect.top) / cellSize);
      const hoveredC = Math.floor((e.clientX - rect.left) / cellSize);

      if (
        hoveredR < 0 ||
        hoveredR >= GRID ||
        hoveredC < 0 ||
        hoveredC >= GRID
      ) {
        return null;
      }

      const offset = getCenterOffset(t.piece);
      return {
        piece: t.piece,
        targetR: hoveredR - offset.dr,
        targetC: hoveredC - offset.dc,
      };
    }

    gridEl.addEventListener("mousemove", (e) => {
      const target = getTargetFromEvent(e);
      if (!target) {
        if (_lastGhostKey) {
          clearGhost();
          _lastGhostKey = "";
        }
        return;
      }
      // Skip if ghost is already at this grid position (no animation restart)
      const key = `${selectedPiece},${target.targetR},${target.targetC}`;
      if (key === _lastGhostKey) return;
      clearGhost();
      showGhostAt(target.piece, target.targetR, target.targetC);
      _lastGhostKey = key;
    });

    gridEl.addEventListener("mouseleave", () => {
      clearGhost();
      _lastGhostKey = "";
    });

    // Board-level click: same offset math as ghost
    gridEl.addEventListener("click", (e) => {
      const target = getTargetFromEvent(e);
      if (target) onCellClick(target.targetR, target.targetC);
    });
  }

  function showGhostAt(piece, r, c) {
    if (_boardCells.length === 0) return;
    const valid = canPlace(piece, r, c);
    for (const [dr, dc] of piece.cells) {
      const gr = r + dr,
        gc = c + dc;
      if (gr < 0 || gr >= GRID || gc < 0 || gc >= GRID) continue;
      const cell = _boardCells[gr]?.[gc];
      if (cell) {
        cell.classList.add("ghost");
        if (!valid) cell.classList.add("ghost-invalid");
        else cell.style.setProperty("--ghost-color", piece.color);
        _ghostCells.push(cell);
      }
    }
  }

  // v4.16: Track ghost cells directly instead of querySelectorAll('.ghost')
  let _ghostCells = [];

  function clearGhost() {
    for (const cell of _ghostCells) {
      cell.classList.remove("ghost", "ghost-invalid");
      cell.style.removeProperty("--ghost-color");
    }
    _ghostCells.length = 0;
  }

  // ── Shared: compute board target from a pointer position ──
  // v4.16: Uses _cachedBoardRect during active drag for zero-reflow reads
  function getBoardTarget(clientX, clientY, piece) {
    const rect = _cachedBoardRect || $("blox-board")?.getBoundingClientRect();
    if (!rect) return null;
    const cellSize = rect.width / GRID;
    const hoveredR = Math.floor((clientY - rect.top) / cellSize);
    const hoveredC = Math.floor((clientX - rect.left) / cellSize);
    if (hoveredR < 0 || hoveredR >= GRID || hoveredC < 0 || hoveredC >= GRID)
      return null;
    const offset = getCenterOffset(piece);
    return {
      targetR: hoveredR - offset.dr,
      targetC: hoveredC - offset.dc,
    };
  }

  /** v4.16: Cache board rect at drag start, clear at drag end */
  function _cacheBoardRect() {
    const gridEl = $("blox-board");
    _cachedBoardRect = gridEl ? gridEl.getBoundingClientRect() : null;
  }
  function _clearBoardRectCache() {
    _cachedBoardRect = null;
  }

  // ── Touch drag-and-drop ──
  const TOUCH_LIFT_FACTOR = 2.125; // cells above finger (was 2.5, reduced 15%)
  function onTrayTouchStart(e, idx) {
    if (!gameActive || gamePaused) return;
    if (tray[idx]?.placed) return;
    e.preventDefault(); // Block swipe nav
    _cacheBoardRect(); // v4.16: cache geometry once per drag
    dragPieceIdx = idx;
    selectedPiece = idx;

    // v4.4: DON'T call renderTray() here — it destroys the touch target mid-event
    // and causes browsers to cancel the touch sequence ("stuck piece" bug).
    // Instead, visually mark the piece via CSS class on its wrapper.
    const wrapper = e.target.closest(".blox-piece-wrapper");
    if (wrapper) wrapper.classList.add("dragging");

    // Disable pointer-events on tray wrappers to prevent stuck-piece stacking
    const trayEl = $("blox-tray");
    if (trayEl) trayEl.style.pointerEvents = "none";

    // Create floating preview (positioned anchored to touch point)
    createDragPreview(tray[idx].piece, e.touches[0], true);

    // Block swipe navigation while dragging
    HUB.swipeBlocked = true;

    // Compute liftY once for consistent ghost alignment
    const gridEl = $("blox-board");
    const cellPx = gridEl ? gridEl.getBoundingClientRect().width / GRID : 28;
    const liftY = cellPx * TOUCH_LIFT_FACTOR;

    const onMove = (ev) => {
      ev.preventDefault();
      if (dragPieceIdx < 0) return;
      moveDragPreview(ev.touches[0], true);

      // Show ghost on board — offset by liftY to match preview position
      clearGhost();
      const target = getBoardTarget(
        ev.touches[0].clientX,
        ev.touches[0].clientY - liftY,
        tray[dragPieceIdx].piece,
      );
      if (target)
        showGhostAt(tray[dragPieceIdx].piece, target.targetR, target.targetC);
    };

    const onEnd = (ev) => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      clearGhost();

      // Re-enable tray pointer-events
      if (trayEl) trayEl.style.pointerEvents = "";

      if (dragPieceIdx < 0) {
        removeDragPreview();
        renderTray();
        return;
      }
      const touch = ev.changedTouches[0];
      // Use same liftY offset for placement target
      const target = getBoardTarget(
        touch.clientX,
        touch.clientY - liftY,
        tray[dragPieceIdx].piece,
      );
      let placed = false;
      if (target) {
        placed = canPlace(
          tray[dragPieceIdx].piece,
          target.targetR,
          target.targetC,
        );
        if (placed) {
          removeDragPreview();
          onCellClick(target.targetR, target.targetC);
        }
      }
      // Spring return if not placed
      if (!placed) springReturnPreview(dragPieceIdx);
      const idx = dragPieceIdx;
      dragPieceIdx = -1;
      _clearBoardRectCache(); // v4.16: release cached rect
      // v4.4: Now safe to renderTray to restore visual state
      renderTray();
      // Restore swipe after short delay (let touchend propagate)
      setTimeout(() => {
        if (!gameActive) HUB.swipeBlocked = false;
      }, 100);
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: false });
  }

  // ── Mouse drag-and-drop (PC) ──
  let mouseDragging = false;
  function onTrayMouseDown(e, idx) {
    if (!gameActive || gamePaused) return;
    if (tray[idx]?.placed) return;
    if (e.button !== 0) return; // Left-click only
    e.preventDefault();

    dragPieceIdx = idx;
    selectedPiece = idx;
    mouseDragging = false; // Will become true on first mousemove
    _cacheBoardRect(); // v4.16: cache geometry once per drag
    renderTray();

    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5; // px before recognizing as drag vs click

    const onMove = (ev) => {
      if (dragPieceIdx < 0) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (
        !mouseDragging &&
        dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD
      ) {
        mouseDragging = true;
        createDragPreview(tray[dragPieceIdx].piece, ev, false);
        document.body.style.cursor = "grabbing";
      }

      if (mouseDragging) {
        moveDragPreview(ev, false);
        clearGhost();
        const target = getBoardTarget(
          ev.clientX,
          ev.clientY,
          tray[dragPieceIdx].piece,
        );
        if (target)
          showGhostAt(tray[dragPieceIdx].piece, target.targetR, target.targetC);
      }
    };

    const onUp = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";

      if (mouseDragging) {
        clearGhost();
        let placed = false;
        if (dragPieceIdx >= 0) {
          const target = getBoardTarget(
            ev.clientX,
            ev.clientY,
            tray[dragPieceIdx].piece,
          );
          if (
            target &&
            canPlace(tray[dragPieceIdx].piece, target.targetR, target.targetC)
          ) {
            placed = true;
            removeDragPreview();
            onCellClick(target.targetR, target.targetC);
          }
        }
        if (!placed) springReturnPreview(dragPieceIdx);
        dragPieceIdx = -1;
        mouseDragging = false;
        _clearBoardRectCache(); // v4.16: release cached rect
      } else {
        // Short click — use existing click-to-select (already handled by click event)
        dragPieceIdx = -1;
        _clearBoardRectCache(); // v4.16: release cached rect
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Drag preview (shared by touch + mouse) ──
  function createDragPreview(piece, pointer, isTouch) {
    removeDragPreview();

    // Determine cell size: use board's actual cell size if available, else default
    const gridEl = $("blox-board");
    let cellPx = 28;
    if (gridEl) {
      const rect = gridEl.getBoundingClientRect();
      cellPx = rect.width / GRID;
    }
    dragPreviewCellSize = cellPx;

    const el = document.createElement("div");
    el.className = "blox-drag-preview";
    const maxR = Math.max(...piece.cells.map((c) => c[0])) + 1;
    const maxC = Math.max(...piece.cells.map((c) => c[1])) + 1;

    // Scale preview to 1:1 match with board
    el.style.width = `${maxC * cellPx}px`;
    el.style.height = `${maxR * cellPx}px`;
    el.style.gridTemplateColumns = `repeat(${maxC}, ${cellPx}px)`;
    el.style.gridTemplateRows = `repeat(${maxR}, ${cellPx}px)`;

    for (let r = 0; r < maxR; r++) {
      for (let c = 0; c < maxC; c++) {
        const cell = document.createElement("div");
        const isActive = piece.cells.some(([pr, pc]) => pr === r && pc === c);
        if (isActive) {
          cell.style.background = piece.color;
          cell.style.borderRadius = "4px";
        }
        el.appendChild(cell);
      }
    }

    const offset = getCenterOffset(piece);
    // Lift: on touch, lift above finger for visibility (v4.4: reduced 15%)
    const liftY = isTouch ? cellPx * TOUCH_LIFT_FACTOR : 10;

    el.style.left = `${pointer ? pointer.clientX - (offset.dc + 0.5) * cellPx : -999}px`;
    el.style.top = `${pointer ? pointer.clientY - (offset.dr + 0.5) * cellPx - liftY : -999}px`;
    // Juicy UI: prepare for translate3d positioning
    el._anchorDc = offset.dc;
    el._anchorDr = offset.dr;
    el._cellPx = cellPx;
    document.body.appendChild(el);
    dragPreviewEl = el;
  }

  function moveDragPreview(pointer, isTouch) {
    if (!dragPreviewEl) return;
    // v4.9: Support both drag mode (dragPieceIdx) and attach mode (attachedPieceIdx)
    const pieceIdx = dragPieceIdx >= 0 ? dragPieceIdx : attachedPieceIdx;
    if (pieceIdx < 0) return;
    const piece = tray[pieceIdx].piece;
    const offset = getCenterOffset(piece);
    const cellPx = dragPreviewCellSize;
    const liftY = isTouch ? cellPx * TOUCH_LIFT_FACTOR : 10;

    // Juicy UI: GPU-accelerated positioning via translate3d
    const x = pointer.clientX - (offset.dc + 0.5) * cellPx;
    const y = pointer.clientY - (offset.dr + 0.5) * cellPx - liftY;
    dragPreviewEl.style.left = "0px";
    dragPreviewEl.style.top = "0px";
    dragPreviewEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function removeDragPreview() {
    if (dragPreviewEl) {
      dragPreviewEl.remove();
      dragPreviewEl = null;
    }
  }

  // Spring return: animate preview back to its tray slot before removing
  function springReturnPreview(pieceIdx) {
    if (!dragPreviewEl) return;
    const trayEl = $("blox-tray");
    const wrappers = trayEl?.querySelectorAll(".blox-piece-wrapper");
    const target = wrappers?.[pieceIdx];
    if (!target) {
      removeDragPreview();
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const previewRect = dragPreviewEl.getBoundingClientRect();

    // Compute target center offset (preview positioned at left:0;top:0 via translate3d)
    const tx = targetRect.left + targetRect.width / 2 - previewRect.width / 2;
    const ty = targetRect.top + targetRect.height / 2 - previewRect.height / 2;

    // Enable CSS transition (added by .returning class), then set target transform
    // on next frame so the browser transitions from the current transform to the new one.
    dragPreviewEl.classList.add("returning");
    const el = dragPreviewEl;
    dragPreviewEl = null; // release reference so new drags can start

    requestAnimationFrame(() => {
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(0.6)`;
      el.style.opacity = "0.5";
    });

    setTimeout(() => {
      el.remove();
    }, 420);
  }

  // ── Interaction ──
  function selectPiece(i) {
    if (!gameActive || gamePaused) return;
    if (tray[i]?.placed) return;

    // v4.9: Click-to-attach mode
    if (attachedPieceIdx === i) {
      // Second click on same piece → deselect (cancel attach)
      detachPiece();
      return;
    }
    if (attachedPieceIdx >= 0) {
      // Clicking different piece while one is attached → switch
      detachPiece();
    }

    selectedPiece = i;
    attachedPieceIdx = i;
    renderTray();
    // Mark wrapper with .attached class
    const wrappers = $("blox-tray")?.querySelectorAll(".blox-piece-wrapper");
    if (wrappers?.[i]) wrappers[i].classList.add("attached");

    // Create floating preview that follows cursor
    createDragPreview(tray[i].piece, null, false);
    attachMoveHandler = (ev) => {
      moveDragPreview(ev, false);
      clearGhost();
      const target = getBoardTarget(ev.clientX, ev.clientY, tray[i].piece);
      if (target) showGhostAt(tray[i].piece, target.targetR, target.targetC);
    };
    document.addEventListener("mousemove", attachMoveHandler);

    // ESC to cancel
    document.addEventListener("keydown", onAttachKeydown);
  }

  function detachPiece() {
    if (attachMoveHandler) {
      document.removeEventListener("mousemove", attachMoveHandler);
      attachMoveHandler = null;
    }
    document.removeEventListener("keydown", onAttachKeydown);
    removeDragPreview();
    clearGhost();
    attachedPieceIdx = -1;
    selectedPiece = -1;
    renderTray();
  }

  function onAttachKeydown(e) {
    if (e.key === "Escape") {
      detachPiece();
    }
  }

  function onCellClick(r, c) {
    if (!gameActive || gamePaused || selectedPiece < 0) return;
    const t = tray[selectedPiece];
    if (!t || t.placed) return;
    if (!canPlace(t.piece, r, c)) {
      const gridEl = $("blox-board");
      if (gridEl) {
        gridEl.classList.add("shake");
        setTimeout(() => gridEl.classList.remove("shake"), 350);
      }
      return;
    }

    placePiece(t.piece, r, c);
    t.placed = true;

    // v4.9: Clean up attach mode after successful placement
    if (attachedPieceIdx >= 0) {
      detachPiece();
    }
    selectedPiece = -1;

    renderBoard();
    renderTray();
    initBoardMouseTracking(); // Re-bind after re-render

    setTimeout(() => {
      const linesWereCleared = clearLines();
      updateStats();
      saveState();
      syncToStore();

      // Juicy UI: hit-stop — defer subsequent logic for multi-line clears
      const hitStopDelay = linesWereCleared >= 2 ? 120 : 0;

      // v4.7: Defer game-over check until AFTER the clear animation
      // so the player sees lines vanish before any overlay appears.
      // Board state is already correct (clearLines clears synchronously).
      const checkDelay = (linesWereCleared > 0 ? 350 : 0) + hitStopDelay;

      if (tray.every((x) => x.placed)) {
        setTimeout(
          () => {
            refillTray();
            renderTray();
            saveState();
            if (!canAnyPieceFit()) {
              gameOver();
            }
          },
          Math.max(checkDelay, 200),
        );
      } else {
        if (checkDelay > 0) {
          setTimeout(() => {
            if (!canAnyPieceFit()) gameOver();
          }, checkDelay);
        } else if (!canAnyPieceFit()) {
          setTimeout(gameOver, 400);
        }
      }
    }, 50);
  }

  // ── Pause / Resume overlay ──
  function showPauseOverlay() {
    gamePaused = true;
    // Unblock swipe when paused
    HUB.swipeBlocked = false;

    const overlay = $("blox-pause-overlay");
    const btnNew = $("blox-btn-new");
    const btnResume = $("blox-btn-resume");
    const btnEnd = $("blox-btn-end");

    if (gameActive) {
      // Game in progress — show resume + end
      if (btnNew) btnNew.style.display = "none";
      if (btnResume) btnResume.style.display = "";
      if (btnEnd) btnEnd.style.display = "";
    } else {
      // Check if there's a saved game
      const saved = loadState();
      if (saved && saved.gameActive) {
        if (btnNew) btnNew.style.display = "";
        if (btnResume) btnResume.style.display = "";
        if (btnEnd) btnEnd.style.display = "none";
      } else {
        if (btnNew) btnNew.style.display = "";
        if (btnResume) btnResume.style.display = "none";
        if (btnEnd) btnEnd.style.display = "none";
      }
    }
    if (overlay && !overlay.open) overlay.showModal();
  }

  function hidePauseOverlay() {
    gamePaused = false;
    const overlay = $("blox-pause-overlay");
    if (overlay && overlay.open) overlay.close();
    // Block swipe when playing
    if (gameActive) HUB.swipeBlocked = true;
  }

  function resumeGame() {
    if (gameActive) {
      // Already active, just hide overlay
      hidePauseOverlay();
      return;
    }
    // Try to restore from save
    const saved = loadState();
    if (saved && saved.gameActive) {
      board = saved.board;
      tray = saved.tray;
      score = saved.score;
      linesCleared = saved.linesCleared;
      highScore = saved.highScore;
      gameActive = true;
      selectedPiece = -1;

      renderBoard();
      renderTray();
      updateStats();
      initBoardMouseTracking();
      hidePauseOverlay();
      syncToStore();
    }
  }

  // ── Game lifecycle ──
  async function startGame() {
    // Energy gatekeep
    if (!HUD.hasEnergy(4)) {
      if (HUD.showEnergyModal) {
        HUD.showEnergyModal(4, () => startGame());
      } else {
        showToast("⚡ Need 4 energy to play Building Blox!");
      }
      return;
    }

    // Close overlays natively
    const gov = $("blox-overlay");
    if (gov && gov.open) gov.close();

    board = createEmptyBoard();
    score = 0;
    linesCleared = 0;
    gameActive = true;
    gamePaused = false;
    refillTray();

    renderBoard();
    renderTray();
    updateStats();
    initBoardMouseTracking();
    hidePauseOverlay();
    saveState();
    syncToStore();

    // Notify server
    const data = await api("/api/blox/start", {
      userId: HUB.userId,
      username: HUB.username,
    }).catch(() => null);

    if (data?.error === "NOT_ENOUGH_ENERGY") {
      showToast("⚡ Not enough energy!");
      gameActive = false;
      HUB.swipeBlocked = false;
      return;
    }
    if (data?.highScore !== undefined) highScore = data.highScore;
    if (data?.resources) {
      HUD.syncFromServer(data.resources);
    }
    updateStats();
    saveState();
  }

  async function endGame() {
    if (!gameActive) return;
    gameActive = false;
    gamePaused = false;
    highScore = Math.max(highScore, score);
    HUB.swipeBlocked = false;
    clearSavedState();
    // v4.9: clean up any attached piece
    if (attachedPieceIdx >= 0) detachPiece();

    const data = await api("/api/blox/end", {
      userId: HUB.userId,
      score,
      linesCleared,
    }).catch(() => null);

    if (data?.highScore) highScore = data.highScore;
    if (data?.resources) {
      HUD.syncFromServer(data.resources);
      if (data.goldReward) HUD.animateGoldChange(data.goldReward);
    }

    showGameOver(score);
    syncToStore();
    updateStats();
    // v4.9: refresh leaderboard after score submission
    fetchBloxLeaderboard();
  }

  function gameOver() {
    showToast("🧱 No more moves! Game Over");
    // v4.15.1: Radial petrification — freeze blocks from center outward
    const gridEl = $("blox-board");
    if (gridEl) {
      const centerR = GRID / 2,
        centerC = GRID / 2;
      const cells = gridEl.querySelectorAll(".blox-cell.filled");
      cells.forEach((cell) => {
        const r = parseInt(cell.dataset.r);
        const c = parseInt(cell.dataset.c);
        const dist = Math.sqrt((r - centerR) ** 2 + (c - centerC) ** 2);
        cell.style.transitionDelay = `${dist * 60}ms`;
        cell.classList.add("petrified");
      });
    }
    // Delay endGame to let petrification play out (~500ms for outermost cells)
    setTimeout(() => endGame(), 600);
  }

  function showGameOver(finalScore) {
    $("blox-final-score").textContent = finalScore;
    $("blox-final-best").textContent = highScore;
    $("blox-final-lines").textContent = linesCleared;

    // Natively show dialog
    const gov = $("blox-overlay");
    if (gov && !gov.open) gov.showModal();
  }

  // ── Store sync ──
  function syncToStore() {
    GameStore.setState("blox", {
      score,
      linesCleared,
      highScore,
      gameActive,
    });
  }

  // ── Init ──
  async function init() {
    GameStore.registerSlice("blox", {
      score,
      linesCleared,
      highScore,
      gameActive,
    });

    // Bind pause overlay buttons
    $("blox-btn-new")?.addEventListener("click", () => startGame());
    $("blox-btn-resume")?.addEventListener("click", () => resumeGame());
    $("blox-btn-end")?.addEventListener("click", () => {
      hidePauseOverlay();
      endGame();
    });
    // Game-over play-again (moved from shared.js for SRP)
    $("btn-blox-play-again")?.addEventListener("click", () => startGame());

    // v4.9: Leaderboard tab clicks
    $("blox-lb-tab-all")?.addEventListener("click", () =>
      setBloxLbTab("global"),
    );
    $("blox-lb-tab-room")?.addEventListener("click", () =>
      setBloxLbTab("room"),
    );

    // v4.15.0: Fetch server state for cross-device sync
    try {
      const serverData = await api("/api/blox/state", {
        userId: HUB.userId,
        username: HUB.username,
      });
      if (serverData?.highScore)
        highScore = Math.max(highScore, serverData.highScore);
      // Always prefer server state (canonical — every saveState() syncs to it)
      if (serverData?.savedState) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(serverData.savedState),
        );
        // v4.15: Also apply server state to in-memory variables
        // so Resume works correctly with cross-device data
        const loaded = loadState();
        if (loaded && loaded.gameActive) {
          board = loaded.board;
          tray = loaded.tray;
          score = loaded.score;
          linesCleared = loaded.linesCleared;
          highScore = Math.max(highScore, loaded.highScore);
        }
      }
    } catch (_) {
      /* offline — use local only */
    }

    board = createEmptyBoard();
    renderBoard();
    initBoardMouseTracking();
    initBloxFloatPool();
    updateStats();

    // Show initial overlay
    showPauseOverlay();

    // v4.9: Initial leaderboard fetch
    fetchBloxLeaderboard();

    // v4.16: Flush pending debounced sync on tab close (keepalive guarantees delivery)
    window.addEventListener("beforeunload", () => {
      if (!gameActive) return;
      // Safety net: write to localStorage synchronously
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_buildSavePayload()));
      } catch (_) {}
      _flushSync();
    });
  }

  function onEnter() {
    updateStats();
    // v4.9: refresh leaderboard on screen enter
    fetchBloxLeaderboard();
    // Show pause overlay when entering screen (if game is active, pause it)
    if (gameActive) {
      showPauseOverlay();
    } else {
      showPauseOverlay();
    }
  }

  return { init, onEnter, startGame, fetchBloxLeaderboard, setBloxLbTab };
})();

export const BloxGame = BloxGameImpl;
