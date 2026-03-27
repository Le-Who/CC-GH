import { GameStore } from "../store.js";
import { HUB } from "../shared.js";
import { BOARD_ROWS, BOARD_COLS, ITEM_LOOKUP } from "./engine.js";
import { trashMergeItem, mergeItems } from "./api.js";

/* ─── State ─── */
let _cells = []; 
let _boardEl = null;
let _dragState = null;
let _trashMode = false;
let _cachedMatchTargets = [];
let _idleHintTimer = null;
let _dragSafetyTimer = null;
const IDLE_HINT_DELAY = 7000;
const DRAG_SAFETY_TIMEOUT = 5000;

export function isTrashMode() {
  return _trashMode;
}

export function toggleTrashMode() {
  _trashMode = !_trashMode;
  if (_boardEl) _boardEl.classList.toggle("trash-mode", _trashMode);
  return _trashMode;
}

/* ─── Event Listeners ─── */
document.addEventListener("merge:gacha-drop", _animateGachaDrop);

export function handleLeave() {
  if (_idleHintTimer) {
    clearTimeout(_idleHintTimer);
    _idleHintTimer = null;
  }
  _cachedMatchTargets = [];
  if (_dragState) {
    if (_dragState.ghost) _dragState.ghost.remove();
    if (_dragState.originCell) _dragState.originCell.classList.remove("merge-cell--dragging");
    _dragState = null;
  }
  if (_dragSafetyTimer) {
    clearTimeout(_dragSafetyTimer);
    _dragSafetyTimer = null;
  }
  _forceCleanupDrag();
}

/* ─── Board Lifecycle ─── */
export function createBoardDOM() {
  _boardEl = document.getElementById("merge-board");
  if (!_boardEl) return;

  _boardEl.textContent = "";
  _cells = [];

  for (let r = 0; r < BOARD_ROWS; r++) {
    _cells[r] = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "merge-cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell._cachedState = "empty"; // Vercel js-batch-dom-css Dirty Check init
      _boardEl.appendChild(cell);
      _cells[r][c] = cell;
    }
  }

  _boardEl.addEventListener("pointerdown", _onPointerDown);
  document.addEventListener("pointermove", _onPointerMove);
  document.addEventListener("pointerup", _onPointerUp);
  document.addEventListener("pointercancel", _onPointerUp);

  renderBoard();
}

export function renderBoard() {
  const mergeState = GameStore.getState("merge");
  if (!mergeState || !_boardEl) return;
  
  let isEmpty = true;
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const item = mergeState.board[r][c];
      if (item) isEmpty = false;
      _renderCell(r, c, item);
    }
  }
  
  // Empty-board onboarding hint
  let hint = _boardEl.querySelector(".merge-empty-hint");
  if (isEmpty && !hint) {
    hint = document.createElement("div");
    hint.className = "merge-empty-hint";
    hint.textContent = "🌱 Tap a generator below to start! Feed crops → get items → merge to level up";
    _boardEl.appendChild(hint);
  } else if (!isEmpty && hint) {
    hint.remove();
  }
  _resetIdleHintTimer();
}

function _renderCell(r, c, item) {
  const cell = _cells[r]?.[c];
  if (!cell) return;

  // OPTIMIZATION: Dirty checking to avoid VDOM writes
  const stateKey = item ? `${item.id}:${item.level}:${item.chainId}` : "empty";
  if (cell._cachedState === stateKey) return;
  cell._cachedState = stateKey;

  if (!item) {
    cell.textContent = "";
    cell.className = "merge-cell";
    cell.title = "";
    delete cell.dataset.level;
    delete cell.dataset.chain;
    return;
  }

  const info = ITEM_LOOKUP[item.id];
  cell.textContent = info ? info.emoji : "❓";
  cell.className = "merge-cell merge-item";
  cell.title = info ? `${info.name} (Lv${item.level + 1})` : item.id;
  cell.dataset.level = item.level;
  cell.dataset.chain = item.chainId;
}

function _animateGachaDrop() {
  if (!_boardEl) return;
  const cells = _boardEl.querySelectorAll(".merge-cell.merge-item");
  const items = Array.from(cells).slice(-3); // Last items implicitly
  items.forEach((cell, i) => {
    cell.classList.add("gacha-dropping");
    cell.style.animationDelay = `${i * 80}ms`;
    cell.addEventListener(
      "animationend",
      function handler() {
        if (HUB.currentScreen !== 4) return;
        cell.classList.remove("gacha-dropping");
        cell.classList.add("gacha-reveal");
        cell.addEventListener("animationend", () => {
          if (HUB.currentScreen === 4) cell.classList.remove("gacha-reveal");
        }, { once: true });
        cell.removeEventListener("animationend", handler);
      },
      { once: true }
    );
  });
}

function _resetIdleHintTimer() {
  if (_idleHintTimer) clearTimeout(_idleHintTimer);
  if (_boardEl) {
    _boardEl.querySelectorAll(".merge-cell--hint").forEach(c => c.classList.remove("merge-cell--hint"));
  }
  _idleHintTimer = setTimeout(_showIdleHint, IDLE_HINT_DELAY);
}

function _showIdleHint() {
  const mergeState = GameStore.getState("merge");
  if (!mergeState || !_boardEl) return;
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const item = mergeState.board[r]?.[c];
      if (!item) continue;
      const info = ITEM_LOOKUP[item.id];
      if (!info || !info.nextId) continue;
      for (let r2 = 0; r2 < BOARD_ROWS; r2++) {
        for (let c2 = 0; c2 < BOARD_COLS; c2++) {
          if (r2 === r && c2 === c) continue;
          const other = mergeState.board[r2]?.[c2];
          if (other && other.id === item.id) {
            _cells[r][c].classList.add("merge-cell--hint");
            _cells[r2][c2].classList.add("merge-cell--hint");
            return;
          }
        }
      }
    }
  }
}

/* ─── D&D System ─── */
function _forceCleanupDrag() {
  if (_dragSafetyTimer) {
    clearTimeout(_dragSafetyTimer);
    _dragSafetyTimer = null;
  }
  document.querySelectorAll(".merge-drag-ghost").forEach((g) => g.remove());
  if (_dragState?.originCell) _dragState.originCell.classList.remove("merge-cell--dragging");
  _cachedMatchTargets = [];
  if (_boardEl) {
    _boardEl.querySelectorAll(".merge-cell--match-highlight").forEach((c) => c.classList.remove("merge-cell--match-highlight"));
    _boardEl.querySelectorAll(".merge-cell--magnetic-lock").forEach((c) => c.classList.remove("merge-cell--magnetic-lock"));
  }
  HUB.swipeBlocked = false;
  _dragState = null;
}

function _onPointerDown(e) {
  _forceCleanupDrag();

  if (_trashMode) {
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

  const ghost = document.createElement("div");
  ghost.className = "merge-drag-ghost";
  ghost.textContent = cell.textContent;
  ghost.style.cssText = `
    position: fixed; left: 0; top: 0; pointer-events: none; z-index: 9999;
    --x: ${Math.round(e.clientX - 24)}px; --y: ${Math.round(e.clientY - 24)}px; --tilt: 0deg;
    transform: translate3d(var(--x), var(--y), 0) scale(1.15) rotate(var(--tilt));
    will-change: transform; font-size: 2rem; width: 48px; height: 48px;
    justify-content: center; border-radius: 12px; background: rgba(255,255,255,0.2);
    opacity: 0.9; box-shadow: 0 16px 32px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.4);
    transition: transform 0.08s cubic-bezier(0.2, 0.8, 0.2, 1);
  `;
  document.body.appendChild(ghost);

  cell.classList.add("merge-cell--dragging");

  _dragState = {
    pointerId: e.pointerId, fromR: r, fromC: c, ghost, originCell: cell,
    lastX: e.clientX, lastY: e.clientY, cachedCSSX: e.clientX - 24, cachedCSSY: e.clientY - 24, cachedCSSTilt: 0,
  };

  _dragSafetyTimer = setTimeout(() => {
    if (_dragState) _forceCleanupDrag();
  }, DRAG_SAFETY_TIMEOUT);

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
          const rect = targetCell.getBoundingClientRect();
          _cachedMatchTargets.push({ el: targetCell, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
        }
      }
    }
  }

  HUB.swipeBlocked = true;
  e.preventDefault();
}

function _onPointerMove(e) {
  if (!_dragState || e.pointerId !== _dragState.pointerId) return;
  requestAnimationFrame(() => {
    if (!_dragState) return;
    let snapX = e.clientX - 24; let snapY = e.clientY - 24; const SNAP_RADIUS = 40;

    for (const t of _cachedMatchTargets) {
      const dist = Math.hypot(e.clientX - t.cx, e.clientY - t.cy);
      if (dist < SNAP_RADIUS) {
        snapX = t.cx - 24; snapY = t.cy - 24;
        t.el.classList.add("merge-cell--magnetic-lock");
      } else {
        t.el.classList.remove("merge-cell--magnetic-lock");
      }
    }

    const dx = e.clientX - (_dragState.lastX || e.clientX);
    _dragState.lastX = e.clientX;
    const tilt = Math.max(-12, Math.min(12, dx * 0.7));

    if (Math.abs(snapX - _dragState.cachedCSSX) > 0.5 || Math.abs(snapY - _dragState.cachedCSSY) > 0.5 || Math.abs(tilt - _dragState.cachedCSSTilt) > 1.0) {
      _dragState.cachedCSSX = snapX; _dragState.cachedCSSY = snapY; _dragState.cachedCSSTilt = Math.round(tilt);
      _dragState.ghost.style.setProperty("--x", `${Math.round(snapX)}px`);
      _dragState.ghost.style.setProperty("--y", `${Math.round(snapY)}px`);
      _dragState.ghost.style.setProperty("--tilt", `${Math.round(tilt)}deg`);
    }
  });
}

function _onPointerUp(e) {
  if (!_dragState || e.pointerId !== _dragState.pointerId) return;
  HUB.swipeBlocked = false;
  const ds = _dragState;
  
  ds.originCell.classList.remove("merge-cell--dragging");
  if (_boardEl) {
    _boardEl.querySelectorAll(".merge-cell--match-highlight").forEach((c) => {
      c.classList.remove("merge-cell--match-highlight");
      c.classList.remove("merge-cell--magnetic-lock");
    });
  }

  ds.ghost.style.display = "none";
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".merge-cell");
  ds.ghost.style.display = "";

  if (target && target !== ds.originCell) {
    const toR = parseInt(target.dataset.row, 10);
    const toC = parseInt(target.dataset.col, 10);
    mergeItems(ds.fromR, ds.fromC, toR, toC).then((result) => {
      if (result.success) {
        target.classList.add("merge-pop");
        target.classList.add("merge-collide");
        target.addEventListener("animationend", () => {
          if (HUB.currentScreen === 4) { target.classList.remove("merge-pop"); target.classList.remove("merge-collide"); }
        }, { once: true });
      }
    });
    ds.ghost.remove();
  } else {
    const cellRect = ds.originCell.getBoundingClientRect();
    ds.ghost.style.transition = "transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)";
    ds.ghost.style.setProperty("--x", `${Math.round(cellRect.left)}px`);
    ds.ghost.style.setProperty("--y", `${Math.round(cellRect.top)}px`);
    ds.ghost.style.setProperty("--tilt", `0deg`);
    ds.ghost.addEventListener("transitionend", () => ds.ghost.remove(), { once: true });
    setTimeout(() => { if (ds.ghost.parentNode) ds.ghost.remove(); }, 500);
  }
  _forceCleanupDrag(); // Clean up state refs
}
