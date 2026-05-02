# Telegram Miniapp Game UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current CC-GH Telegram Mini App games into a coherent, touch-first, reliable game hub while preserving existing gameplay contracts.

**Architecture:** Add shared game capabilities, adaptive HUD descriptors, reliable action plumbing, Telegram navigation/close behavior, and a common event feedback layer before changing individual games. Then apply focused per-game improvements in a dependency-safe order, keeping Garden tap compatibility, moving Bubbo Finish into pause, and leaving hidden Farm code unless measurement proves removal helps.

**Tech Stack:** React 19, Vite 7, PixiJS 8, `@telegram-apps/sdk` 3.11.8, Zustand, Express 5, Node 24, Playwright, Node test runner.

---

## Implementation Status

Implemented on 2026-05-02 in the coordinated pass requested by this plan.

Shipped scope:

- Shared game registry, adaptive HUD descriptors, transient event feedback, receipt-backed reliable action helpers, Telegram Back Button routing, and closing confirmation.
- Stable Pixi scene split under `src/game-runtime/scenes/` while preserving the `src/game-runtime/scenes.js` export contract.
- Garden explicit plant details affordance with normal tap behavior preserved, Blox optimistic placement/line-clear preview, Gem Crush snapshot-first restore plus event feedback, Merge server-clock/source-chip/trash-confirm polish, Bubbo pause-only finish plus pressure/resume/aim-assist cues, Trivia real elapsed answer timing/reveal phase, and Cozy Yard activity-pill/tool-drawer placement clarity.
- Conservative perf loop kept app-shell motion removal, lazy Telegram SDK loading, and Merge hydration null fast path; it stopped after three consecutive rejected/sub-threshold attempts.

Validation snapshot:

- `pnpm test`
- `pnpm run build`
- `pnpm run perf:guard -- --suite player.build-snapshot,blox.place-piece,match3.resolve-valid-swap,merge.apply-generator,bubbo.apply-shot --repeat 2`
- `pnpm run perf:guard -- --repeat 3`
- `pnpm run perf:guard:build`
- `pnpm run perf:guard:browser`

Detailed loop evidence is recorded in `docs/PERF_GUARD.md`.

---

## Scope Decisions

- Implement this as one coordinated pass, not separate speculative redesigns.
- Preserve server-authoritative contracts in `routes/player.js`.
- Keep Merge free taps, Essence, Exchange, and generated/runtime asset contracts intact.
- Keep Garden plant tapping compatible. New plant affordances must not steal ordinary tap-to-grow or tap-to-harvest behavior.
- Reduce Garden decorative overdraw slightly only. Do not change the Garden art direction or force dark mode.
- Move Bubbo Finish to pause menu. Do not keep it as a live shot HUD control.
- Farm stays hidden unless import graph, bundle, or runtime checks show a real benefit from removal.
- Do not loosen performance budgets.
- Do not commit during execution unless the user explicitly asks. Use test checkpoints and `git diff --check` between phases.

## File Structure

Create:

- `src/app/gameRegistry.js`: static game metadata and capability map.
- `src/app/useGameHudDescriptors.js`: maps active game + snapshot + local run state into HUD descriptors.
- `src/platform/useTelegramGameNavigation.js`: Back Button and closing confirmation behavior.
- `src/game-state/reliableActions.js`: shared client action id and reliability helpers.
- `src/game-state/gameEvents.js`: small event ledger for reward/status/error feedback.
- `src/game-runtime/scenes/shared/layout.js`: moved Pixi layout helpers.
- `src/game-runtime/scenes/bloxScene.js`: Blox Pixi builder.
- `src/game-runtime/scenes/match3Scene.js`: Match-3 Pixi builder.
- `src/game-runtime/scenes/mergeScene.js`: Merge Pixi builder.
- `src/game-runtime/scenes/bubboScene.js`: Bubbo Pixi builder.
- `src/game-runtime/scenes/farmScene.js`: hidden Farm Pixi builder if Farm remains.
- `src/games/merge/useServerClock.js`: server-derived client clock for Merge cooldown labels.
- `src/games/trivia/useQuestionTimer.js`: real elapsed answer timing.

Modify:

- `src/App.jsx`: use adaptive descriptors, game registry, Telegram navigation hook.
- `src/app/shell.jsx`: expose pause menu extension point and shared event overlay if needed.
- `src/game-state/useGameHub.js`: add `performReliableAction`, reuse Yard outbox where durable retry is safe.
- `src/game-runtime/scenes.js`: turn into stable re-export entrypoint.
- `src/games/garden-shelf/components/Garden.tsx`: compatible focused-plant affordance.
- `src/games/garden-shelf/GardenShelfGame.tsx`: slightly reduce mobile overdraw class/flag.
- `src/games/garden-shelf/garden-shelf.css`: lightweight mobile decorative adjustments.
- `src/games/blox/BloxGame.jsx`: optimistic placement and predicted line clear state.
- `src/games/match3/Match3Game.jsx`: snapshot-first run restore, timer/cascade event feedback.
- `src/games/merge/MergeGame.jsx`: generator chips, server clock, safer trash affordance.
- `src/games/bubbo/BubboGame.jsx`: pause-only Finish, resume banner, pressure label, optional aim assist flag.
- `src/games/trivia/TriviaGame.jsx`: real timing, reveal phase, shared shell alignment.
- `src/games/companion-yard/CompanionYardGame.jsx`: reduced permanent HUD, activity pill, placement overlay.
- `src/games/companion-yard/companion-yard.css`: Yard HUD and placement overlay styles.
- `tests/*.test.js` and `tests/e2e/*.spec.js`: focused coverage for new contracts.
- `docs/TELEGRAM_MINIAPP_GAME_UX_AUDIT.md`: keep it aligned with final implementation decisions.

## Best One-Try Implementation Order

1. Baseline and Farm import/perf audit.
2. Shared registry/HUD/events/reliable actions/navigation.
3. Mechanical Pixi scene split.
4. Garden low-risk compatibility changes.
5. Blox and Match-3 run feedback.
6. Merge economy/control polish.
7. Bubbo pause/resume/pressure changes.
8. Trivia timing/shell changes.
9. Yard HUD/placement clarity.
10. Farm remove-or-leave decision based on measured evidence.
11. Full validation and documentation update.

This order keeps shared contracts available before per-game work and postpones the Farm decision until after evidence is collected.

---

## Task 0: Baseline, Worktree, and Farm Evidence

**Files:**

- Read: `src/App.jsx`
- Read: `src/app/gameChunks.jsx`
- Read: `src/game-runtime/LazyPixiSceneHost.jsx`
- Read: `src/game-runtime/scenes.js`
- Read: `src/games/farm/FarmGame.jsx`
- Read: `package.json`
- No source modifications in this task.

- [ ] **Step 1: Confirm visible tabs and hidden Farm status**

Run:

```powershell
rg -n "const TABS|farm|buildFarmScene|FarmGame" src/App.jsx src/app/gameChunks.jsx src/game-runtime/LazyPixiSceneHost.jsx src/game-runtime/scenes.js src/games/farm/FarmGame.jsx
```

Expected:

- `farm` is not in `TABS`.
- `buildFarmScene` still exists as a lazy scene option.
- `FarmGame.jsx` exists but is not a visible route.

- [ ] **Step 2: Capture baseline checks**

Run:

```powershell
pnpm test
pnpm run build
pnpm run perf:guard -- --suite player.build-snapshot,blox.place,match3.resolve,merge.apply-generator,bubbo.apply-shot --repeat 2
```

Expected:

- `pnpm test` exits `0`.
- `pnpm run build` exits `0`.
- `perf:guard` exits `0` without budget changes.

- [ ] **Step 3: Record Farm decision input**

Run:

```powershell
rg -n "farm|FarmGame|buildFarmScene|farm\\." src game-logic routes tests package.json
```

Expected:

- Use the output to decide later whether Farm has shipped runtime cost.
- Do not delete Farm in this task.

---

## Task 1: Game Registry and Adaptive HUD

**Files:**

- Create: `src/app/gameRegistry.js`
- Create: `src/app/useGameHudDescriptors.js`
- Modify: `src/App.jsx`
- Test: `tests/gameRegistry.test.js`

- [ ] **Step 1: Add registry tests**

Create or extend `tests/gameRegistry.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { GAME_REGISTRY, visibleGameIds, pixiGameIds } from "../src/app/gameRegistry.js";
import { buildGameHudDescriptors } from "../src/app/useGameHudDescriptors.js";

test("game registry exposes the visible Telegram Mini App games", () => {
  assert.deepEqual(visibleGameIds, ["garden", "blox", "match3", "merge", "bubbo", "trivia", "room"]);
  assert.deepEqual(pixiGameIds, ["blox", "match3", "merge", "bubbo"]);
  assert.equal(GAME_REGISTRY.farm.visible, false);
});

test("merge hud descriptors prioritize essence, free taps, and crop fuel", () => {
  const descriptors = buildGameHudDescriptors("merge", {
    merge: { alchemyEssence: 42, freeTapCharges: 7 },
    inventory: { cropsTotal: 13 },
  });

  assert.deepEqual(descriptors.map((item) => item.id), ["essence", "freeTaps", "fuel"]);
  assert.equal(descriptors[0].value, 42);
  assert.equal(descriptors[1].value, 7);
  assert.equal(descriptors[2].value, 13);
});

test("bubbo descriptors can use local run state over snapshot", () => {
  const descriptors = buildGameHudDescriptors(
    "bubbo",
    { bubbo: { currentGame: { score: 5 } } },
    { score: 120, pressureLabel: "Warning" },
  );

  assert.equal(descriptors.find((item) => item.id === "score").value, 120);
  assert.equal(descriptors.find((item) => item.id === "pressure").value, "Warning");
});
```

- [ ] **Step 2: Run the failing registry test**

Run:

```powershell
node --test tests/gameRegistry.test.js
```

Expected:

- Fails because `src/app/gameRegistry.js` and `src/app/useGameHudDescriptors.js` do not exist yet.

- [ ] **Step 3: Implement `src/app/gameRegistry.js`**

```js
export const GAME_REGISTRY = {
  garden: {
    id: "garden",
    label: "Garden Shelf",
    visible: true,
    runtime: "dom",
    shell: "tab",
    resources: ["gardenXp", "gold", "plants"],
    reliableActions: ["garden.sync", "garden.levelUp", "garden.goldDelta"],
  },
  blox: {
    id: "blox",
    label: "Building Blox",
    visible: true,
    runtime: "pixi",
    shell: "immersive",
    resources: ["score", "highScore", "lines"],
    reliableActions: ["blox.start", "blox.place", "blox.sync", "blox.end"],
  },
  match3: {
    id: "match3",
    label: "Gem Crush",
    visible: true,
    runtime: "pixi",
    shell: "immersive",
    resources: ["score", "movesOrTime", "combo"],
    reliableActions: ["match3.start", "match3.syncMode", "match3.end"],
  },
  merge: {
    id: "merge",
    label: "Alchemy Table",
    visible: true,
    runtime: "pixi",
    shell: "immersive",
    resources: ["essence", "freeTaps", "fuel", "cooldown"],
    reliableActions: ["merge.tap", "merge.merge", "merge.gacha", "merge.freePull", "merge.claimFreeTaps", "merge.exchange", "merge.trash"],
  },
  bubbo: {
    id: "bubbo",
    label: "Bubbo Bubbo",
    visible: true,
    runtime: "pixi",
    shell: "immersive",
    resources: ["score", "shotsOrTime", "pressure"],
    reliableActions: ["bubbo.start", "bubbo.sync", "bubbo.end"],
  },
  trivia: {
    id: "trivia",
    label: "Brain Blitz",
    visible: true,
    runtime: "dom",
    shell: "immersive",
    resources: ["question", "timer", "streak"],
    reliableActions: ["trivia.answer"],
  },
  room: {
    id: "room",
    label: "Cozy Yard",
    visible: true,
    runtime: "dom",
    shell: "immersive",
    resources: ["treats", "shinyTreats", "gifts", "visitors"],
    reliableActions: ["yard.buyFood", "yard.setFood", "yard.buyGoodie", "yard.placeGoodie", "yard.moveGoodie", "yard.pickupGoodie", "yard.fixGoodie", "yard.collectGifts", "yard.capturePhoto"],
  },
  farm: {
    id: "farm",
    label: "Cozy Farm",
    visible: false,
    runtime: "pixi",
    shell: "legacy",
    resources: ["crops", "seeds", "plots"],
    reliableActions: ["farm.plant", "farm.water", "farm.harvest", "farm.uproot", "farm.buySeeds"],
  },
};

export const visibleGameIds = Object.values(GAME_REGISTRY)
  .filter((game) => game.visible)
  .map((game) => game.id);

export const pixiGameIds = Object.values(GAME_REGISTRY)
  .filter((game) => game.visible && game.runtime === "pixi")
  .map((game) => game.id);

export function getGameDefinition(gameId) {
  return GAME_REGISTRY[gameId] || GAME_REGISTRY.room;
}
```

- [ ] **Step 4: Implement `src/app/useGameHudDescriptors.js`**

```js
import { useMemo } from "react";

export function buildGameHudDescriptors(activeTab, snapshot = {}, localState = {}) {
  if (activeTab === "garden") return null;

  if (activeTab === "merge") {
    const merge = snapshot.merge || {};
    return [
      { id: "essence", label: "Essence", value: Math.max(0, Number(merge.alchemyEssence) || 0) },
      { id: "freeTaps", label: "Free taps", value: Math.max(0, Number(merge.freeTapCharges) || 0) },
      { id: "fuel", label: "Fuel", value: Math.max(0, Number(snapshot.inventory?.cropsTotal) || 0) },
    ];
  }

  if (activeTab === "bubbo") {
    return [
      { id: "score", label: "Score", value: localState.score ?? snapshot.bubbo?.currentGame?.score ?? 0 },
      { id: "pressure", label: "Pressure", value: localState.pressureLabel || "Calm" },
    ];
  }

  if (activeTab === "room") {
    const yard = snapshot.yard || {};
    return [
      { id: "treats", label: "Treats", value: Math.max(0, Number(yard.currencies?.treats) || 0) },
      { id: "gifts", label: "Gifts", value: Array.isArray(yard.pendingGifts) ? yard.pendingGifts.length : 0 },
    ];
  }

  if (activeTab === "blox") {
    return [
      { id: "highScore", label: "Best", value: snapshot.blox?.highScore || 0 },
      { id: "lines", label: "Lines", value: localState.linesCleared || 0 },
    ];
  }

  if (activeTab === "match3") {
    return [
      { id: "highScore", label: "Best", value: snapshot.match3?.highScore || 0 },
      { id: "mode", label: "Mode", value: localState.mode || snapshot.match3?.currentGame?.mode || "Classic" },
    ];
  }

  if (activeTab === "trivia") {
    return [
      { id: "streak", label: "Streak", value: snapshot.trivia?.streak || localState.streak || 0 },
      { id: "timer", label: "Timer", value: localState.timerLabel || "Ready" },
    ];
  }

  return null;
}

export function useGameHudDescriptors(activeTab, snapshot, localState) {
  return useMemo(
    () => buildGameHudDescriptors(activeTab, snapshot, localState),
    [activeTab, localState, snapshot],
  );
}
```

- [ ] **Step 5: Wire descriptors into `src/App.jsx`**

Implementation rule:

- Keep existing Garden HUD logic as-is.
- For non-Garden tabs, prefer `useGameHudDescriptors(activeTab, snapshot, activeGameShell?.hudState)`.
- Do not remove existing topbar/stat layout; replace only the descriptor source.

- [ ] **Step 6: Verify**

Run:

```powershell
node --test tests/gameRegistry.test.js
pnpm test
```

Expected:

- `tests/gameRegistry.test.js` passes.
- Full test suite passes.

---

## Task 2: Reliable Actions and Game Events

**Files:**

- Create: `src/game-state/reliableActions.js`
- Create: `src/game-state/gameEvents.js`
- Modify: `src/game-state/useGameHub.js`
- Test: `tests/gameStore.test.js`

- [ ] **Step 1: Add focused helper tests**

Extend `tests/gameStore.test.js` or create a new focused test file if the store tests are already large:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { createClientActionId, shouldUseDurableOutbox } from "../src/game-state/reliableActions.js";

test("client action ids are stable and path-safe", () => {
  assert.equal(
    createClientActionId("blox.place", "run-1", ["piece 2", 3, 4]),
    "blox.place:run-1:piece_2:3:4",
  );
});

test("only configured weak-network actions use durable outbox", () => {
  assert.equal(shouldUseDurableOutbox("yard.placeGoodie"), true);
  assert.equal(shouldUseDurableOutbox("garden.sync"), true);
  assert.equal(shouldUseDurableOutbox("bubbo.sync"), false);
  assert.equal(shouldUseDurableOutbox("match3.syncMode"), false);
});
```

- [ ] **Step 2: Run failing tests**

```powershell
node --test tests/gameStore.test.js
```

Expected:

- Fails because `reliableActions.js` does not exist.

- [ ] **Step 3: Implement reliable action helpers**

```js
const DURABLE_OUTBOX_ACTIONS = new Set([
  "garden.sync",
  "garden.levelUp",
  "yard.buyFood",
  "yard.setFood",
  "yard.buyGoodie",
  "yard.placeGoodie",
  "yard.moveGoodie",
  "yard.pickupGoodie",
  "yard.fixGoodie",
  "yard.collectGifts",
  "yard.capturePhoto",
  "yard.favoritePhoto",
  "yard.setRemodel",
  "yard.buyExpansion",
  "yard.claimDailyLetter",
  "yard.configureCompanion",
]);

export function sanitizeActionPart(part) {
  return String(part ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function createClientActionId(action, scope, parts = []) {
  return [action, scope, ...parts]
    .map(sanitizeActionPart)
    .filter(Boolean)
    .join(":");
}

export function shouldUseDurableOutbox(action) {
  return DURABLE_OUTBOX_ACTIONS.has(String(action || ""));
}
```

- [ ] **Step 4: Implement event ledger**

```js
import { create } from "zustand";

const MAX_EVENTS = 8;

function makeEvent(event) {
  return {
    id: event.id || `${event.game || "hub"}:${event.type || "event"}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    ttlMs: event.ttlMs || 2200,
    tone: event.tone || "neutral",
    ...event,
  };
}

export const useGameEvents = create((set) => ({
  events: [],
  pushEvent: (event) => set((state) => ({
    events: [makeEvent(event), ...state.events].slice(0, MAX_EVENTS),
  })),
  dismissEvent: (id) => set((state) => ({
    events: state.events.filter((event) => event.id !== id),
  })),
  clearGameEvents: (game) => set((state) => ({
    events: state.events.filter((event) => event.game !== game),
  })),
}));
```

- [ ] **Step 5: Add `performReliableAction` to `useGameHub.js`**

Implementation rule:

```js
import { shouldUseDurableOutbox } from "./reliableActions.js";
```

Add a store method with this behavior:

```js
performReliableAction: async (action, options = {}) => {
  const {
    payload = {},
    key,
    clientActionId = key,
    durability = shouldUseDurableOutbox(action) ? "outbox" : "receipt",
    pendingLabel = action,
  } = options;

  if (durability === "outbox") {
    return get().enqueueYardAction(action, payload, {
      clientActionId,
      pendingLabel,
    });
  }

  return get().performAction(action, payload, {
    key: clientActionId || key || action,
    clientActionId,
  });
},
```

If `enqueueYardAction` currently only accepts Yard actions by name, either generalize its name to `enqueueDurableAction` or keep the internal implementation while allowing `garden.*` actions. The persisted outbox item shape must still include `action`, `payload`, and `clientActionId`.

- [ ] **Step 6: Verify**

```powershell
node --test tests/gameStore.test.js
pnpm test
```

Expected:

- Store tests pass.
- Existing Yard outbox behavior remains passing.

---

## Task 3: Telegram Back Button and Closing Confirmation

**Files:**

- Create: `src/platform/useTelegramGameNavigation.js`
- Modify: `src/App.jsx`
- Test: `tests/platform-cleanup.test.js`

- [ ] **Step 1: Add hook with defensive SDK calls**

```js
import { useEffect } from "react";
import { backButton, closingBehavior } from "@telegram-apps/sdk";

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function useTelegramGameNavigation({
  activeGame,
  hasOpenPanel,
  hasActiveRun,
  hasPendingActions,
  closePanel,
  pauseRun,
  exitToHub,
}) {
  useEffect(() => {
    return safeCall(() => {
      backButton.mount();
      if (activeGame && (hasOpenPanel || hasActiveRun)) backButton.show();
      else backButton.hide();

      const off = backButton.onClick(() => {
        if (hasOpenPanel) return closePanel?.();
        if (hasActiveRun) return pauseRun?.();
        return exitToHub?.();
      });

      return () => {
        off?.();
        backButton.hide();
      };
    });
  }, [activeGame, closePanel, exitToHub, hasActiveRun, hasOpenPanel, pauseRun]);

  useEffect(() => {
    safeCall(() => {
      closingBehavior.mount();
      if (hasActiveRun || hasPendingActions) closingBehavior.enableConfirmation();
      else closingBehavior.disableConfirmation();
    });
  }, [hasActiveRun, hasPendingActions]);
}
```

- [ ] **Step 2: Wire into `src/App.jsx`**

Use the current active game shell state:

```jsx
useTelegramGameNavigation({
  activeGame: activeTab,
  hasOpenPanel: Boolean(activeGameShell?.openPanel),
  hasActiveRun: Boolean(activeGameShell?.activeRun),
  hasPendingActions: Boolean(outboxStatus?.pendingCount),
  closePanel: activeGameShell?.closePanel,
  pauseRun: activeGameShell?.pause,
  exitToHub: () => setActiveTab("garden"),
});
```

If the current shell object uses different property names, add a small adapter in `App.jsx` rather than changing every game in this task.

- [ ] **Step 3: Verify cleanup behavior**

Run:

```powershell
node --test tests/platform-cleanup.test.js
pnpm test
```

Expected:

- Existing platform cleanup tests pass.
- No local browser errors when SDK calls are unavailable.

---

## Task 4: Mechanical Pixi Scene Split

**Files:**

- Create: `src/game-runtime/scenes/shared/layout.js`
- Create: `src/game-runtime/scenes/bloxScene.js`
- Create: `src/game-runtime/scenes/match3Scene.js`
- Create: `src/game-runtime/scenes/mergeScene.js`
- Create: `src/game-runtime/scenes/bubboScene.js`
- Create: `src/game-runtime/scenes/farmScene.js` if Farm remains available to `LazyPixiSceneHost`
- Modify: `src/game-runtime/scenes.js`
- Test: `tests/sceneGeometry.test.js`, `tests/blox.test.js`, `tests/match3.test.js`, `tests/bubbo.test.js`, `tests/merge.test.js`

- [ ] **Step 1: Move shared helpers first**

Move helpers such as `publishCanvasLayout`, `fit`, `fitWithTopReserve`, `fitGrid`, `cellFromPoint`, and `match3TargetFromGesture` into `src/game-runtime/scenes/shared/layout.js`.

Export them without behavior changes:

```js
export function publishCanvasLayout(container, layout) {
  container.dataset.boardX = String(Math.round(layout.x));
  container.dataset.boardY = String(Math.round(layout.y));
  container.dataset.boardCell = String(Math.round(layout.cell));
}
```

Use the real existing bodies from `scenes.js`; this snippet shows the expected export shape only.

- [ ] **Step 2: Move each builder into its own file**

Move the existing builder bodies without changing behavior:

```js
// src/game-runtime/scenes/bloxScene.js
export function buildBloxScene(app, state) {
  // Use the exact current body from buildBloxScene.
}
```

Repeat for Match-3, Merge, Bubbo, and Farm if retained.

- [ ] **Step 3: Keep `src/game-runtime/scenes.js` as stable public API**

```js
export { buildFarmScene } from "./scenes/farmScene.js";
export { buildBloxScene } from "./scenes/bloxScene.js";
export { buildMatch3Scene } from "./scenes/match3Scene.js";
export { buildBubboScene } from "./scenes/bubboScene.js";
export { buildMergeScene } from "./scenes/mergeScene.js";
```

- [ ] **Step 4: Verify mechanical split**

Run:

```powershell
node --test tests/sceneGeometry.test.js tests/blox.test.js tests/match3.test.js tests/bubbo.test.js tests/merge.test.js
pnpm run build
```

Expected:

- Same behavior as before the split.
- Build succeeds.

---

## Task 5: Garden Shelf Compatible Plant Affordance and Slight Mobile Overdraw Reduction

**Files:**

- Modify: `src/games/garden-shelf/components/Garden.tsx`
- Modify: `src/games/garden-shelf/GardenShelfGame.tsx`
- Modify: `src/games/garden-shelf/garden-shelf.css`
- Test: `tests/e2e/garden-shelf.spec.js`

- [ ] **Step 1: Add E2E expectations**

Extend `tests/e2e/garden-shelf.spec.js` with two checks:

```js
test("focused plant details button does not block normal plant tap", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Garden/i }).click();

  const plant = page.locator("[data-garden-plant]").first();
  await plant.tap();

  await expect(page.locator("[data-plant-details-button]")).toBeVisible();

  const before = await page.locator("[data-garden-xp]").textContent();
  await plant.tap();
  const after = await page.locator("[data-garden-xp]").textContent();

  expect(after).not.toEqual(before);
});

test("garden uses reduced decorative overdraw class on narrow mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Garden/i }).click();
  await expect(page.locator(".garden-root")).toHaveClass(/garden-root--mobile-lite/);
});
```

Adapt selectors to existing test helpers if the file already uses localized labels.

- [ ] **Step 2: Implement non-blocking plant details button**

In `Garden.tsx`, add a focused plant overlay that is outside the sprite tap hit zone:

```tsx
{isFocused && (
  <button
    type="button"
    className="plant-details-button"
    data-plant-details-button
    aria-label={t("garden.openPlantDetails")}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      openPlantDetails(plant.id);
    }}
  >
    i
  </button>
)}
```

Important:

- Do not attach this button over the plant sprite center.
- Do not replace the current plant `onClick` / tap handler.
- The plant tap path must still trigger growth/harvest behavior.

- [ ] **Step 3: Add data attributes for reliable tests**

Add:

```tsx
data-garden-plant
data-plant-id={plant.id}
```

on the existing plant tap target, and:

```tsx
data-garden-xp
```

on the XP display surface used by the E2E test.

- [ ] **Step 4: Slightly reduce mobile decorative overdraw**

In `GardenShelfGame.tsx`, compute a mobile-lite flag:

```tsx
const mobileLiteDecor = typeof window !== "undefined"
  && window.matchMedia?.("(max-width: 520px), (prefers-reduced-motion: reduce)")?.matches;
```

Apply:

```tsx
className={cn("garden-root", mobileLiteDecor && "garden-root--mobile-lite")}
```

In `garden-shelf.css`, reduce only expensive decoration:

```css
.garden-root--mobile-lite .garden-ambient-blob,
.garden-root--mobile-lite .garden-sparkle-layer {
  opacity: 0.35;
  filter: blur(10px);
}

.garden-root--mobile-lite .garden-floating-decoration {
  animation-duration: 18s;
}
```

Use the real existing decorative class names. Do not change plant sprites, shelves, sign, or core Garden palette.

- [ ] **Step 5: Verify**

```powershell
pnpm exec playwright test tests/e2e/garden-shelf.spec.js --project="Mobile Chrome" --workers=1
pnpm test
```

Expected:

- Focused details affordance is visible.
- Plant tapping still changes plant/XP state.
- Mobile-lite decorative class is present only on small/reduced-motion contexts.

---

## Task 6: Building Blox Optimistic Placement and Predicted Clears

**Files:**

- Modify: `src/games/blox/BloxGame.jsx`
- Modify: `src/game-core/blox/engine.js` or `game-logic/blox-engine.js` if preview helper belongs in shared logic
- Modify: `src/game-runtime/scenes/bloxScene.js`
- Test: `tests/blox.test.js`
- Test: `tests/useBloxEngine.test.js`

- [ ] **Step 1: Add preview helper test**

```js
test("blox placement preview returns line clear count without mutating source state", () => {
  const state = createInitialBloxStateForTest();
  const before = JSON.stringify(state);
  const preview = previewBloxPlacement(state, { pieceIndex: 0, row: 0, col: 0 });

  assert.equal(JSON.stringify(state), before);
  assert.equal(typeof preview.valid, "boolean");
  assert.equal(typeof preview.linesCleared, "number");
});
```

Use existing test factories in `tests/blox.test.js` if present.

- [ ] **Step 2: Implement preview helper**

```js
export function previewBloxPlacement(state, placement) {
  const next = cloneBloxState(state);
  const result = applyBloxPlacement(next, placement);
  if (!result.ok) {
    return { valid: false, reason: result.error || "invalid", linesCleared: 0, state };
  }
  return {
    valid: true,
    reason: "",
    linesCleared: result.linesCleared || 0,
    state: next,
  };
}
```

Use existing engine names if `applyBloxPlacement` / `cloneBloxState` differ.

- [ ] **Step 3: Use optimistic state in `BloxGame.jsx`**

```jsx
const [optimisticState, setOptimisticState] = useState(null);
const visibleState = optimisticState || savedState;

const handleDrop = useCallback(async (placement) => {
  const preview = previewBloxPlacement(savedState, placement);
  if (!preview.valid) {
    pushEvent({ game: "blox", type: "invalid", title: "No fit", tone: "warning" });
    return;
  }

  setOptimisticState(preview.state);
  const result = await performReliableAction("blox.place", {
    payload: placement,
    clientActionId: createClientActionId("blox.place", savedState.runId || "active", [
      placement.pieceIndex,
      placement.row,
      placement.col,
      savedState.turn || 0,
    ]),
  });

  if (result?.error) {
    setOptimisticState(null);
    pushEvent({ game: "blox", type: "error", title: result.error, tone: "warning" });
    return;
  }

  setOptimisticState(null);
}, [performReliableAction, pushEvent, savedState]);
```

- [ ] **Step 4: Show predicted line clears in Pixi scene**

Pass `predictedLines` into scene state and render a lightweight text/outline near the drag preview. Keep the playfield clear and avoid layout shift.

- [ ] **Step 5: Verify**

```powershell
node --test tests/blox.test.js tests/useBloxEngine.test.js tests/sceneGeometry.test.js
pnpm run perf:guard -- --suite blox.place --repeat 3
```

Expected:

- Blox tests pass.
- Blox placement perf stays within budget.

---

## Task 7: Gem Crush Run Restore, Timed Mode Clarity, and Cascade Feedback

**Files:**

- Modify: `src/games/match3/Match3Game.jsx`
- Modify: `src/game-runtime/scenes/match3Scene.js`
- Test: `tests/match3.test.js`
- Test: `tests/e2e/multi-game-logic-smoke.spec.js`

- [ ] **Step 1: Add run restore test**

```js
test("match3 restores active server run before creating a default run", () => {
  const snapshot = {
    match3: {
      currentGame: {
        runId: "match3-run-1",
        mode: "timed",
        score: 250,
        movesLeft: 999,
        board: [["a"]],
      },
    },
  };

  const run = selectMatch3InitialRun(snapshot, () => ({ runId: "default-run" }));
  assert.equal(run.runId, "match3-run-1");
  assert.equal(run.score, 250);
  assert.equal(run.mode, "timed");
});
```

- [ ] **Step 2: Implement snapshot-first initial run selector**

```js
export function selectMatch3InitialRun(snapshot, createDefaultRun) {
  const current = snapshot?.match3?.currentGame;
  if (current?.board || current?.runId) return current;
  return createDefaultRun(current?.mode || "classic");
}
```

- [ ] **Step 3: Add timed mode HUD state**

Compute:

```jsx
const timeRatio = mode === "timed" ? Math.max(0, timeLeft / 90) : 1;
const timerTone = timeLeft <= 10 ? "critical" : timeLeft <= 30 ? "warning" : "calm";
```

Pass this into `GamePlayHud` or the match scene state as:

```jsx
timer: {
  label: mode === "timed" ? `${timeLeft}s` : `${movesLeft} moves`,
  ratio: timeRatio,
  tone: timerTone,
}
```

- [ ] **Step 4: Add cascade summary event**

After successful swap resolution:

```jsx
if (result.cascades > 1 || result.scoreDelta > 0) {
  pushEvent({
    game: "match3",
    type: "reward",
    title: result.cascades > 1 ? `Combo x${result.cascades}` : "Match",
    value: `+${result.scoreDelta}`,
    tone: "success",
  });
}
```

- [ ] **Step 5: Verify**

```powershell
node --test tests/match3.test.js
pnpm exec playwright test tests/e2e/multi-game-logic-smoke.spec.js --project="Mobile Chrome" --workers=1
pnpm run perf:guard -- --suite match3.resolve --repeat 3
```

Expected:

- Match-3 logic passes.
- Mobile smoke still enters and plays.
- Perf guard remains within budget.

---

## Task 8: Gacha Merge Source Chips, Server Clock, and Safe Trash

**Files:**

- Create: `src/games/merge/useServerClock.js`
- Modify: `src/games/merge/MergeGame.jsx`
- Modify: `src/game-runtime/scenes/mergeScene.js`
- Test: `tests/merge.test.js`
- Test: `tests/e2e/multi-game-logic-smoke.spec.js`

- [ ] **Step 1: Add server clock unit test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { deriveServerNow } from "../src/games/merge/useServerClock.js";

test("deriveServerNow advances from snapshot server time", () => {
  assert.equal(deriveServerNow({ serverTime: 1000, clientReceivedAt: 900 }, 1400), 1500);
});
```

- [ ] **Step 2: Implement server clock helper**

```js
import { useEffect, useMemo, useState } from "react";

export function deriveServerNow(snapshot, clientNow = Date.now()) {
  const serverTime = Number(snapshot?.serverTime) || clientNow;
  const clientReceivedAt = Number(snapshot?.clientReceivedAt) || clientNow;
  return serverTime + Math.max(0, clientNow - clientReceivedAt);
}

export function useServerClock(snapshot) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => deriveServerNow(snapshot), [snapshot, tick]);
}
```

- [ ] **Step 3: Replace generator select with chips**

In `MergeGame.jsx`, keep the same active generator state but render:

```jsx
<div className="merge-source-chips" data-no-nav-swipe="true">
  {availableGenerators.map((generator) => (
    <button
      key={generator.id}
      type="button"
      className={`merge-source-chip ${generator.id === activeGeneratorId ? "is-active" : ""}`}
      disabled={generator.disabled}
      onClick={() => setActiveGeneratorId(generator.id)}
    >
      <span className="merge-source-chip__icon" aria-hidden="true">{generator.icon || "•"}</span>
      <span className="merge-source-chip__label">{generator.label}</span>
      {generator.cooldownLabel && <span className="merge-source-chip__meta">{generator.cooldownLabel}</span>}
    </button>
  ))}
</div>
```

Remove only the visual `<select>`. Preserve the same state value, keyboard accessibility, and active generator action payloads.

- [ ] **Step 4: Add safe trash confirmation for valuable items**

For level 0 items, keep one-tap trash mode. For higher-level or recipe items, require second tap:

```jsx
const [trashConfirmCell, setTrashConfirmCell] = useState(null);

function requestTrash(cell) {
  const needsConfirm = cell.item?.level > 0 || cell.item?.recipe;
  const cellKey = `${cell.r}:${cell.c}`;
  if (needsConfirm && trashConfirmCell !== cellKey) {
    setTrashConfirmCell(cellKey);
    pushEvent({ game: "merge", type: "warning", title: "Tap again to trash", tone: "warning" });
    return;
  }
  setTrashConfirmCell(null);
  return performReliableAction("merge.trash", {
    payload: { r: cell.r, c: cell.c },
    clientActionId: createClientActionId("merge.trash", "board", [cell.r, cell.c, cell.item?.id]),
  });
}
```

- [ ] **Step 5: Verify**

```powershell
node --test tests/merge.test.js
pnpm exec playwright test tests/e2e/multi-game-logic-smoke.spec.js --project="Mobile Chrome" --workers=1
pnpm run perf:guard -- --suite merge.apply-generator,merge.apply-recipe --repeat 3
```

Expected:

- Merge semantics remain unchanged.
- Source controls are thumb-friendly.
- Trash is safer without changing server economy.

---

## Task 9: Bubbo Pause-Only Finish, Resume Banner, Pressure Label, Aim Assist

**Files:**

- Modify: `src/games/bubbo/BubboGame.jsx`
- Modify: `src/game-core/bubbo/engine.js`
- Modify: `src/game-runtime/scenes/bubboScene.js`
- Test: `tests/bubbo.test.js`

- [ ] **Step 1: Add pressure label helper test**

```js
test("bubbo pressure label maps danger state", () => {
  assert.equal(getBubboPressureLabel({ dangerRows: 0 }).tone, "calm");
  assert.equal(getBubboPressureLabel({ dangerRows: 1 }).tone, "warning");
  assert.equal(getBubboPressureLabel({ dangerRows: 2 }).tone, "critical");
});
```

- [ ] **Step 2: Implement pressure label helper**

```js
export function getBubboPressureLabel({ dangerRows = 0 } = {}) {
  if (dangerRows >= 2) return { label: "Critical", tone: "critical" };
  if (dangerRows >= 1) return { label: "Warning", tone: "warning" };
  return { label: "Calm", tone: "calm" };
}
```

- [ ] **Step 3: Move Finish into pause menu**

In live HUD:

- Remove direct Finish/Settle button.
- Keep Pause button.

In pause menu:

```jsx
<button type="button" className="game-menu-button game-menu-button--danger" onClick={finishRun}>
  Finish run
</button>
```

Rule:

- `finishRun` behavior stays the same.
- The player must pause first to finish.
- Do not add an active-shot confirmation modal.

- [ ] **Step 4: Add active run resume banner**

When `snapshot.bubbo.currentGame` exists and local state is not currently playing:

```jsx
{canResumeRun && (
  <button type="button" className="bubbo-resume-banner" onClick={resumeRun}>
    Continue Bubbo run
    <span>{snapshot.bubbo.currentGame.score || 0} pts</span>
  </button>
)}
```

- [ ] **Step 5: Add optional aim assist flag**

Implement aim assist behind a default-on lightweight option:

```js
export function getAssistedBubboAim({ rawAngle, candidates, maxDegrees = 4 }) {
  let best = { angle: rawAngle, score: 0 };
  for (const candidate of candidates) {
    const delta = Math.abs(normalizeAngle(candidate.angle - rawAngle));
    const degrees = delta * 180 / Math.PI;
    if (degrees <= maxDegrees) {
      const score = (candidate.clusterSize || 1) / Math.max(1, degrees);
      if (score > best.score) best = { angle: candidate.angle, score };
    }
  }
  return best.angle;
}
```

- [ ] **Step 6: Verify**

```powershell
node --test tests/bubbo.test.js
pnpm run perf:guard -- --suite bubbo.pressure-advance,bubbo.apply-shot --repeat 3
```

Expected:

- Bubbo tests pass.
- Finish is not visible during active shooting.
- Finish remains available in pause.
- Perf guard stays within budget.

---

## Task 10: Brain Blitz Real Timing, Reveal Phase, Shared Shell

**Files:**

- Create: `src/games/trivia/useQuestionTimer.js`
- Modify: `src/games/trivia/TriviaGame.jsx`
- Modify: `routes/trivia.js` only if the route rejects real `timeMs` shape
- Test: `tests/unit.test.js` or a new `tests/trivia.test.js`

- [ ] **Step 1: Add timer helper test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { getQuestionTiming } from "../src/games/trivia/useQuestionTimer.js";

test("question timing clamps remaining time", () => {
  assert.deepEqual(getQuestionTiming({ shownAt: 1000, now: 2500, timeLimitMs: 3000 }), {
    elapsedMs: 1500,
    remainingMs: 1500,
    progress: 0.5,
  });

  assert.deepEqual(getQuestionTiming({ shownAt: 1000, now: 5000, timeLimitMs: 3000 }), {
    elapsedMs: 4000,
    remainingMs: 0,
    progress: 0,
  });
});
```

- [ ] **Step 2: Implement timer hook**

```js
import { useEffect, useMemo, useRef, useState } from "react";

export function getQuestionTiming({ shownAt, now, timeLimitMs }) {
  const elapsedMs = Math.max(0, now - shownAt);
  const remainingMs = Math.max(0, timeLimitMs - elapsedMs);
  const progress = timeLimitMs > 0 ? remainingMs / timeLimitMs : 0;
  return { elapsedMs, remainingMs, progress };
}

export function useQuestionTimer(question, timeLimitMs) {
  const shownAtRef = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    shownAtRef.current = Date.now();
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [question?.id]);

  const timing = useMemo(
    () => getQuestionTiming({ shownAt: shownAtRef.current, now, timeLimitMs }),
    [now, timeLimitMs],
  );

  return {
    ...timing,
    getSubmitTimeMs: () => Math.max(0, Date.now() - shownAtRef.current),
  };
}
```

- [ ] **Step 3: Replace hardcoded answer time**

In `TriviaGame.jsx`, replace hardcoded `timeMs: 1200` with:

```jsx
const questionTimer = useQuestionTimer(currentQuestion, currentQuestion?.timeLimitMs || 15000);

const result = await api("/api/trivia/answer", {
  method: "POST",
  body: JSON.stringify({
    sessionId,
    answerIndex,
    timeMs: questionTimer.getSubmitTimeMs(),
  }),
});
```

- [ ] **Step 4: Add reveal phase**

After answer result:

```jsx
setReveal({
  correct: result.correct,
  correctIndex: result.correctIndex,
  scoreDelta: result.scoreDelta,
  timeMs: result.timeMs,
});
window.setTimeout(() => {
  setReveal(null);
  loadNextQuestion();
}, 1400);
```

- [ ] **Step 5: Align shell behavior**

Use `GameShell` for menu/play/result surfaces where possible. If a full migration is too risky in this one pass, add a thin adapter so Trivia reports `activeRun`, `openPanel`, and `pause` into the shared app shell/navigation controller.

- [ ] **Step 6: Verify**

```powershell
node --test tests/unit.test.js
pnpm exec playwright test tests/e2e/multi-game-logic-smoke.spec.js --project="Mobile Chrome" --workers=1
```

Expected:

- Real elapsed `timeMs` is submitted.
- Answer reveal appears before next question.
- Telegram Back behavior can pause/exit Trivia.

---

## Task 11: Cozy Yard Reduced HUD and Placement Clarity

**Files:**

- Modify: `src/games/companion-yard/CompanionYardGame.jsx`
- Modify: `src/games/companion-yard/companion-yard.css`
- Test: `tests/e2e/companion-yard.spec.js`
- Test: `tests/perf-guard.test.js`

- [ ] **Step 1: Add activity pill**

```jsx
function YardActivityPill({ nextVisitorAt, pendingCount, giftCount, onOpen }) {
  const now = Date.now();
  const visitorSoon = nextVisitorAt && nextVisitorAt - now < 15 * 60 * 1000;
  const label = giftCount > 0
    ? `${giftCount} gift${giftCount === 1 ? "" : "s"} ready`
    : visitorSoon
      ? "Visitor soon"
      : pendingCount > 0
        ? "Saving yard"
        : "Yard calm";

  return (
    <button className="yard-activity-pill" type="button" onClick={onOpen}>
      <span className={`yard-activity-pill__dot ${giftCount ? "is-ready" : ""}`} />
      <span>{label}</span>
    </button>
  );
}
```

- [ ] **Step 2: Reduce permanent HUD**

Keep visible:

- currency,
- activity pill,
- bottom dock,
- one contextual placement/action button.

Move secondary controls into existing settings/tools panels. Do not remove screens.

- [ ] **Step 3: Add placement zone overlay**

```jsx
function PlacementZoneOverlay({ playzone, invalidReason }) {
  if (!playzone) return null;
  return (
    <div
      className={`yard-placement-zone ${invalidReason ? "is-invalid" : "is-valid"}`}
      style={{
        left: `${playzone.x}%`,
        top: `${playzone.y}%`,
        width: `${playzone.width}%`,
        height: `${playzone.height}%`,
      }}
    />
  );
}
```

CSS:

```css
.yard-placement-zone {
  position: absolute;
  border: 2px solid rgba(64, 188, 128, 0.72);
  background: rgba(64, 188, 128, 0.12);
  border-radius: 16px;
  pointer-events: none;
}

.yard-placement-zone.is-invalid {
  border-color: rgba(230, 82, 82, 0.75);
  background: rgba(230, 82, 82, 0.12);
}
```

- [ ] **Step 4: Verify**

```powershell
pnpm exec playwright test tests/e2e/companion-yard.spec.js --project="Mobile Chrome" --workers=1
pnpm run perf:guard -- --suite yard.simulate-visitors --repeat 3
```

Expected:

- Yard remains fully functional.
- Placement feedback is visible.
- Permanent HUD is less crowded on mobile.

---

## Task 12: Farm Remove-or-Leave Decision

**Files:**

- Read/Maybe Modify: `src/app/gameChunks.jsx`
- Read/Maybe Modify: `src/game-runtime/LazyPixiSceneHost.jsx`
- Read/Maybe Modify: `src/game-runtime/scenes.js`
- Read/Maybe Modify: `src/games/farm/FarmGame.jsx`
- Read/Maybe Modify: `routes/player.js`
- Read/Maybe Modify: `routes/farm.js`
- Test: `tests/farm.test.js`
- Test: `tests/merge.test.js`

- [ ] **Step 1: Check whether Farm code ships in active chunks**

Run:

```powershell
pnpm run build
rg -n "FarmGame|buildFarmScene|farm\\.plant|farm\\.harvest" dist
```

Expected decision:

- If the strings do not appear in startup chunks and Farm is only lazy/dead hidden code, leave Farm hidden.
- If Farm appears in startup chunks or blocks scene splitting/build budgets, remove only the shipped references that create cost.

- [ ] **Step 2A: Leave Farm hidden when there is no measured performance impact**

Document the decision in `docs/TELEGRAM_MINIAPP_GAME_UX_AUDIT.md`:

```md
Farm remains hidden. Build/import checks did not show enough shipped runtime cost to justify removal during this UX pass.
```

No code deletion.

- [ ] **Step 2B: Remove Farm only with measured benefit**

If removal is justified:

- Remove `farm` from lazy scene host builder map.
- Keep server `farm.*` actions only if Merge or inventory compatibility still needs them.
- Do not remove harvested crop resources used by Merge.
- Delete `src/games/farm/FarmGame.jsx` only if no imports remain.
- Keep migration/normalization logic required by existing player snapshots.

- [ ] **Step 3: Verify whichever path was chosen**

```powershell
node --test tests/farm.test.js tests/merge.test.js tests/gameStore.test.js
pnpm run build
pnpm run perf:guard:build
```

Expected:

- Merge crop fuel remains intact.
- Existing player snapshots still normalize.
- Build succeeds.

---

## Task 13: Final Validation and Documentation

**Files:**

- Modify: `docs/TELEGRAM_MINIAPP_GAME_UX_AUDIT.md`
- Modify: `README.md` only if user-facing behavior or runbook changes need documentation.

- [ ] **Step 1: Update docs with implemented decisions**

Update:

- Garden affordance compatibility.
- Slight mobile overdraw reduction.
- Bubbo Finish in pause menu.
- Farm remove-or-leave decision and evidence.
- New shared files and validation commands.

- [ ] **Step 2: Run full validation**

```powershell
git diff --check
pnpm test
pnpm run build
pnpm run perf:guard -- --suite player.build-snapshot,blox.place,match3.resolve,merge.apply-generator,bubbo.pressure-advance,bubbo.apply-shot,yard.simulate-visitors --repeat 2
pnpm exec playwright test tests/e2e/garden-shelf.spec.js tests/e2e/multi-game-logic-smoke.spec.js tests/e2e/companion-yard.spec.js --project="Mobile Chrome" --workers=1
```

Expected:

- Whitespace check passes.
- Node tests pass.
- Production build passes.
- Perf guard passes without loosened budgets.
- Focused mobile E2E passes.

- [ ] **Step 3: Final manual smoke checklist**

Run the app locally and check:

```powershell
pnpm run dev
```

Manual scenarios:

- Garden: tap a plant twice; details affordance appears but does not block plant taps.
- Garden: small viewport uses slightly reduced decoration, same mood.
- Blox: drag/drop placement commits immediately and rolls back only on server rejection.
- Match-3: timed mode shows clear countdown and resumes active run.
- Merge: source chips select generator; free taps and Essence remain correct.
- Bubbo: active HUD has no Finish button; pause menu has Finish.
- Trivia: answer timing changes based on real delay.
- Yard: activity pill summarizes state; placement valid zone is visible.
- Farm: if left hidden, no visible tab appears; if removed, Merge crop fuel remains intact.

---

## Self-Review Checklist

- User comment covered: Garden affordance is compatible with plant tapping.
- User comment covered: Garden overdraw reduction is slight.
- User comment covered: Bubbo Finish moves to pause menu.
- User comment covered: Farm is removed only with measured project benefit; otherwise left hidden.
- Implementation order supports a single coordinated pass.
- Shared foundation lands before per-game changes.
- No plan step changes game economy semantics.
- Validation includes tests, build, perf guard, and mobile Playwright smoke.
