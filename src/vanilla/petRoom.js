/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Pet Room Client (v8.0)
 *  4×4 decoration grid, theme selector, opened from pet profile
 * ═══════════════════════════════════════════════════════
 */
import { api, showToast, HUB } from "./shared.js";
import { ROOM_DECORATIONS, ROOM_THEMES } from "/game-logic.js";

let _roomPanel = null;
let _roomData = null;
let _isOpen = false;

const ROOM_ROWS = 4;
const ROOM_COLS = 4;

/** Open the pet room panel */
export async function openRoom() {
  if (_isOpen) {
    closeRoom();
    return;
  }
  _isOpen = true;

  // Fetch room state
  const res = await api("/api/pet/room/state", { userId: HUB.userId });
  if (res?.error) {
    showToast("❌ Could not load room", "error");
    _isOpen = false;
    return;
  }
  _roomData = res.room;
  _renderRoom();
}

/** Close the room panel */
export function closeRoom() {
  _isOpen = false;
  if (_roomPanel) {
    _roomPanel.style.animation = "roomPanelOut 0.3s ease forwards";
    setTimeout(() => {
      _roomPanel.remove();
      _roomPanel = null;
    }, 300);
  }
}

/** Render the full room panel */
function _renderRoom() {
  if (_roomPanel) _roomPanel.remove();

  _roomPanel = document.createElement("div");
  _roomPanel.className = "pet-room-panel";
  _roomPanel.innerHTML = `
    <div class="pet-room-card">
      <div class="pet-room-header">
        <span class="pet-room-title">🏠 Pet Room</span>
        <button class="pet-room-close" title="Close">✕</button>
      </div>
      <div class="pet-room-grid-wrap">
        <div class="pet-room-grid" id="pet-room-grid"></div>
      </div>
      <div class="pet-room-theme-bar" id="pet-room-themes"></div>
      <div class="pet-room-inventory" id="pet-room-inv"></div>
    </div>
  `;

  document.body.appendChild(_roomPanel);

  // Close button
  _roomPanel
    .querySelector(".pet-room-close")
    .addEventListener("click", closeRoom);

  // Backdrop click to close
  _roomPanel.addEventListener("click", (e) => {
    if (e.target === _roomPanel) closeRoom();
  });

  // Apply current theme background
  _applyTheme();
  _renderGrid();
  _renderThemeBar();
  _renderInventory();
}

/** Apply room theme to grid wrapper */
function _applyTheme() {
  const wrap = _roomPanel?.querySelector(".pet-room-grid-wrap");
  if (!wrap) return;
  const theme =
    ROOM_THEMES.find((t) => t.id === (_roomData?.wallpaper || "default")) ||
    ROOM_THEMES[0];
  wrap.style.background = theme.wallGradient;
}

/** Render the 4×4 grid */
function _renderGrid() {
  const grid = document.getElementById("pet-room-grid");
  if (!grid) return;
  grid.innerHTML = "";

  for (let r = 0; r < ROOM_ROWS; r++) {
    for (let c = 0; c < ROOM_COLS; c++) {
      const key = `${r}_${c}`;
      const itemId = _roomData?.decorations?.[key] || null;
      const deco = itemId ? ROOM_DECORATIONS[itemId] : null;

      const cell = document.createElement("div");
      cell.className = `pet-room-cell${deco ? " filled" : ""}`;
      cell.dataset.row = r;
      cell.dataset.col = c;

      if (deco) {
        cell.innerHTML = `<span class="room-cell-emoji">${deco.emoji}</span>`;
        cell.title = `${deco.name} — click to remove`;
        cell.addEventListener("click", () => _removeDecoration(r, c));
      } else {
        cell.title = "Empty — drop a decoration here";
        // Drop target
        cell.addEventListener("dragover", (e) => {
          e.preventDefault();
          cell.classList.add("drop-hover");
        });
        cell.addEventListener("dragleave", () =>
          cell.classList.remove("drop-hover"),
        );
        cell.addEventListener("drop", (e) => {
          e.preventDefault();
          cell.classList.remove("drop-hover");
          const dragItemId = e.dataTransfer.getData("text/plain");
          if (dragItemId) _placeDecoration(dragItemId, r, c);
        });
      }

      grid.appendChild(cell);
    }
  }
}

/** Render theme selector bar */
function _renderThemeBar() {
  const bar = document.getElementById("pet-room-themes");
  if (!bar) return;
  bar.innerHTML = "";

  for (const theme of ROOM_THEMES) {
    const btn = document.createElement("button");
    btn.className = `room-theme-btn${_roomData?.wallpaper === theme.id ? " active" : ""}`;
    btn.textContent = `${theme.emoji} ${theme.name}`;
    btn.title = theme.name;
    btn.addEventListener("click", () => _setTheme(theme.id));
    bar.appendChild(btn);
  }
}

/** Render inventory of owned decorations */
function _renderInventory() {
  const inv = document.getElementById("pet-room-inv");
  if (!inv) return;

  const items = _roomData?.inventory || [];
  if (items.length === 0) {
    inv.innerHTML = `<div class="room-inv-empty">No decorations yet — merge wood items to unlock!</div>`;
    return;
  }

  // Filter to unplaced items
  const placedIds = new Set(Object.values(_roomData?.decorations || {}));

  inv.innerHTML = `<div class="room-inv-title">📦 Decorations</div>`;
  const grid = document.createElement("div");
  grid.className = "room-inv-grid";

  for (const itemId of items) {
    const deco = ROOM_DECORATIONS[itemId];
    if (!deco) continue;
    const isPlaced = placedIds.has(itemId);

    const item = document.createElement("div");
    item.className = `room-inv-item${isPlaced ? " placed" : ""}`;
    item.draggable = !isPlaced;
    item.title = isPlaced
      ? `${deco.name} (placed)`
      : `${deco.name} — drag to grid`;
    item.innerHTML = `
      <span class="room-inv-emoji">${deco.emoji}</span>
      <span class="room-inv-name">${deco.name}</span>
      ${isPlaced ? '<span class="room-inv-badge">✓</span>' : ""}
    `;

    if (!isPlaced) {
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", itemId);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
    }

    grid.appendChild(item);
  }

  inv.appendChild(grid);
}

/** Place decoration via API */
async function _placeDecoration(itemId, row, col) {
  const res = await api("/api/pet/room/place", {
    userId: HUB.userId,
    itemId,
    row,
    col,
  });
  if (res?.success) {
    _roomData = res.room;
    _renderGrid();
    _renderInventory();
    showToast(`🪑 Decoration placed!`, "success");
  } else {
    showToast(res?.error || "Failed to place decoration", "error");
  }
}

/** Remove decoration via API */
async function _removeDecoration(row, col) {
  const res = await api("/api/pet/room/remove", {
    userId: HUB.userId,
    row,
    col,
  });
  if (res?.success) {
    _roomData = res.room;
    _renderGrid();
    _renderInventory();
    showToast("🗑️ Decoration removed", "info");
  }
}

/** Change room theme via API */
async function _setTheme(themeId) {
  const res = await api("/api/pet/room/theme", { userId: HUB.userId, themeId });
  if (res?.success) {
    _roomData = res.room;
    _applyTheme();
    _renderThemeBar();
    showToast("🎨 Theme changed!", "success");
  }
}
