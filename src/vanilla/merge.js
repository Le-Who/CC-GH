/* ═══════════════════════════════════════════════════
 *  Game Hub — Gacha Merge Mini-Game (v6.2.0)
 *  Server-authoritative engine + Ghost-Pattern D&D
 *  Board: 7 rows × 9 cols. Items merge by chain + level.
 *  CSP-compliant: no innerHTML on active board.
 * ═══════════════════════════════════════════════════ */
import { GameStore } from "./store.js";
import { api, showToast, HUB, safeShowModal } from "./shared.js";
import { MERGE_CHAINS, ECONOMY, CROPS, CROP_TIERS } from "/game-logic.js";
import { HUD } from "./hud.js";
import { SoundEngine } from "./effects.js";

/* ─── Constants ─── */
const BOARD_ROWS = 7;
const BOARD_COLS = 9;

/* ─── Build fast lookup: itemId → { chainId, level, emoji, name, nextId } ─── */
const ITEM_LOOKUP = {};
for (const chain of Object.values(MERGE_CHAINS)) {
  for (let lvl = 0; lvl < chain.items.length; lvl++) {
    ITEM_LOOKUP[chain.items[lvl]] = {
      chainId: chain.id,
      level: lvl,
      emoji: chain.emoji[lvl],
      name: chain.names[lvl],
      nextId: lvl < chain.items.length - 1 ? chain.items[lvl + 1] : null,
    };
  }
}

/* ─── Store Slice ─── */
function registerSlice() {
  GameStore.registerSlice("merge", {
    board: Array.from({ length: BOARD_ROWS }, () =>
      Array(BOARD_COLS).fill(null),
    ),
    generators: ["textile"],
    inventory: [],
    lastFreePull: 0,
    generatorState: {
      textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
    },
  });
}

/* ═══════════════════════════════════════════════════
 *  Actions (Optimistic Update → Server Validation)
 * ═══════════════════════════════════════════════════ */

/**
 * Tap generator: deducts 1 energy + 1 crop, spawns 2-5 items server-side.
 * Client sends request, server returns authoritative board.
 */
async function tapGenerator(chainId, cropId) {
  const res = GameStore.getState("resources");
  const mergeState = GameStore.getState("merge");
  if (!res || !mergeState) return { success: false };

  const chain = MERGE_CHAINS[chainId];
  if (!chain) return { success: false, reason: "UNKNOWN_CHAIN" };

  // Pre-flight checks (avoid unnecessary network call)
  if (res.energy.current < 1) {
    showToast("⚡ Not enough energy!", "error");
    return { success: false, reason: "NO_ENERGY" };
  }
  const harvested = res.harvested || {};
  if (!cropId || !harvested[cropId] || harvested[cropId] <= 0) {
    showToast("🌱 No crops to fuel generator!", "error");
    return { success: false, reason: "NO_CROP" };
  }
  const gs = mergeState.generatorState?.[chainId];
  if (gs && gs.cooldownEnd > Date.now()) {
    const mins = Math.ceil((gs.cooldownEnd - Date.now()) / 60000);
    showToast(`⏳ Generator cooling down (${mins}m left)`, "error");
    return { success: false, reason: "COOLDOWN" };
  }

  // Optimistic: deduct energy + crop immediately
  const oldRes = { ...res };
  const newHarvested = { ...harvested };
  newHarvested[cropId] = (newHarvested[cropId] || 0) - 1;
  if (newHarvested[cropId] <= 0) delete newHarvested[cropId];
  GameStore.setState("resources", {
    ...res,
    energy: { ...res.energy, current: res.energy.current - 1 },
    harvested: newHarvested,
  });
  HUD.updateDisplay(GameStore.getState("resources"));

  try {
    const data = await api("/api/merge/tap", {
      userId: HUB.userId,
      chainId,
      cropId,
    });
    if (!data?.success) {
      // Rollback
      GameStore.setState("resources", oldRes);
      HUD.updateDisplay(oldRes);
      showToast(data?.error || "Tap failed", "error");
      return { success: false };
    }
    // Sync authoritative state
    GameStore.setState("merge", data.merge);
    if (data.resources) {
      GameStore.setState("resources", {
        ...data.resources,
        harvested: data.harvested || {},
      });
      HUD.updateDisplay(data.resources);
    }
    _renderBoard();
    _renderGeneratorPanel();
    // Show spawned count
    showToast(
      `✨ Spawned ${data.spawned?.length || 0} items! (-1⚡)`,
      "success",
    );
    return { success: true, spawned: data.spawned };
  } catch (err) {
    // Rollback on network error
    GameStore.setState("resources", oldRes);
    HUD.updateDisplay(oldRes);
    showToast("Network error", "error");
    return { success: false };
  }
}

/**
 * Merge two items: client sends coords, server validates and returns new board.
 */
async function mergeItems(fromR, fromC, toR, toC) {
  const mergeState = GameStore.getState("merge");
  if (!mergeState) return { success: false };

  const board = mergeState.board;
  const src = board[fromR]?.[fromC];
  const dst = board[toR]?.[toC];
  if (!src || !dst) return { success: false, reason: "EMPTY_CELL" };
  if (src.chainId !== dst.chainId || src.level !== dst.level) {
    return { success: false, reason: "MISMATCH" };
  }
  const info = ITEM_LOOKUP[src.id];
  if (!info || !info.nextId) {
    showToast("✨ Max level reached!", "info");
    return { success: false, reason: "MAX_LEVEL" };
  }

  // Optimistic: merge immediately in local state
  const oldBoard = structuredClone(board);
  const newBoard = structuredClone(board);
  const nextInfo = ITEM_LOOKUP[info.nextId];
  newBoard[toR][toC] = {
    id: info.nextId,
    chainId: src.chainId,
    level: nextInfo.level,
  };
  newBoard[fromR][fromC] = null;
  GameStore.setState("merge", { ...mergeState, board: newBoard });
  _renderBoard();

  try {
    const data = await api("/api/merge/merge", {
      userId: HUB.userId,
      fromR,
      fromC,
      toR,
      toC,
    });
    if (!data?.success) {
      // Rollback
      GameStore.setState("merge", { ...mergeState, board: oldBoard });
      _renderBoard();
      return { success: false };
    }
    // Sync authoritative board
    GameStore.setState("merge", data.merge);
    SoundEngine.merge(); // v6.2.1: audio + haptic feedback on merge success
    _renderBoard();
    return { success: true };
  } catch {
    GameStore.setState("merge", { ...mergeState, board: oldBoard });
    _renderBoard();
    return { success: false };
  }
}

/**
 * Roll gacha: costs 10 tokens, spawns random L0 item + unlocks chain.
 */
async function rollGacha() {
  const res = GameStore.getState("resources");
  if (!res || (res.gachaTokens || 0) < ECONOMY.GACHA_PULL_COST) {
    showToast(`🎰 Need ${ECONOMY.GACHA_PULL_COST} Gacha Tokens!`, "error");
    return { success: false };
  }

  // Optimistic: deduct tokens
  const oldTokens = res.gachaTokens;
  GameStore.setState("resources", {
    ...res,
    gachaTokens: res.gachaTokens - ECONOMY.GACHA_PULL_COST,
  });
  HUD.updateDisplay(GameStore.getState("resources"));

  try {
    const data = await api("/api/merge/gacha", { userId: HUB.userId });
    if (!data?.success) {
      GameStore.setState("resources", { ...res, gachaTokens: oldTokens });
      HUD.updateDisplay(GameStore.getState("resources"));
      showToast(data?.error || "Gacha failed", "error");
      return { success: false };
    }
    GameStore.setState("merge", data.merge);
    GameStore.setState("resources", data.resources);
    HUD.updateDisplay(data.resources);
    _renderBoard();
    _renderGeneratorPanel();
    showToast("🎰 Gacha roll! New item spawned!", "success");
    // v7.2: Gacha capsule drop + reveal juice
    _animateGachaDrop();
    return { success: true };
  } catch {
    GameStore.setState("resources", { ...res, gachaTokens: oldTokens });
    HUD.updateDisplay(GameStore.getState("resources"));
    return { success: false };
  }
}

/**
 * Daily free pull: 1 free item per UTC day.
 */
async function freePull() {
  try {
    const data = await api("/api/merge/free-pull", { userId: HUB.userId });
    if (!data?.success) {
      showToast(data?.error || "Free pull unavailable", "error");
      return { success: false };
    }
    GameStore.setState("merge", data.merge);
    _renderBoard();
    _renderGeneratorPanel();
    showToast("🎁 Daily free item!", "success");
    // v7.2: Gacha capsule drop juice
    _animateGachaDrop();
    return { success: true };
  } catch {
    showToast("Network error", "error");
    return { success: false };
  }
}

/**
 * Trash item at (r,c). Anti-softlock escape valve.
 */
async function trashMergeItem(r, c) {
  const mergeState = GameStore.getState("merge");
  if (!mergeState || !mergeState.board[r]?.[c]) return { success: false };

  // Snapshot for rollback
  const oldBoard = structuredClone(mergeState.board);
  const newBoard = structuredClone(mergeState.board);
  newBoard[r][c] = null;
  GameStore.setState("merge", { ...mergeState, board: newBoard });
  _renderBoard();

  try {
    const data = await api("/api/merge/trash", { userId: HUB.userId, r, c });
    if (!data?.success) {
      GameStore.setState("merge", { ...mergeState, board: oldBoard });
      _renderBoard();
    }
    return { success: true };
  } catch {
    GameStore.setState("merge", { ...mergeState, board: oldBoard });
    _renderBoard();
    return { success: false };
  }
}

/* ═══════════════════════════════════════════════════
 *  DOM Layer: 2D Cell Cache + Ghost-Pattern D&D
 * ═══════════════════════════════════════════════════ */
let _cells = []; // 2D DOM cache: _cells[row][col]
let _boardEl = null;
let _dragState = null;
let _trashMode = false;
let _cachedMatchTargets = []; // OPTIMIZATION 1: Cache rects to avoid Layout Thrashing in RAF
let _selectedFuel = {}; // chainId → cropId (fuel slot memory)
let _idleHintTimer = null;
let _dragSafetyTimer = null; // v6.2.0: force-cleanup stuck drags
let _cooldownTimer = null; // v6.2.1: stored for cleanup in onLeave()
const IDLE_HINT_DELAY = 7000; // 7 seconds
const DRAG_SAFETY_TIMEOUT = 5000; // 5 seconds max drag duration

/* ─── Board Rendering ─── */
function createBoardDOM() {
  _boardEl = document.getElementById("merge-board");
  if (!_boardEl) return;

  // One-time build (never use innerHTML again after this)
  _boardEl.textContent = "";
  _cells = [];

  for (let r = 0; r < BOARD_ROWS; r++) {
    _cells[r] = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "merge-cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      _boardEl.appendChild(cell);
      _cells[r][c] = cell;
    }
  }

  // Bind pointer events for ghost-pattern D&D
  _boardEl.addEventListener("pointerdown", _onPointerDown);
  document.addEventListener("pointermove", _onPointerMove);
  document.addEventListener("pointerup", _onPointerUp);
  document.addEventListener("pointercancel", _onPointerUp);

  _renderBoard();
}

function _renderBoard() {
  const mergeState = GameStore.getState("merge");
  if (!mergeState || !_boardEl) return;
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      _renderCell(r, c, mergeState.board[r][c]);
    }
  }
  // Empty-board onboarding hint
  const isEmpty = mergeState.board.every((row) =>
    row.every((cell) => cell === null),
  );
  let hint = _boardEl.querySelector(".merge-empty-hint");
  if (isEmpty && !hint) {
    hint = document.createElement("div");
    hint.className = "merge-empty-hint";
    hint.textContent =
      "🌱 Tap a generator below to start! Feed crops → get items → merge to level up";
    _boardEl.appendChild(hint);
  } else if (!isEmpty && hint) {
    hint.remove();
  }
  // Restart idle hint timer on any board render
  _resetIdleHintTimer();
}

/* v7.2: Gacha capsule drop + reveal animation on recently spawned cells */
function _animateGachaDrop() {
  if (!_boardEl) return;
  const cells = _boardEl.querySelectorAll(".merge-cell.merge-item");
  // Animate the last row of items (most likely newly spawned)
  const items = Array.from(cells).slice(-3);
  items.forEach((cell, i) => {
    cell.classList.add("gacha-dropping");
    cell.style.animationDelay = `${i * 80}ms`;
    cell.addEventListener(
      "animationend",
      function handler() {
        if (HUB.currentScreen !== 4) return; // OPTIMIZATION 8: Leak protection
        cell.classList.remove("gacha-dropping");
        cell.classList.add("gacha-reveal");
        cell.addEventListener(
          "animationend",
          () => {
            if (HUB.currentScreen === 4) cell.classList.remove("gacha-reveal");
          },
          { once: true },
        );
        cell.removeEventListener("animationend", handler);
      },
      { once: true },
    );
  });
}

function _renderCell(r, c, item) {
  const cell = _cells[r]?.[c];
  if (!cell) return;

  if (!item) {
    cell.textContent = "";
    cell.className = "merge-cell";
    cell.title = "";
    return;
  }

  const info = ITEM_LOOKUP[item.id];
  cell.textContent = info ? info.emoji : "❓";
  cell.className = "merge-cell merge-item";
  cell.title = info ? `${info.name} (Lv${item.level + 1})` : item.id;

  // Level indicator via data attribute for CSS
  cell.dataset.level = item.level;
  cell.dataset.chain = item.chainId;
}

/* ─── Ghost-Pattern Drag & Drop ─── */

/** v6.2.0: Force-cleanup any stuck drag state + orphan ghosts */
function _forceCleanupDrag() {
  if (_dragSafetyTimer) {
    clearTimeout(_dragSafetyTimer);
    _dragSafetyTimer = null;
  }
  // Remove ALL orphan ghost divs from body
  document.querySelectorAll(".merge-drag-ghost").forEach((g) => g.remove());
  // Restore any dimmed cells
  if (_dragState?.originCell) {
    _dragState.originCell.classList.remove("merge-cell--dragging");
  }
  // Clear match highlights
  _cachedMatchTargets = [];
  if (_boardEl) {
    _boardEl
      .querySelectorAll(".merge-cell--match-highlight")
      .forEach((c) => c.classList.remove("merge-cell--match-highlight"));
  }
  HUB.swipeBlocked = false;
  _dragState = null;
}

function _onPointerDown(e) {
  // v6.2.0: Clean slate — force-cleanup any stuck previous drag
  _forceCleanupDrag();

  if (_trashMode) {
    // Trash mode: click to remove
    const cell = e.target.closest(".merge-cell");
    if (!cell || !cell.classList.contains("merge-item")) return;
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    trashMergeItem(r, c);
    e.preventDefault();
    return;
  }

  const cell = e.target.closest(".merge-cell");
  if (!cell || !cell.classList.contains("merge-item")) return;

  const r = parseInt(cell.dataset.row, 10);
  const c = parseInt(cell.dataset.col, 10);

  // Create ghost clone appended to <body> (NOT modifying the grid cell)
  const ghost = document.createElement("div");
  ghost.className = "merge-drag-ghost";
  ghost.textContent = cell.textContent;
  ghost.style.cssText = `
    position: fixed;
    left: 0; top: 0;
    transform: translate3d(${e.clientX - 24}px, ${e.clientY - 24}px, 0) scale(1.15);
    pointer-events: none;
    z-index: 9999;
    will-change: transform;
    font-size: 2rem;
    width: 48px; height: 48px;
    justify-content: center;
    border-radius: 12px;
    background: rgba(255,255,255,0.2);
    /* OPTIMIZATION 1: Replaced expensive backdrop-filter: blur with opacity */
    opacity: 0.9;
    box-shadow: 0 16px 32px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.4);
    transition: transform 0.08s cubic-bezier(0.2, 0.8, 0.2, 1);
  `;
  document.body.appendChild(ghost);

  // Dim source cell
  cell.classList.add("merge-cell--dragging");

  _dragState = {
    pointerId: e.pointerId,
    fromR: r,
    fromC: c,
    ghost,
    originCell: cell,
    lastX: e.clientX,
  };

  // v6.2.0: Safety timeout — force-cleanup if drag lives too long
  _dragSafetyTimer = setTimeout(() => {
    if (_dragState) {
      console.warn("[merge] Drag safety timeout — force cleanup");
      _forceCleanupDrag();
    }
  }, DRAG_SAFETY_TIMEOUT);

  // Highlight matching items on board
  const mergeState = GameStore.getState("merge");
  const src = mergeState?.board[r]?.[c];
  _cachedMatchTargets = [];
  if (src) {
    for (let ri = 0; ri < BOARD_ROWS; ri++) {
      for (let ci = 0; ci < BOARD_COLS; ci++) {
        if (ri === r && ci === c) continue;
        const dst = mergeState.board[ri]?.[ci];
        if (dst && dst.id === src.id) {
          const targetCell = _cells[ri][ci];
          targetCell.classList.add("merge-cell--match-highlight");
          // OPTIMIZATION 1: Cache rect to avoid DOM queries during RAF drag
          const rect = targetCell.getBoundingClientRect();
          _cachedMatchTargets.push({
            el: targetCell,
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
          });
        }
      }
    }
  }

  // v6.2.0: Removed setPointerCapture — document-level listeners handle everything
  HUB.swipeBlocked = true;
  e.preventDefault();
}

function _onPointerMove(e) {
  if (!_dragState || e.pointerId !== _dragState.pointerId) return;
  requestAnimationFrame(() => {
    if (!_dragState) return;

    // Phase 2 Item 4: Magnetic Snap + Elevation Drag (velocity tilt)
    let snapX = e.clientX - 24;
    let snapY = e.clientY - 24;
    const SNAP_RADIUS = 40;

    // OPTIMIZATION 1: Used cached targets array with zero DOM queries
    for (const t of _cachedMatchTargets) {
      const dist = Math.hypot(e.clientX - t.cx, e.clientY - t.cy);
      if (dist < SNAP_RADIUS) {
        snapX = t.cx - 24;
        snapY = t.cy - 24;
        t.el.classList.add("merge-cell--magnetic-lock");
      } else {
        t.el.classList.remove("merge-cell--magnetic-lock");
      }
    }

    const dx = e.clientX - (_dragState.lastX || e.clientX);
    _dragState.lastX = e.clientX;
    const tilt = Math.max(-12, Math.min(12, dx * 0.7));

    _dragState.ghost.style.transform = `translate3d(${snapX}px, ${snapY}px, 0) scale(1.15) rotate(${tilt}deg)`;
  });
}

function _onPointerUp(e) {
  if (!_dragState || e.pointerId !== _dragState.pointerId) return;
  
  HUB.swipeBlocked = false;
  
  const ds = _dragState;
  _dragState = null;
  if (_dragSafetyTimer) {
    clearTimeout(_dragSafetyTimer);
    _dragSafetyTimer = null;
  }

  // Restore source cell
  ds.originCell.classList.remove("merge-cell--dragging");
  // Remove all match highlights and magnetic locks
  if (_boardEl) {
    _boardEl.querySelectorAll(".merge-cell--match-highlight").forEach((c) => {
      c.classList.remove("merge-cell--match-highlight");
      c.classList.remove("merge-cell--magnetic-lock");
    });
  }

  // Find drop target (hide ghost to avoid it being the target)
  ds.ghost.style.display = "none";
  const target = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest(".merge-cell");
  ds.ghost.style.display = "";

  if (target && target !== ds.originCell) {
    const toR = parseInt(target.dataset.row, 10);
    const toC = parseInt(target.dataset.col, 10);

    // Try merge (async)
    mergeItems(ds.fromR, ds.fromC, toR, toC).then((result) => {
      if (result.success) {
        // Pop + collide animation on target
        target.classList.add("merge-pop");
        target.classList.add("merge-collide"); // v7.2: flash burst
        target.addEventListener(
          "animationend",
          () => {
            if (HUB.currentScreen === 4) {
              target.classList.remove("merge-pop");
              target.classList.remove("merge-collide");
            }
          },
          { once: true },
        );
      }
    });

    // Remove ghost immediately (merge result renders async)
    ds.ghost.remove();
  } else {
    // Spring return: animate ghost back to origin cell
    const cellRect = ds.originCell.getBoundingClientRect();
    ds.ghost.style.transition =
      "transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)";
    ds.ghost.style.transform = `translate3d(${cellRect.left}px, ${cellRect.top}px, 0)`;
    ds.ghost.addEventListener("transitionend", () => ds.ghost.remove(), {
      once: true,
    });
    // Fallback: remove after 500ms if transitionend doesn't fire
    setTimeout(() => {
      if (ds.ghost.parentNode) ds.ghost.remove();
    }, 500);
  }
}

/* ═══════════════════════════════════════════════════
 *  Generator Panel
 * ═══════════════════════════════════════════════════ */
let _genPanel = null;

function _renderGeneratorPanel() {
  _genPanel = document.getElementById("merge-generators");
  if (!_genPanel) return;
  const mergeState = GameStore.getState("merge");
  const res = GameStore.getState("resources");
  if (!mergeState) return;

  _genPanel.textContent = "";

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
      btn.title = `Costs 1⚡ + 1 crop → ${chain.name} items`;
    }

    btn.addEventListener("click", () => _tapWithFuel(chainId));
    genRow.appendChild(btn);

    // Fuel slot badge (shows currently selected crop)
    const fuelCrop = _selectedFuel[chainId];
    if (fuelCrop && !onCooldown) {
      const cfg = CROPS[fuelCrop];
      const harvested = res?.harvested || {};
      const qty = harvested[fuelCrop] || 0;
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

  // Gacha button (with token count inline)
  const tokenCount = res?.gachaTokens || 0;
  const gachaBtn = document.createElement("button");
  gachaBtn.className = "merge-gen-btn merge-gacha-btn";
  gachaBtn.textContent = `🎰 Gacha (${tokenCount}/${ECONOMY.GACHA_PULL_COST})`;
  gachaBtn.title = `Spend ${ECONOMY.GACHA_PULL_COST} Gacha Tokens`;
  gachaBtn.disabled = tokenCount < ECONOMY.GACHA_PULL_COST;
  gachaBtn.addEventListener("click", rollGacha);
  toolsRow.appendChild(gachaBtn);

  // Free pull button
  const mergeData = GameStore.getState("merge");
  const lastPull = mergeData?.lastFreePull || 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastStr = new Date(lastPull).toISOString().slice(0, 10);
  const canFreePull = lastStr !== todayStr;

  const freeBtn = document.createElement("button");
  freeBtn.className = "merge-gen-btn merge-free-btn";
  freeBtn.textContent = canFreePull ? "🎁 Free" : "🎁 Used";
  freeBtn.disabled = !canFreePull;
  freeBtn.addEventListener("click", freePull);
  toolsRow.appendChild(freeBtn);

  // Trash toggle
  const trashBtn = document.createElement("button");
  trashBtn.className = `merge-gen-btn merge-trash-btn${_trashMode ? " active" : ""}`;
  trashBtn.textContent = "🗑️";
  trashBtn.title = "Click items on board to remove them";
  trashBtn.addEventListener("click", () => {
    _trashMode = !_trashMode;
    trashBtn.classList.toggle("active", _trashMode);
    if (_boardEl) _boardEl.classList.toggle("trash-mode", _trashMode);
  });
  toolsRow.appendChild(trashBtn);

  _genPanel.appendChild(toolsRow);
}

/* ─── Crop Picker Modal for Generator Tap ─── */
function _showCropPicker(chainId) {
  const res = GameStore.getState("resources");
  const harvested = res?.harvested || {};
  const cropIds = Object.keys(harvested).filter((id) => harvested[id] > 0);

  if (cropIds.length === 0) {
    showToast("🌱 No harvested crops! Grow some on the farm first.", "error");
    return;
  }

  // Native <dialog> — consistent with project convention (v4.14+)
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
    btn.textContent = `${cfg.emoji} ${cfg.name} (×${harvested[cropId]}) [${tier}]`;
    btn.addEventListener("click", () => {
      dialog.close();
      _selectedFuel[chainId] = cropId; // Remember fuel choice
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
  // v6.2.0: Backdrop click-to-close (prevents invisible backdrop trapping all clicks)
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  safeShowModal(dialog);
}

/* ─── Fuel Slot: 1-click tap with remembered crop ─── */
function _tapWithFuel(chainId) {
  const fuelCrop = _selectedFuel[chainId];
  const res = GameStore.getState("resources");
  const harvested = res?.harvested || {};

  // If we have a remembered fuel and stock > 0, tap immediately
  if (fuelCrop && harvested[fuelCrop] && harvested[fuelCrop] > 0) {
    tapGenerator(chainId, fuelCrop);
    return;
  }
  // Otherwise show picker (first time or fuel exhausted)
  _showCropPicker(chainId);
}

/* ─── Idle Hint Timer (7s) ─── */
function _resetIdleHintTimer() {
  if (_idleHintTimer) clearTimeout(_idleHintTimer);
  // Remove previous hints
  if (_boardEl)
    _boardEl
      .querySelectorAll(".merge-cell--hint")
      .forEach((c) => c.classList.remove("merge-cell--hint"));
  _idleHintTimer = setTimeout(_showIdleHint, IDLE_HINT_DELAY);
}

function _showIdleHint() {
  const mergeState = GameStore.getState("merge");
  if (!mergeState || !_boardEl) return;
  // Find first mergeable pair
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const item = mergeState.board[r]?.[c];
      if (!item) continue;
      const info = ITEM_LOOKUP[item.id];
      if (!info || !info.nextId) continue; // skip max level
      // Search for match
      for (let r2 = 0; r2 < BOARD_ROWS; r2++) {
        for (let c2 = 0; c2 < BOARD_COLS; c2++) {
          if (r2 === r && c2 === c) continue;
          const other = mergeState.board[r2]?.[c2];
          if (other && other.id === item.id) {
            // Found a pair — wiggle both cells
            _cells[r][c].classList.add("merge-cell--hint");
            _cells[r2][c2].classList.add("merge-cell--hint");
            return; // Only hint one pair at a time
          }
        }
      }
    }
  }
}

/* ═══════════════════════════════════════════════════
 *  Init & Lifecycle
 * ═══════════════════════════════════════════════════ */
function init() {
  registerSlice();
  createBoardDOM();
  _renderGeneratorPanel();

  // Subscribe to merge state changes
  // v6.2.1: split board vs panel subscription — panel only re-renders when
  // generatorState/generators/lastFreePull changes (not on every drag/merge)
  let _prevGenState = null;
  GameStore.subscribe("merge", (prev, next) => {
    _renderBoard();
    const nextGenKey = JSON.stringify({
      g: next?.generators,
      gs: next?.generatorState,
      lp: next?.lastFreePull,
    });
    if (nextGenKey !== _prevGenState) {
      _prevGenState = nextGenKey;
      _renderGeneratorPanel();
    }
  });

  // Periodically refresh cooldown timers (stored for cleanup in onLeave)
  _cooldownTimer = setInterval(() => {
    if (document.hidden) return; // skip when tab is backgrounded
    const mergeState = GameStore.getState("merge");
    if (!mergeState) return;
    for (const chainId of mergeState.generators) {
      const gs = mergeState.generatorState?.[chainId];
      if (gs && gs.cooldownEnd > 0 && gs.cooldownEnd <= Date.now()) {
        // Cooldown expired — refresh display
        gs.tapsLeft = ECONOMY.GENERATOR_TAP_LIMIT;
        gs.cooldownEnd = 0;
        _renderGeneratorPanel();
        break;
      }
    }
  }, 10000); // Check every 10s
}

async function onEnter() {
  // Fetch latest merge + resource state from server
  try {
    const data = await api("/api/merge/state", { userId: HUB.userId });
    if (data?.merge) GameStore.setState("merge", data.merge);
    if (data?.resources) {
      GameStore.setState("resources", data.resources);
      HUD.updateDisplay(data.resources);
    }
  } catch {
    // Use cached state
  }
  _renderBoard();
  _renderGeneratorPanel();
}

/** v6.2.1: Clean up timers when leaving the merge screen */
function onLeave() {
  if (_idleHintTimer) {
    clearTimeout(_idleHintTimer);
    _idleHintTimer = null;
  }
  // Clear any lingering match-highlight from an interrupted drag
  _forceCleanupDrag();
}

/* ═══════════════════════════════════════════════════
 *  Public API
 * ═══════════════════════════════════════════════════ */
export const MergeGame = {
  init,
  onEnter,
  onLeave,
  tapGenerator,
  mergeItems,
  rollGacha,
  freePull,
  trashMergeItem,
};
