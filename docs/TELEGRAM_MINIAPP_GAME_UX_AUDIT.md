# Telegram Mini App Game UX Audit

Дата среза: 2026-05-02
Репозиторий: `E:\Projects\CC-GH-SKILLS\CC-GH`
Роль анализа: Telegram Mini App game developer + игрок, который открывает игру в мобильном Telegram WebView.

Этот документ не является набором абстрактных советов. Он описывает, что уже есть в проекте,
где слабые места у каждой игры, какие изменения дадут лучший UX, и какие implementation seams
стоит использовать, чтобы изменения делать вместе, без расползания контрактов.

## Статус реализации 2026-05-02

Аудит реализован как единый pass, без изменения игровых правил и без ослабления perf/test budgets.

Что добавлено:

- общий `GAME_REGISTRY` с видимыми играми и скрытым Farm runtime compatibility;
- adaptive HUD descriptors для Garden/Blox/Gem/Merge/Bubbo/Trivia/Yard;
- `performReliableAction()`, deterministic `clientActionId`, и transient game event overlay;
- Telegram Back Button / closing confirmation layer;
- разделение Pixi сцен на отдельные builders с сохранением старого export entrypoint;
- низкорисковые game-specific улучшения для Garden, Blox, Gem Crush, Merge, Bubbo, Trivia и Cozy Yard.

Что подтвердил perf loop:

- startup JS уменьшен с `503,219B` raw / `165,318B` gzip до `309,137B` raw / `99,561B` gzip за счет удаления shell-level `framer-motion` из startup и progressive загрузки Telegram SDK;
- `merge.board-hydrate` focused p95 улучшен с `0.103ms` до `0.093ms`;
- loop остановлен после трех отклоненных/sub-threshold попыток, как требовалось.

Текущие evidence docs: `docs/PERF_GUARD.md` и `docs/superpowers/plans/2026-05-02-telegram-miniapp-game-ux-implementation.md`.

## 1. Короткий вывод

Проект уже ближе к настоящему Telegram-first game hub, чем к обычному веб-сайту с играми:

- React/Vite shell лениво грузит игры.
- Pixi Runtime грузится только для `blox`, `match3`, `merge`, `bubbo`.
- `PixiGameHost` отключает конфликтные Telegram vertical swipes на активном canvas.
- `GameShell` дает общий immersive слой для Blox, Gem Crush, Merge, Bubbo, Brain Blitz и Cozy Yard.
- Cozy Yard уже имеет самый правильный weak-network pattern: durable outbox + `clientActionId` receipts.
- Gacha Merge уже имеет in-scene Items / Recipes / Exchange, то есть идет в сторону самостоятельной игры, а не вкладки с меню.

Главная слабость сейчас не в одном баге. Она в том, что игры развивались разными слоями UX:

- Yard и Merge уже ощущаются как самостоятельные сцены.
- Blox и Gem Crush все еще больше похожи на компактные game widgets.
- Trivia функциональна, но не использует полностью реальные time pressure и realtime duel affordances.
- Garden Shelf сильна как idle surface, но живет отдельно от общего shell language и имеет скрытые жесты.
- Farm скрыта как tab, но ее legacy-контракты все еще влияют на Merge через harvested crops.

Идеальный следующий уровень: сделать общую систему `game session -> intent -> reliable action -> event feedback -> adaptive HUD`, а затем на ней улучшать каждую игру.

## 2. Проверенные Telegram Mini App constraints

Источники:

- Telegram Core Web Apps: <https://core.telegram.org/bots/webapps>
- Telegram Mini Apps low-level events: <https://core.telegram.org/api/bots/webapps>
- Viewport docs: <https://docs.telegram-mini-apps.com/platform/viewport>
- Swipe behavior docs: <https://docs.telegram-mini-apps.com/platform/swipe-behavior>
- Back Button docs: <https://docs.telegram-mini-apps.com/platform/back-button>
- Closing behavior docs: <https://docs.telegram-mini-apps.com/platform/closing-behavior>
- Haptic feedback docs: <https://docs.telegram-mini-apps.com/platform/haptic-feedback>

Практические требования для этого проекта:

1. Игровой UI должен жить от `viewportStableHeight`, а не от обычного `viewportHeight`. Telegram прямо предупреждает, что текущая высота во время drag/animation не подходит для pinning нижних элементов.
2. Все drag-heavy игры должны явно управлять vertical swipe behavior. Telegram рекомендует держать swipes включенными, кроме случаев конфликта с жестами приложения. Для игр конфликт есть.
3. Back Button не делает навигацию сам. Если он включен, приложение обязано само решить: закрыть drawer, снять pause, выйти из play shell, вернуться в Hub.
4. Closing confirmation нужен только когда есть риск потери состояния: активный run, unsynced Garden state, pending Yard outbox, active placement mode.
5. Haptic feedback улучшает mobile feel, но его нельзя спамить. В играх это значит: selection haptic на смену выбора, impact на столкновение/попадание, notification на commit/result.
6. Fullscreen полезен для игр, но должен быть progressive enhancement: некоторые клиенты/launch modes могут не поддержать его одинаково.

Текущий проект уже частично соответствует этому:

- `src/platform/telegram.js` монтирует SDK, viewport, swipe behavior, CSS vars, вызывает `expandViewport()` и `miniAppReady()`.
- `src/index.css` использует `--tg-viewport-stable-height`.
- `src/game-runtime/PixiGameHost.jsx` включает `setGameGestureActive(true)` на active canvas и снимает на cleanup.
- `src/game-runtime/pointerSession.js` централизует pointer lifecycle.

Недостающее: общий Back Button / Closing Confirmation layer, который знает активную игру и ее modal/run/dirty state.

## 3. Текущая карта проекта

Visible tabs в `src/App.jsx`:

| Tab | Game | Runtime |
| --- | --- | --- |
| `garden` | Garden Shelf | React/DOM |
| `blox` | Building Blox | Pixi + DOM HUD |
| `match3` | Gem Crush | Pixi + DOM HUD |
| `merge` | Gacha Merge / Alchemy Table | Pixi + DOM HUD |
| `bubbo` | Bubbo Bubbo | Pixi + DOM HUD |
| `trivia` | Brain Blitz | React/DOM |
| `room` | Cozy Yard | React/DOM stage |

Legacy/hidden:

| Surface | Status |
| --- | --- |
| Farm | Not a visible tab, but component, Pixi builder, API actions, crop inventory, and Merge fuel coupling still exist. Treat as legacy subsystem unless product direction restores it. |

Key files:

- `src/App.jsx`: boot, topbar, stats, tab routing.
- `src/app/gameChunks.jsx`: lazy game imports and Pixi preload on intent.
- `src/app/shell.jsx`: shared `GameShell`, `GamePlayHud`, pause/result/menu surfaces.
- `src/game-runtime/PixiGameHost.jsx`: Pixi app lifecycle, resize, Telegram gesture lock.
- `src/game-runtime/scenes.js`: all Pixi scene builders in one large module.
- `src/game-state/useGameHub.js`: snapshot, direct mutate actions, Yard outbox, realtime merge.
- `routes/player.js`: server-authoritative mutation surface for Garden, Farm, Yard, Merge, Blox, Match-3, Bubbo.
- `game-logic/*`: server/client shared rules for Garden, Merge, Yard, Blox, Match-3, Bubbo, Trivia.

## 4. Cross-game insights

### Insight 1: The hub needs adaptive game resources, not one generic stat row

`App.jsx` shows Garden-specific stats for Garden, but other tabs mostly get generic gold/energy/tokens. That is not what players think in the moment:

- Blox cares about score, high score, tray, active run.
- Match-3 cares about moves/time/combo.
- Merge cares about Essence, free taps, fuel, generator cooldown, recipes.
- Bubbo cares about shots/time, pressure, score.
- Trivia cares about streak/question/time/duel state.
- Yard cares about treats, shiny treats, gifts, visitor window.

Recommendation: introduce `gameHudDescriptors[activeTab]` so topbar and in-game HUD are generated from the active game contract.

### Insight 2: Reliable actions should not be Yard-only

Yard has durable outbox and receipt dedupe. That is the right Telegram Mini App pattern because mobile WebViews can sleep, reconnect, and lose focus. Other games use direct `performAction()`.

Not every action needs outbox. But these do:

- Garden sync / level-up / rename.
- Blox start/end/place if active run restoration matters.
- Match-3 run start/end/sync.
- Bubbo start/end/sync.
- Merge exchange/trash/gacha/free-pull/claim-free-taps.
- Trivia answer submission in duel or timed scoring.

The goal is not "make everything offline". The goal is "tap has deterministic local feedback and duplicate-safe server commit".

### Insight 3: `src/game-runtime/scenes.js` is now too large for fast iteration

All Pixi games share one 80k+ file. This gives useful shared utilities, but makes each game harder
to evolve. Future changes to Blox drag, Match-3 animation, Merge board, and Bubbo projectile logic
will conflict in the same module.

Recommendation: split into:

- `src/game-runtime/scenes/shared/*`
- `src/game-runtime/scenes/bloxScene.js`
- `src/game-runtime/scenes/match3Scene.js`
- `src/game-runtime/scenes/mergeScene.js`
- `src/game-runtime/scenes/bubboScene.js`
- `src/game-runtime/scenes/farmScene.js`

Keep the exported builder names stable.

### Insight 4: GameShell is good, but Trivia and Garden still speak different UI dialects

Garden intentionally has its own idle shelf UI. That is fine. But the app should still share:

- escape/back behavior,
- pending sync status,
- global audio setting,
- resource semantics,
- common reward toasts,
- focus and modal patterns.

Trivia uses a custom shell rather than `GameShell`, so it risks drifting from shared accessibility and mobile spacing decisions.

### Insight 5: Many games need "state resume clarity"

On mobile Telegram, users often leave and return. The player needs immediate answer to:

- Am I in a run?
- Was my last action saved?
- What did I lose/gain while away?
- Can I safely close?

Yard partially answers this via pending visuals. Garden has offline earnings. Others need explicit resume banners and save-state cues.

### Insight 6: Touch verbs must be visible, not hidden behind advanced gestures

Hidden long-press is especially risky in Telegram WebView because users associate long-press with browser/app behavior. Every important gesture needs an explicit button alternative:

- Garden long-press open detail should have visible focus/open affordance.
- Blox drag should have tap-to-select/tap-to-place fallback.
- Merge drag should keep tap-to-merge and explicit trash mode.
- Bubbo aim drag is fine, but should show aim affordance before first shot.

### Insight 7: The game loop needs a visible meta-progression spine

Current games have good mechanics, but weak cross-game progression:

- Merge gives Yard treats/goodies, which is a strong bridge.
- Garden uses shared gold and Garden quests.
- Blox/Match-3/Bubbo/Trivia mostly produce isolated scores/rewards.

Recommendation: daily/weekly "Game Hub quests" that intentionally rotate games:

- clear 3 Blox lines,
- make 2 Merge reactions,
- pop 20 Bubbo bubbles,
- answer 5 Trivia questions,
- collect 3 Garden plants,
- place/fix 1 Yard goodie.

This creates reasons to revisit every game without forcing long sessions.

## 5. Per-game audit

## 5.1 Garden Shelf

Files:

- `src/games/garden-shelf/GardenShelfGame.tsx`
- `src/games/garden-shelf/components/Garden.tsx`
- `src/games/garden-shelf/components/BottomPanel.tsx`
- `src/games/garden-shelf/lib/GameContext.tsx`
- `game-logic/garden-economy.js`

What works:

- Strong idle fantasy: shelves, sign, plant phases, watering, quests, offline earnings.
- Garden name and state are synced through player snapshot.
- Level-up reward is server-authoritative.
- Local fallback lets the game remain playable while disconnected.
- Detailed plant view already supports explicit navigation arrows.

Developer weaknesses:

- Garden uses its own local i18n/settings/sound feel, while the rest of the hub uses shared shell patterns.
- `GardenShelfGame.tsx` mutates `document.body.style.overscrollBehavior` and selection styles while mounted. It cleans up, but this is still a page-level side effect.
- `garden.sync` is debounced and server-normalized, but not durable-outbox based like Yard.
- Many interactions are local-first until sync. That is right for idle feel, but the player needs visible sync confidence.
- Bottom sheet carries a lot of dense state: shop, inventory, selected plant, actions, water/growth/evolution.

Player weaknesses:

- Tap vs long-press semantics are not obvious enough.
- It is easy to miss why a plant can/cannot be watered, evolved, moved, or sold.
- Garden progression is rich but visually compressed: level, XP, story quests, daily quests, plant maturity, offline earnings compete for attention.
- Garden can feel like a separate app inside the hub rather than part of the same game world.

Ideal UX direction:

1. Add an explicit per-plant action ring or small open/details button on focused plant, while preserving the current tap-to-grow/harvest loop. The affordance should appear only after focus/selection or sit outside the sprite hit zone so ordinary plant taps still work.
2. Make sync status visible but quiet: "saved", "saving", "offline changes".
3. Convert critical Garden commits to reliable actions with client receipts.
4. Reduce bottom panel density by splitting "Care", "Shop", "Inventory", "Quests" into thumb-first segments.
5. Keep Garden visual mood, but slightly reduce decorative overdraw on low-end mobile rather than changing the art direction.

Implementation sketch:

```tsx
// src/games/garden-shelf/lib/useGardenReliableSync.ts
import { useCallback, useMemo } from "react";
import { useGameHub } from "../../../game-state/useGameHub";

export function useGardenReliableSync(state, dirtyRevision) {
  const { performReliableAction, pendingActions } = useGameHub();

  const clientActionId = useMemo(
    () => `garden.sync:${dirtyRevision}`,
    [dirtyRevision],
  );

  const syncGarden = useCallback(() => {
    return performReliableAction("garden.sync", {
      payload: { state },
      clientActionId,
      reliability: "receipt",
      pendingLabel: "Saving garden",
    });
  }, [clientActionId, performReliableAction, state]);

  return {
    syncGarden,
    saving: pendingActions.has(clientActionId),
  };
}
```

## 5.2 Building Blox

Files:

- `src/games/blox/BloxGame.jsx`
- `game-logic/blox.js`
- `src/game-runtime/scenes.js` / `buildBloxScene`
- `src/game-runtime/sceneGeometry.js`
- `routes/player.js` actions: `blox.start`, `blox.place`, `blox.sync`, `blox.end`

What works:

- Pure rules are extracted enough for tests.
- Pixi scene uses shared pointer session and mobile-friendly geometry.
- Server stores saved state and high score.
- Blox already benefits from previous mobile gesture/per-cell performance work.

Developer weaknesses:

- Placement waits on server result before the visible board fully commits, so network latency can still be felt.
- No shared run-session hook for start/end/resume across games.
- Leaderboard fetch lives inside component lifecycle and can become a distraction from run interaction.
- The tray/board UX is mostly scene-local; HUD does not explain invalid placement causes.

Player weaknesses:

- Dragging feels correct when connection is good, but a weak connection can make placement feel like it "did not take".
- No "ghost outcome" before drop: player does not see predicted line clears/reward clearly enough.
- New players get little help with "where can this piece fit".
- Blox has weak progression beyond score/high score.

Ideal UX direction:

1. Add optimistic local placement preview with rollback only if server rejects.
2. Show predicted line clears on drag hover.
3. Add one optional hint per run: highlight a valid placement for the selected piece.
4. Add daily Blox board/challenge seed.
5. Treat Blox run as resumable session with explicit "Continue run" state.

Implementation sketch:

```jsx
// src/games/blox/useBloxOptimisticPlacement.js
import { useCallback, useState } from "react";
import { applyBloxPlacementPreview } from "../../game-core/blox/preview.js";

export function useBloxOptimisticPlacement({ savedState, setLocalState, performReliableAction }) {
  const [rollbackState, setRollbackState] = useState(null);

  return useCallback(async ({ pieceIndex, row, col }) => {
    const before = savedState;
    const preview = applyBloxPlacementPreview(before, { pieceIndex, row, col });
    if (!preview.valid) return { ok: false, reason: preview.reason };

    setRollbackState(before);
    setLocalState(preview.state);

    const result = await performReliableAction("blox.place", {
      payload: { pieceIndex, row, col },
      clientActionId: `blox.place:${before.runId}:${pieceIndex}:${row}:${col}:${before.turn}`,
      reliability: "receipt",
    });

    if (result?.error) {
      setLocalState(before);
      setRollbackState(null);
      return { ok: false, reason: result.error };
    }

    setRollbackState(null);
    return { ok: true, state: result.savedState || preview.state };
  }, [performReliableAction, savedState, setLocalState]);
}
```

## 5.3 Gem Crush

Files:

- `src/games/match3/Match3Game.jsx`
- `src/game-core/match3/engine.js`
- `src/game-runtime/scenes.js` / `buildMatch3Scene`
- `routes/player.js` actions: `match3.start`, `match3.syncMode`, `match3.end`

What works:

- Swaps and cascades are local and fast.
- The Pixi scene measures live HUD before fitting the board.
- Valid/invalid swaps have haptic feedback.
- Modes exist: classic and timed.

Developer weaknesses:

- Mode/run restoration is weaker than it should be. Component defaults can dominate unless saved run state is explicitly rehydrated.
- Timed mode uses local timer state; server only sees sync/end snapshots.
- `match3.syncMode` is a broad sync action rather than event-sourced moves.
- No general run-session abstraction shared with Bubbo/Blox.

Player weaknesses:

- The game has good basic feel but limited identity: not enough goal framing, reward framing, or visible mode distinction.
- Timed mode needs stronger urgency: progress ring, countdown color, last-10-second feedback.
- Invalid swaps need a clearer visual reason than "nothing happened".
- There is no visible "combo story" after cascades.

Ideal UX direction:

1. Restore active run from snapshot first, then local defaults.
2. Make timed mode visually distinct: top timer ring, final countdown pulse, score multiplier explanation.
3. Add cascade summary toast: `Combo x3`, `Star Drop`, `+240`.
4. Add daily board seed with one target objective.
5. Store per-run `startedAt/serverNow` to prevent client clock drift.

Implementation sketch:

```jsx
// src/games/match3/useMatch3Run.js
import { useEffect, useMemo, useState } from "react";

export function useMatch3Run(snapshot, createDefaultRun) {
  const saved = snapshot?.match3?.currentGame || null;
  const savedModes = snapshot?.match3?.savedModes || {};

  const initial = useMemo(() => {
    if (saved?.board) return saved;
    return createDefaultRun(saved?.mode || "classic", savedModes);
  }, [createDefaultRun, saved, savedModes]);

  const [run, setRun] = useState(initial);

  useEffect(() => {
    if (saved?.runId && saved.runId !== run?.runId) setRun(saved);
  }, [run?.runId, saved]);

  return [run, setRun];
}
```

## 5.4 Gacha Merge / Alchemy Table

Files:

- `src/games/merge/MergeGame.jsx`
- `game-logic/merge-config.js`
- `src/game-runtime/scenes.js` / `buildMergeScene`
- `routes/player.js` actions: `merge.tap`, `merge.merge`, `merge.gacha`, `merge.freePull`, `merge.claimFreeTaps`, `merge.exchange`, `merge.trash`

What works:

- This is currently one of the strongest UX surfaces.
- Items, Recipes, and Exchange are visible in-scene, not buried behind pause.
- Essence and Cozy Yard rewards create a real cross-game bridge.
- Free taps are modeled as their own resource, not a misleading generator refill.
- Board placement is lower/thumb-reachable and measures DOM controls before fitting.

Developer weaknesses:

- `MergeGame.jsx` is doing a lot: data derivation, economy labels, panel rendering, action handlers, scene state.
- Cooldown logic uses server snapshot time in some places and `Date.now()` in others; this can create edge cases around generator state.
- Merge logic exists both in current player mutate route and legacy merge route. Future changes must keep them aligned.
- Generated runtime art support exists, but the current production visual surface can still fall back to procedural placeholders.

Player weaknesses:

- The game is mechanically much richer than its first-time explanation.
- Generator source selection via `<select>` is functional but not very tactile.
- Recipe/Item panels are explicit, but text-heavy on small screens.
- Trash mode can be scary without a preview/undo.
- Board full states need more graceful suggestions.

Ideal UX direction:

1. Replace generator `<select>` with thumb-sized source chips or a radial source shelf.
2. Add a "next reaction" coaching layer: one suggested pair, one undiscovered recipe clue.
3. Add soft undo for trash and last non-server-critical move.
4. Use server-time derived `now` consistently.
5. Split Merge UI into `MergeHud`, `MergeDrawers`, `MergeControls`, `useMergeDerivedState`.

Implementation sketch:

```jsx
// src/games/merge/useServerClock.js
import { useEffect, useMemo, useState } from "react";

export function useServerClock(snapshot) {
  const serverTime = Number(snapshot?.serverTime) || Date.now();
  const clientAtSnapshot = Number(snapshot?.clientReceivedAt) || Date.now();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    return serverTime + (Date.now() - clientAtSnapshot);
  }, [clientAtSnapshot, serverTime, tick]);
}
```

```jsx
// src/games/merge/components/GeneratorChips.jsx
export function GeneratorChips({ generators, activeId, cooldowns, onSelect }) {
  return (
    <div className="merge-source-chips" data-no-nav-swipe="true">
      {generators.map((source) => (
        <button
          key={source.id}
          type="button"
          className={`merge-source-chip ${source.id === activeId ? "is-active" : ""}`}
          disabled={cooldowns[source.id]?.locked}
          onClick={() => onSelect(source.id)}
        >
          <span className="merge-source-chip__icon" style={{ backgroundImage: `url(${source.icon})` }} />
          <span className="merge-source-chip__name">{source.label}</span>
          {cooldowns[source.id]?.label && <span className="merge-source-chip__meta">{cooldowns[source.id].label}</span>}
        </button>
      ))}
    </div>
  );
}
```

## 5.5 Bubbo Bubbo

Files:

- `src/games/bubbo/BubboGame.jsx`
- `game-logic/bubbo.js`
- `src/game-runtime/scenes.js` / `buildBubboScene`
- `routes/player.js` actions: `bubbo.start`, `bubbo.sync`, `bubbo.end`

What works:

- Pending pressure row is real gameplay state, not decorative preview.
- Timed mode is 90 seconds and does not impose shot limit.
- Classic mode has shot budget.
- Pressure movement is continuous enough for better feel.
- Strong clears refill sparse fields without punishment.
- Motion is lightweight on existing Pixi ticker.

Developer weaknesses:

- Current run state is mostly local with periodic `bubbo.sync`.
- Pressure sync keys can be timestamp-heavy and not grouped by run turn.
- Current/next bubble generation is client-local, which is acceptable for casual play but weak for fairness/anti-cheat.
- No shared reconnect/resume banner for active run.
- Scene and React state are tightly coupled through many callbacks.

Player weaknesses:

- Bubble shooters need trust in aiming. Beginners need aim assist, line preview, and bounce clarity.
- Pressure danger is visible, but the "why now" / "how close to danger" can be clearer.
- The Finish button in active play can feel dangerous if hit accidentally.
- The player needs a better celebration of big clears and island drops.

Ideal UX direction:

1. Add optional gentle aim assist: snap within a small angle to the nearest meaningful cluster.
2. Add danger ladder in HUD: calm/warning/critical based on bottom row distance.
3. Move Finish out of the active shot HUD and into the pause menu.
4. Add resumable run banner if snapshot has `bubbo.currentGame`.
5. Move run identity and turn counter into server state for duplicate-safe sync.

Implementation sketch:

```js
// game-logic/bubbo/aimAssist.js
export function getAssistedAim({ origin, pointer, clusters, maxDegrees = 4 }) {
  const rawAngle = Math.atan2(pointer.y - origin.y, pointer.x - origin.x);
  let best = { angle: rawAngle, score: 0 };

  for (const cluster of clusters) {
    const targetAngle = Math.atan2(cluster.y - origin.y, cluster.x - origin.x);
    const delta = Math.abs(normalizeAngle(targetAngle - rawAngle));
    const degrees = delta * 180 / Math.PI;
    if (degrees <= maxDegrees) {
      const score = cluster.size / Math.max(1, degrees);
      if (score > best.score) best = { angle: targetAngle, score };
    }
  }

  return best.angle;
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
```

## 5.6 Brain Blitz

Files:

- `src/games/trivia/TriviaGame.jsx`
- `game-logic/trivia.js`
- `routes/trivia.js`

What works:

- Solo and duel concepts exist.
- Room creation/join/ready/start flows exist.
- The game can run without Pixi.
- Shell can enter immersive mode.

Developer weaknesses:

- `TriviaGame.jsx` uses a custom shell rather than shared `GameShell`.
- Answer `timeMs` is currently hardcoded in client submission paths, so time-based scoring is not truly measured from user interaction.
- Duel state polling is manual and not as live as the rest of the app's Socket.IO model.
- Question lifecycle lacks a shared timer/session hook.

Player weaknesses:

- No strong visible countdown pressure.
- After answering, feedback/next-question rhythm is not satisfying enough.
- Duel readiness and opponent state are not live-feeling.
- The side/history panel can distract from answering.

Ideal UX direction:

1. Use shared `GameShell` and `GamePlayHud` for play/menu/result.
2. Record `questionShownAt` and submit real elapsed time.
3. Add live duel events through Socket.IO or room subscription.
4. Add answer reveal phase: correct answer, your time, opponent status, next in 2 seconds.
5. Add daily topic packs and streaks.

Implementation sketch:

```jsx
// src/games/trivia/useQuestionTimer.js
import { useEffect, useMemo, useRef, useState } from "react";

export function useQuestionTimer(question, timeLimitMs) {
  const shownAtRef = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    shownAtRef.current = Date.now();
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [question?.id]);

  const elapsedMs = Math.max(0, now - shownAtRef.current);
  const remainingMs = Math.max(0, timeLimitMs - elapsedMs);

  return useMemo(() => ({
    elapsedMs,
    remainingMs,
    progress: timeLimitMs ? remainingMs / timeLimitMs : 0,
    getSubmitTimeMs: () => Math.max(0, Date.now() - shownAtRef.current),
  }), [elapsedMs, remainingMs, timeLimitMs]);
}
```

```jsx
// submit path
const timer = useQuestionTimer(currentQuestion, currentQuestion.timeLimitMs);

async function submitAnswer(answerIndex) {
  const timeMs = timer.getSubmitTimeMs();
  const result = await api("/api/trivia/answer", {
    method: "POST",
    body: JSON.stringify({ sessionId, answerIndex, timeMs }),
  });
  setReveal(result);
}
```

## 5.7 Cozy Yard

Files:

- `src/games/companion-yard/CompanionYardGame.jsx`
- `src/games/companion-yard/companion-yard.css`
- `src/games/companion-yard/assets.js`
- `src/games/companion-yard/movement.js`
- `game-logic/yard.js`
- `game-logic/yard-catalog.js`
- `game-logic/yard-playzones.js`
- `routes/player.js` Yard actions

What works:

- Best weak-network behavior in the project: durable outbox, entity-level pending visuals, server receipts.
- Deep content model: food, goodies, gifts, photos, remodels, visitor poses, companion config.
- In-scene screens keep the player inside the yard instead of leaving gameplay.
- Asset and catalog contracts are strong.
- Placement uses percent coordinates and playzone clamping.

Developer weaknesses:

- The component is large and owns many screens.
- HUD has many permanent controls and status elements.
- CSS movement/render tick can become expensive if visitor/goodie count grows.
- Placement affordance is numeric/technical in places rather than player-language.
- `useCompanionYardShell` sets active shell, but Yard does not use the same `GameShell` component.

Player weaknesses:

- First viewport can feel busy: side tools, bottom dock, status, currency, visitor objects, placement states.
- On small screens, labels disappear and controls become icon-only.
- Visitor loop is not obvious enough: when visitors arrive, what they want, when gifts are ready.
- Placement validity needs stronger visual feedback.

Ideal UX direction:

1. Reduce permanent HUD to: currency, one activity/status pill, bottom dock, one contextual action.
2. Move secondary controls into a compact radial/tool drawer.
3. Add "next visitor" and "gift ready" timeline.
4. Use placement heatmap/valid zone tint while placing.
5. Split screens into smaller components: `YardStage`, `YardHud`, `YardScreenPanel`, `YardPlacementController`.

Implementation sketch:

```jsx
// src/games/companion-yard/components/YardActivityPill.jsx
export function YardActivityPill({ nextVisitorAt, pendingCount, giftCount, onOpen }) {
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

```jsx
// placement overlay idea
function PlacementOverlay({ playzone, invalidReason }) {
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

## 5.8 Farm legacy subsystem

Files:

- `src/games/farm/FarmGame.jsx`
- `routes/player.js` Farm actions
- legacy route files under `routes/farm.js`

Status:

- Farm is not in visible tabs.
- It still exists as a component, Pixi scene builder, server actions, and inventory/economy surface.
- Harvested crops matter because Merge uses crop fuel.

Developer weaknesses if restored:

- It is not aligned with shared `GameShell`.
- It is still more panel-heavy than current game direction.
- Critical actions must remain immediate, not delayed batched, because past UX issues came from plant/water/harvest race windows.

Player weaknesses if restored:

- It would overlap thematically with Garden unless reframed.
- It needs a clear reason to exist: crop production for Merge, not a duplicate idle garden.

Ideal direction:

- Keep it hidden as backend/economy support unless product wants "Cozy Farm" as a real game.
- Remove Farm only if an import graph / bundle / runtime check proves it improves the project. If it does not influence shipped performance, leave it hidden for now.
- If restored, make it a production mini-loop for Merge fuel with very fast deterministic feedback.

## 6. Shared implementation package

The following snippets show how to implement improvements together. They are not meant to be pasted blindly; they show the intended architecture for this repo.

## 6.1 Game capability registry

Problem: resource/HUD/menu behavior is scattered per game.

```js
// src/app/gameRegistry.js
export const GAME_REGISTRY = {
  garden: {
    label: "Garden Shelf",
    runtime: "dom",
    shell: "tab",
    resources: ["gardenXp", "gold", "plants"],
    supportsReliableActions: true,
  },
  blox: {
    label: "Building Blox",
    runtime: "pixi",
    shell: "immersive",
    resources: ["score", "highScore", "lines"],
    session: "run",
    supportsReliableActions: true,
  },
  match3: {
    label: "Gem Crush",
    runtime: "pixi",
    shell: "immersive",
    resources: ["score", "movesOrTime", "combo"],
    session: "run",
    supportsReliableActions: true,
  },
  merge: {
    label: "Alchemy Table",
    runtime: "pixi",
    shell: "immersive",
    resources: ["essence", "freeTaps", "fuel", "cooldown"],
    supportsReliableActions: true,
  },
  bubbo: {
    label: "Bubbo Bubbo",
    runtime: "pixi",
    shell: "immersive",
    resources: ["score", "shotsOrTime", "pressure"],
    session: "run",
    supportsReliableActions: true,
  },
  trivia: {
    label: "Brain Blitz",
    runtime: "dom",
    shell: "immersive",
    resources: ["question", "timer", "streak"],
    session: "question",
    supportsReliableActions: true,
  },
  room: {
    label: "Cozy Yard",
    runtime: "dom",
    shell: "immersive",
    resources: ["treats", "shinyTreats", "gifts", "visitors"],
    supportsReliableActions: true,
  },
};
```

## 6.2 Adaptive HUD descriptors

```jsx
// src/app/useGameHudDescriptors.js
import { useMemo } from "react";

export function useGameHudDescriptors(activeTab, snapshot, gameUiState = {}) {
  return useMemo(() => {
    if (activeTab === "merge") {
      const merge = snapshot?.merge || {};
      return [
        { id: "essence", label: "Essence", value: merge.alchemyEssence || 0 },
        { id: "freeTaps", label: "Free taps", value: merge.freeTapCharges || 0 },
        { id: "fuel", label: "Fuel", value: snapshot?.inventory?.cropsTotal || 0 },
      ];
    }

    if (activeTab === "bubbo") {
      return [
        { id: "score", label: "Score", value: gameUiState.score || snapshot?.bubbo?.currentGame?.score || 0 },
        { id: "pressure", label: "Pressure", value: gameUiState.pressureLabel || "Calm" },
      ];
    }

    if (activeTab === "room") {
      const yard = snapshot?.yard || {};
      return [
        { id: "treats", label: "Treats", value: yard.currencies?.treats || 0 },
        { id: "gifts", label: "Gifts", value: yard.pendingGifts?.length || 0 },
      ];
    }

    return null;
  }, [activeTab, gameUiState, snapshot]);
}
```

## 6.3 Reliable action wrapper

Current `performAction()` already accepts action keys and payloads. Yard has outbox. This wrapper generalizes receipts first, and only uses durable storage for actions that need retry after app sleep.

```js
// src/game-state/reliableActions.js
export function createClientActionId(action, scope, parts = []) {
  const safeParts = parts.map((part) => String(part).replace(/[^a-zA-Z0-9:_-]/g, "_"));
  return [action, scope, ...safeParts].filter(Boolean).join(":");
}

export async function performReliableAction({
  api,
  action,
  payload,
  clientActionId,
  durability = "receipt", // "none" | "receipt" | "outbox"
  enqueueOutbox,
}) {
  if (durability === "outbox") {
    return enqueueOutbox({ action, payload, clientActionId });
  }

  return api("/api/player/mutate", {
    method: "POST",
    body: JSON.stringify({ action, payload, clientActionId }),
  });
}
```

Integration target in `useGameHub.js`:

```js
// src/game-state/useGameHub.js
performReliableAction: async (action, options = {}) => {
  const {
    payload = {},
    clientActionId,
    durability = "receipt",
    pendingLabel,
  } = options;

  if (durability === "outbox") {
    return get().enqueueDurableAction({ action, payload, clientActionId, pendingLabel });
  }

  return get().performAction(action, payload, {
    key: clientActionId || action,
    clientActionId,
  });
},
```

## 6.4 Telegram navigation controller

```js
// src/platform/useTelegramGameNavigation.js
import { useEffect } from "react";
import {
  backButton,
  closingBehavior,
} from "@telegram-apps/sdk";

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
    try {
      backButton.mount();
      if (activeGame && (hasOpenPanel || hasActiveRun)) backButton.show();
      else backButton.hide();

      const off = backButton.onClick(() => {
        if (hasOpenPanel) return closePanel();
        if (hasActiveRun) return pauseRun();
        return exitToHub();
      });

      return () => off();
    } catch {
      return undefined;
    }
  }, [activeGame, closePanel, exitToHub, hasActiveRun, hasOpenPanel, pauseRun]);

  useEffect(() => {
    try {
      closingBehavior.mount();
      if (hasActiveRun || hasPendingActions) closingBehavior.enableConfirmation();
      else closingBehavior.disableConfirmation();
    } catch {
      // Non-Telegram browser fallback.
    }
  }, [hasActiveRun, hasPendingActions]);
}
```

## 6.5 Game event ledger

Problem: every game invents its own small feedback. A unified event ledger makes rewards, sync, reconnect, and errors consistent.

```js
// src/game-state/gameEvents.js
import { create } from "zustand";

export const useGameEvents = create((set) => ({
  events: [],
  pushEvent: (event) => set((state) => ({
    events: [
      {
        id: event.id || `${event.type}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
        ttlMs: event.ttlMs || 2200,
        ...event,
      },
      ...state.events,
    ].slice(0, 8),
  })),
  dismissEvent: (id) => set((state) => ({
    events: state.events.filter((event) => event.id !== id),
  })),
}));
```

Usage:

```jsx
pushEvent({
  game: "merge",
  type: "reward",
  title: "Recipe discovered",
  value: "+12 Essence",
});
```

## 6.6 Splitting Pixi scenes without changing public API

```js
// src/game-runtime/scenes.js
export { buildBloxScene } from "./scenes/bloxScene.js";
export { buildMatch3Scene } from "./scenes/match3Scene.js";
export { buildMergeScene } from "./scenes/mergeScene.js";
export { buildBubboScene } from "./scenes/bubboScene.js";
export { buildFarmScene } from "./scenes/farmScene.js";
```

```js
// src/game-runtime/scenes/shared/layout.js
export function fitWithTopReserve(size, rows, cols, topReserve, bottomReserve, options) {
  // Move existing helper here unchanged first.
}

export function publishCanvasLayout(container, layout) {
  // Move existing helper here unchanged first.
}
```

Rule: first PR should be mechanical split only, with tests/build proving behavior unchanged. UX changes come after.

## 6.7 Validation matrix

Minimum validation for shared shell/navigation changes:

```powershell
pnpm test
pnpm run build
pnpm run perf:guard -- --suite pointer-session,blox.place,match3.resolve,bubbo.apply-shot,merge.apply-generator --repeat 2
```

Minimum browser smoke after Telegram/touch/HUD changes:

```powershell
pnpm exec playwright test tests/e2e/multi-game-logic-smoke.spec.js --project="Mobile Chrome" --workers=1
pnpm exec playwright test tests/e2e/garden-shelf.spec.js --project="Mobile Chrome" --workers=1
```

For Merge or runtime asset changes:

```powershell
pnpm run assets:build
pnpm run perf:guard:build
pnpm run perf:guard:browser
```

## 7. Recommended roadmap

## Phase 1: Foundation pass

Goal: make the whole hub behave like one high-quality Telegram game app.

1. Add `GAME_REGISTRY`.
2. Add adaptive HUD descriptors.
3. Add shared Telegram Back Button / Closing Confirmation controller.
4. Generalize reliable actions: receipt for run actions, outbox only where retries are safe.
5. Add game event ledger and shared reward/error toasts.
6. Split `scenes.js` mechanically.

Expected UX win:

- Back behavior becomes predictable.
- Closing during active play stops being risky.
- Players see relevant resources per game.
- Future game work becomes faster and safer.

## Phase 2: Per-game UX pass

1. Garden Shelf:
   - explicit plant action affordance,
   - quieter sync status,
   - segmented bottom panel,
   - reliable `garden.sync`.

2. Building Blox:
   - optimistic placement,
   - predicted line clears,
   - one hint per run,
   - daily challenge seed.

3. Gem Crush:
   - snapshot-first run restore,
   - stronger timed mode,
   - cascade summary feedback,
   - daily objective.

4. Gacha Merge:
   - source chips,
   - server-clock cooldowns,
   - recipe clue layer,
   - soft trash undo.

5. Bubbo:
   - aim assist option,
   - pressure danger ladder,
   - active run resume banner,
   - safer finish flow.

6. Brain Blitz:
   - real answer timing,
   - shared shell,
   - reveal phase,
   - realtime duel updates.

7. Cozy Yard:
   - HUD simplification,
   - next visitor/gift timeline,
   - placement zone overlay,
   - component split.

## Phase 3: Retention and content spine

1. Add daily hub quests rotating across games.
2. Add cross-game reward language:
   - Merge creates Yard rewards.
   - Garden produces passive gold and daily care.
   - Blox/Match-3/Bubbo/Trivia produce streak, score, and quest progress.
3. Add "today" screen inside Hub, not a landing page:
   - current quest,
   - active run resume,
   - pending rewards,
   - next visitor/garden ready hints.

## 8. Priority list

P0:

- Add Back Button / close behavior for active run and open panels.
- Make non-Yard critical actions duplicate-safe with `clientActionId`.
- Fix Trivia real `timeMs` before time-based scoring is trusted.
- Keep Merge/Farm critical action paths immediate, not delayed batching.

P1:

- Adaptive HUD per active game.
- Split Pixi scenes mechanically.
- Blox optimistic placement.
- Match-3 run restore and timed-mode clarity.
- Bubbo resume/danger/aim assist.
- Yard HUD simplification.

P2:

- Daily hub quests.
- Unified reward toasts.
- Better audio event palette.
- More generated/runtime art for Merge and Bubbo.
- Optional fullscreen request flow for games where Telegram client supports it.

## 9. Implementation cautions

1. Preserve existing external contracts. `routes/player.js` is the main authority for shared player mutation.
2. Do not move Merge semantics to the nearest existing field. Free taps are real charges, Essence is server-authoritative, and Exchange claim windows matter.
3. Do not reintroduce delayed batching for critical Farm/Merge-like actions that need immediate confirmation.
4. Do not turn Garden economy display scaling into economy rebalance.
5. Treat gesture isolation as correctness, not polish.
6. Do not loosen perf budgets to declare success.
7. Use current asset replacement contracts. Not every key in `public/assets/manifest.json` is a live resolver override.

## 10. What I would implement first

If the goal is maximum UX improvement with controlled risk, start here:

1. `src/platform/useTelegramGameNavigation.js`
2. `src/app/gameRegistry.js`
3. `src/app/useGameHudDescriptors.js`
4. `src/game-state/reliableActions.js`
5. `src/game-state/gameEvents.js`
6. `TriviaGame.jsx` real timing fix
7. `BloxGame.jsx` optimistic placement preview
8. `MergeGame.jsx` server-clock cooldown + generator chips
9. `BubboGame.jsx` resume banner + pressure danger label
10. `CompanionYardGame.jsx` activity pill + reduced permanent HUD
11. Farm import/performance audit; remove only with measured benefit, otherwise keep hidden

This order improves Telegram-native safety first, then visible player feel, then deeper game progression.
