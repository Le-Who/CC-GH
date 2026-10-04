import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_REGISTRY } from '../src/app/gameRegistry.js';
import { createResourceGate } from './e2e/helpers/resourceGate.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('entry presentation is selected synchronously, without manufacturing controller readiness', () => {
  const app = read('src/App.jsx');
  assert.match(app, /const immersivePresentation = getGameDefinition\(activeTab\)\?\.shell === "game" \|\| shellActive;/);
  assert.match(app, /\$\{immersivePresentation \? " immersive-mode" : ""\}/);
  assert.match(app, /activeTab === "garden" \|\| !!activeGameControls/);
  assert.match(app, /leaveGameForHome\(\{ state, controls, accountId:/);
  for (const game of ['blox', 'match3', 'merge', 'bubbo', 'trivia', 'room', 'settlement']) assert.equal(GAME_REGISTRY[game].shell, 'game');
  // The source fix must not move passive lifecycle hooks or relax the existing
  // saved-run leave barrier just to make the loading shell look ready.
  const hooks = read('src/app/gameHooks.js'), navigation = read('src/app/homeNavigation.js');
  assert.doesNotMatch(hooks, /useLayoutEffect/);
  assert.match(hooks, /useEffect\(\(\) => \{\s*setActiveGameShell/);
  assert.match(navigation, /state.activeTab !== 'garden' && \(!controls \|\| controls.id !== state.activeTab\)/);

});

test('snapshot and chunk loading share an art-free status and per-game solid base', () => {
  const chunks = read('src/app/gameChunks.jsx'), app = read('src/App.jsx'), css = read('src/index.css');
  assert.match(app, /<GameEntryFallback label=\{t\("app.loading"\)\}/);
  assert.match(chunks, /fallback=\{<GameEntryFallback label=\{t\("app.loadingGame"\)\}/);
  const fallback = chunks.slice(chunks.indexOf('export function GameEntryFallback'), chunks.indexOf('export function ActiveGame'));
  assert.match(fallback, /role="status"/);
  assert.doesNotMatch(fallback, /loading-panel|<img|backgroundImage|panel-button/);
  const loadingCss = css.slice(css.indexOf('/* Entry surfaces are shell-owned'));
  assert.doesNotMatch(loadingCss, /url\(|gradient\(/);
  for (const game of Object.keys(GAME_REGISTRY).filter(id => GAME_REGISTRY[id].visible)) assert.ok(loadingCss.includes(`data-active-tab="${game}"`), game);
  assert.match(loadingCss, /#root \{ background: #101923; \}/);
  assert.match(loadingCss, /main\.telegram-app\[data-active-tab\] \.active-game-frame/);
});

test('the delayed browser fixture holds exact requests and releases overlapping prefixes safely', async () => {
  const gate = createResourceGate();
  gate.hold(['/games/', '/games/blox-v2/', '/api/player/snapshot']);
  let blox = false, garden = false, snapshot = false;
  const a = gate.wait('/games/blox-v2/background.webp').then(() => { blox = true; });
  const b = gate.wait('/games/garden-v2/panel.webp').then(() => { garden = true; });
  const c = gate.wait('/api/player/snapshot').then(() => { snapshot = true; });
  await gate.wait('/assets/main.js');
  gate.release(['/games/']); await Promise.resolve();
  assert.equal(garden, true); assert.equal(blox, false); assert.equal(snapshot, false);
  gate.release(['/api/player/snapshot']); await c; assert.equal(snapshot, true);
  gate.release(); await Promise.all([a, b]); assert.equal(blox, true); assert.deepEqual(gate.pending(), []);
});
