import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../src/games/companion-yard-v2/courtyard.css', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../src/games/companion-yard-v2/CourtyardGame.jsx', import.meta.url), 'utf8');
const room = JSON.parse(fs.readFileSync(new URL('../src/app/hud-layout/defaultLayouts/room.json', import.meta.url), 'utf8'));
// These source guards protect the intentionally local skin change. Real layout,
// image balance and font rasterization still require the browser QA matrix.
const chrome = css.slice(css.indexOf('/* Quiet navigation chrome.'));
const rules = selector => [...chrome.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selectors]) => selectors.trim() === selector).map(([, , declarations]) => declarations);
const last = selector => rules(selector).at(-1) || '';

test('every navigation target keeps its painted button surface in all profiles', () => {
  assert.match(last('.cy-actions button::before'), /display:block/);
  assert.match(last('.cy-actions button::before'), /border-image:var\(--cy-button-art\)/);
  assert.doesNotMatch(last('.cy-actions button::before'), /display:none/);
  assert.match(css, /--cy-button-art:url\('\/assets\/yard-ui\/surfaces\/yard-ui-button-sage-be06b62e0b3e.webp'\)/);
});

test('short visible labels and richer accessible names are preserved', () => {
  const dock = component.slice(component.indexOf('<HudRegion id="yardBottomDock"'), component.indexOf('<dialog ref={dialog}'));
  assert.match(dock, /const label=id==='decor'\?t\('yard.persistent.decorShort'\):title;/);
  assert.match(dock, /<strong>\{label\}<\/strong>/);
  assert.match(dock, /aria-label=\{accessibleName\}/);
  assert.ok(dock.includes("const accessibleName=`${label===title?'':`${label}. `}${title}. ${detail}`;"));
  assert.match(dock, /aria-pressed=\{menuSelection===id\}/);
  assert.match(dock, /aria-expanded=\{panel===id\}/);
  assert.match(rules('.cy-actions strong')[0], /display:block/);
  assert.match(rules('.cy-actions strong')[0], /line-height:16px/);
  assert.doesNotMatch(chrome, /\.cy-actions strong\{[^}]*\b(?:transform|filter|opacity):/);
});

test('selected state is persistent and has a non-color label cue', () => {
  assert.match(last('.cy-actions button[aria-pressed="true"]'), /outline:2px solid var\(--cy-sage\)/);
  assert.match(last('.cy-actions button[aria-pressed="true"] strong'), /text-decoration:underline/);
  assert.match(last('.cy-actions button[aria-pressed="true"] strong'), /text-decoration-thickness:2px/);
});

test('soft separators stay in the gap between targets in both orientations', () => {
  assert.match(rules('.cy-actions button+button::after')[0], /left:-5px/);
  assert.match(rules('.cy-actions button+button::after')[0], /linear-gradient\(to bottom,transparent,#87985b66,transparent\)/);
  assert.match(last('.cy-actions button+button::after'), /top:-5px/);
  assert.match(last('.cy-actions button+button::after'), /linear-gradient\(to right,transparent,#87985b66,transparent\)/);
});

test('focus and press feedback do not move or scale text', () => {
  assert.match(last('.cy-actions button:focus-visible'), /outline:3px solid #715019/);
  assert.match(last('.cy-actions button:focus-visible'), /outline-offset:2px/);
  assert.match(last('.cy-actions button:active::before'), /filter:brightness\(\.94\)/);
  assert.doesNotMatch(chrome, /\.cy-actions[^{}]*\{[^}]*transform:/);
  assert.match(chrome, /@media\(prefers-reduced-motion:reduce\)\{\.cy-actions button\{transition:none\}\}/);
});

test('button art does not change the registered dock or gameplay reserves', () => {
  assert.equal(room.base.regions.yardBottomDock.thickness, 68);
  assert.equal(room.base.regions.yardBottomDock.reserve, 80);
  assert.equal(room.profiles['phone-landscape'].regions.yardBottomDock.thickness, 76);
  assert.match(chrome, /"nav" 68px/);
  assert.match(chrome, /\/minmax\(0,1fr\) 76px/);
  assert.match(rules('.cy-actions button')[0], /height:56px/);
  assert.match(rules('.cy-actions button')[1], /width:64px;height:64px/);
});
