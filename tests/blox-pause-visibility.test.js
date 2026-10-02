import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import layout from '../src/app/hud-layout/defaultLayouts/blox.json' with { type: 'json' };
import { resolveHudLayout, getHudRegionRuntimeStyle } from '../src/app/hud-layout/resolver.js';
import { renderArcadePresentation, findElements } from './helpers/arcadePresentationHarness.js';

const sizes = [[320,568],[360,800],[390,844],[414,896],[495,772],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[375,812]];
const intersects = (a,b) => a.left < b.left+b.width && b.left < a.left+a.width && a.top < b.top+b.height && b.top < a.top+a.height;
function renderedRegions(width, height, safe = {}, repoLayout = layout) {
  // The actual outer shell consumes raw host insets before measuring this stage.
  const viewport = { width: width-(safe.left||0)-(safe.right||0), height: height-(safe.top||0)-(safe.bottom||0) };
  const resolved = resolveHudLayout({ repoLayout, viewport: { ...viewport, safeAreaInsets: safe } });
  const { tree } = renderArcadePresentation('blox', {}, viewport, resolved);
  const nodes = Object.fromEntries(['bloxActions', 'gameplayHud'].map(id => [id, findElements(tree,node => node.props.id === id)[0]]));
  const styles = Object.fromEntries(Object.entries(nodes).map(([id,node]) => [id,{ ...getHudRegionRuntimeStyle(resolved.regions[id]), ...node.props.style }]));
  const buttons = findElements(nodes.bloxActions, node => node.type === 'button');
  return { viewport, nodes, styles, buttons };
}

test('actual Blox live render keeps Pause/Rotate above the overlapping score-panel region in every supported profile', () => {
  for (const [width,height] of sizes) for (const safe of [{}, {top:24,right:12,bottom:20,left:12}]) {
    const { viewport, nodes, styles, buttons } = renderedRegions(width,height,safe);
    assert.equal(buttons.length,2);
    const pause = buttons.find(node => node.props['data-game-pause']);
    assert.ok(pause,`${width}x${height}: the live render must contain Pause`);
    assert.equal(pause.props['aria-label'],'common.pause');
    assert.notEqual(pause.props.disabled,true);
    assert.ok(styles.bloxActions.zIndex > styles.gameplayHud.zIndex,`${width}x${height}: sibling paint order must expose the actions`);
    assert.match(nodes.gameplayHud.props.style.borderImageSlice,/fill/,'the actual HUD uses a filled image, not just a border');
    const actions=styles.bloxActions;
    assert.ok(actions.left>=0 && actions.top>=0 && actions.left+actions.width<=viewport.width && actions.top+actions.height<=viewport.height);
    assert.ok(actions.width>=96 && actions.height>=44,'two 44px actions plus their 8px gap');
    if(viewport.width<=viewport.height) assert.ok(intersects(actions,styles.gameplayHud),'portrait intentionally reserves space inside the score panel');
  }
});

test('negative control reproduces the screenshot: original region styles put an opaque HUD above still-hittable Pause/Rotate', () => {
  const original=structuredClone(layout);
  delete original.base.regions.bloxActions.zIndex;
  const old=renderedRegions(495,772,{},original),fixed=renderedRegions(495,772);
  assert.ok(intersects(old.styles.bloxActions,old.styles.gameplayHud));
  assert.ok((old.styles.bloxActions.zIndex??0)<old.styles.gameplayHud.zIndex);
  assert.equal(old.buttons.find(node=>node.props['data-game-pause']).props.onClick instanceof Function,true);
  assert.ok(fixed.styles.bloxActions.zIndex>fixed.styles.gameplayHud.zIndex);
  for(const key of ['left','top','width','height']) assert.equal(fixed.styles.bloxActions[key],old.styles.bloxActions[key],'layer fix must preserve action geometry');
  const css=fs.readFileSync(new URL('../src/games/blox/blox-presentation.css',import.meta.url),'utf8');
  assert.match(css,/\.bx-hud\{pointer-events:none\}/,'the old cover is invisible to ordinary elementFromPoint hit tests');
  assert.match(css,/\.bx-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(44px,1fr\)\);gap:8px\}/);
});
