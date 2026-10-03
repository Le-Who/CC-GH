import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveTriviaLayout, resolveTriviaRemainingInsets } from '../src/games/trivia/triviaLayout.js';
import { TRIVIA_COPY, triviaText } from '../src/games/trivia/triviaCopy.js';
import { hudLayoutRegistry } from '../src/app/hud-layout/registry.js';
import { HUD_LAYOUT_DEFAULTS } from '../src/app/hud-layout/defaultLayouts/index.js';
import { resolveHudLayout, validateHudLayout } from '../src/app/hud-layout/resolver.js';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const game = read('src/games/trivia/TriviaGame.jsx');
const controller = read('src/games/trivia/triviaController.js');
const css = read('src/games/trivia/trivia-presentation.css');
const MATRIX = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[375,812],[384,832],[393,873],[412,915],[430,932],[520,216]];

test('all actual Trivia regions have game-scoped definitions and defaults', () => {
  const ids = [...game.matchAll(/(?:id|data-hud-region)="((?:trivia|gameplayHud)[A-Za-z]*)"/g)].map(m => m[1]);
  assert.ok(ids.length >= 10);
  for (const id of ids) { assert.ok(hudLayoutRegistry.games.trivia.regions[id], id); assert.ok(HUD_LAYOUT_DEFAULTS.trivia.base.regions[id], id); }
  for (const id of ['triviaSetup','triviaResult','triviaFeedback','triviaAnswerGrid','triviaLifelineDock','triviaShell','triviaQuestionPanel','triviaPausePanel']) {
    const capabilities = hudLayoutRegistry.games.trivia.regions[id].capabilities;
    assert.equal(capabilities.mode, 'custom', id); assert.equal(capabilities.draggable, false, id); assert.equal(capabilities.resizable, false, id);
  }
  for (const id of ['triviaBackgroundAsset','triviaQuestionSurfaceAsset']) { assert.equal(hudLayoutRegistry.games.trivia.regions[id].capabilities.asset, true); }
});
test('layout registry validation and orientation contracts cover all required viewports', () => {
  const validation = validateHudLayout(HUD_LAYOUT_DEFAULTS.trivia, { knownRegionIds: hudLayoutRegistry.allRegionIds, knownGameIds: ['trivia'], source: 'repo' });
  assert.deepEqual(validation.errors, []);
  for (const [width, height] of MATRIX) {
    const resolved = resolveHudLayout({ repoLayout: HUD_LAYOUT_DEFAULTS.trivia, viewport: { width, height } });
    const layout = resolveTriviaLayout({ width, height }, resolved.regions);
    assert.equal(layout.answerColumns, width > height ? 2 : 1);
    assert.equal(layout.controlMinSize, 44); assert.equal(layout.answerMinHeight, 58);
    assert.ok(layout.width > 0 && layout.height > 0);
  }
});
test('production App already-consumed top/bottom safe area is never counted twice', () => {
  const viewport = { width: 390, height: 844, safeAreaInsets: { top: 24, right: 0, bottom: 20, left: 0 } };
  const bounds = { width: 378, height: 790, top: 28, bottom: 818, left: 6, right: 384 };
  assert.deepEqual(resolveTriviaRemainingInsets(viewport, bounds), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(resolveTriviaLayout({ ...bounds, safeAreaInsets: resolveTriviaRemainingInsets(viewport, bounds) }).height, 766);
});
test('landscape side-notch consumes only the portion outside host padding', () => {
  const viewport = { width: 844, height: 390, safeAreaInsets: { top: 0, right: 20, bottom: 16, left: 30 } };
  const bounds = { top: 6, bottom: 368, left: 6, right: 838 };
  assert.deepEqual(resolveTriviaRemainingInsets(viewport, bounds), { top: 0, right: 14, bottom: 0, left: 24 });
  assert.deepEqual(resolveTriviaRemainingInsets(viewport, { top: 50, bottom: 350, left: 35, right: 800 }), { top: 0, right: 0, bottom: 0, left: 0 });
});
test('remaining-inset adapter uses actual viewport coordinates during HUD editor preview', () => {
  const viewport = { width: 390, height: 844, layoutViewport: { width: 1280, height: 900 }, safeAreaInsets: { top: 24, right: 10, bottom: 20, left: 10 } };
  assert.deepEqual(resolveTriviaRemainingInsets(viewport, { top: 30, bottom: 874, left: 450, right: 840 }), { top: 0, right: 0, bottom: 0, left: 0 });
});
test('runtime shares remaining safe area between flow and dialog; resize remeasures boundaries', () => {
  assert.match(game, /resolveTriviaRemainingInsets\(viewport, size\)/);
  assert.match(game, /safeAreaInsets: remainingInsets/);
  assert.match(game, /top: r\.top, right: r\.right, bottom: r\.bottom, left: r\.left/);
  assert.match(game, /viewport\.safeAreaInsets\?\.left/);
  assert.doesNotMatch(css, /--tg-|--safe-(?:top|bottom|left|right)/);
  const dialog = css.match(/\.trv2-dialog \{([^}]+)\}/)[1];
  for (const side of ['top','right','bottom','left']) assert.ok(dialog.includes(`--trv2-inset-${side}`));
});
test('R3 React inert ownership and focus restoration survive integration unchanged', () => {
  assert.match(game, /inert=\{state\.paused \|\| undefined\}/);
  assert.equal(game.split('useDialogFocus(ref, { inertSiblings: false });').length - 1, 1);
  assert.match(game, /role="dialog" aria-modal="true"/);
  assert.match(game, /data-dialog-focus-fallback="true"/);
  for (const action of ['trv2-resume','trv2-finish','trv2-pause-exit']) assert.ok(game.includes(action));
});
test('shell navigation retains active-run, pending-setup, Back and explicit cleanup contract', () => {
  const app = read('src/App.jsx');
  assert.match(game, /activeRun: active \|\| !!state\.roomId \|\| !!state\.busy/);
  assert.match(game, /openPanel: state\.paused/);
  assert.match(game, /closePanel: \(\) => controller\.back\(\)/);
  assert.match(game, /useImmersiveGame\('trivia', true, controls\)/);
  assert.match(app, /closePanel: homeOpen \? closeHome : activeGameControls\?\.closePanel/);
  assert.match(controller, /'\/api\/trivia\/forfeit'/); assert.match(controller, /'\/api\/trivia\/duel\/leave'/);
});
test('every production mutation endpoint keeps requireAuth; no preview transport enters runtime', () => {
  const routes = read('routes/trivia.js');
  const endpoints = [...controller.matchAll(/'(\/api\/trivia\/[^']+)'/g)].map(m => m[1]).filter(p => !p.endsWith('/history'));
  for (const endpoint of new Set(endpoints)) assert.ok(routes.includes(`router.post("${endpoint}", requireAuth`), endpoint);
  assert.match(game, /import \{ api \} from '..\/..\/services\/apiClient.js'/);
  for (const file of readdirSync(new URL('src/games/trivia/', root)).filter(f => /\.(?:jsx?|css)$/.test(f))) assert.doesNotMatch(read(`src/games/trivia/${file}`), /(?:routeHarness|server-core|preview\/trivia|127\.0\.0\.1|devAuthEnabled)/);
});
test('all ten runtime art files retain verified production-art hashes and WebP headers', () => {
  const audit = JSON.parse(read('tests/fixtures/trivia-runtime-assets.json'));
  assert.equal(new Set(audit.assets.map(asset => asset.source)).size, 10);
  for (const asset of audit.assets) { const bytes = readFileSync(new URL(asset.export, root)); assert.equal(bytes.length, asset.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256); }
  const files = readdirSync(new URL('public/games/trivia-v2/', root)).sort(); assert.equal(files.length, 10);
  for (const file of files) { const bytes = readFileSync(new URL(`public/games/trivia-v2/${file}`, root)); assert.equal(bytes.subarray(0,4).toString(), 'RIFF'); assert.equal(bytes.subarray(8,12).toString(), 'WEBP'); assert.ok(bytes.length > 1000); }
  for (const match of css.matchAll(/\/games\/trivia-v2\/([^')]+)/g)) assert.ok(files.includes(match[1]), match[1]);
});
test('English/Russian labels are complete and interpolation is preserved', () => {
  assert.deepEqual(Object.keys(TRIVIA_COPY.en).sort(), Object.keys(TRIVIA_COPY.ru).sort());
  for (const language of ['en','ru']) assert.ok(!triviaText(language, 'question', { current: 2, total: 4 }).includes('{'));
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /focus-visible/);
});
test('direct game imports resolve against production source plus shared focus-helper closure', () => {
  const entry = new URL('src/games/trivia/TriviaGame.jsx', root);
  for (const match of game.matchAll(/import\s+(?:[^;]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) assert.ok(existsSync(new URL(match[1], entry)), match[1]);
  }
  assert.ok(existsSync(new URL('src/app/dialogFocus.js', root)));
});

test('migrated integrated e2e flows exercise real routes, inert restoration, reachability and generated art', () => {
  const helper = read('tests/e2e/helpers/triviaR3.js');
  assert.match(helper, /waitForResponse[^\n]+\/api\/trivia\/start/);
  assert.match(helper, /waitForResponse[^\n]+\/api\/trivia\/forfeit/);
  assert.match(helper, /toHaveJSProperty\('inert', true\)/);
  assert.match(helper, /toHaveJSProperty\('inert', false\)/);
  assert.match(helper, /scrollIntoViewIfNeeded/);
  assert.match(helper, /elementFromPoint/);
  assert.match(helper, /borderImageSource/);
  for (const spec of ['minigames','glass-ui','mobile-ui-matrix','hud-redesign-runtime-coverage']) {
    const source = read(`tests/e2e/${spec}.spec.js`);
    assert.match(source, /\.\/helpers\/triviaR3\.js/);
    assert.doesNotMatch(source, /\.trivia-shell|\.trivia-card|\.question-panel|\.answer-grid|data-pause-menu="trivia"/);
  }
});
