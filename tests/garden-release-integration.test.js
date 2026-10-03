import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import repoLayout from '../src/app/hud-layout/defaultLayouts/garden.json' with { type: 'json' };
import { resolveHudLayout, validateHudLayout } from '../src/app/hud-layout/resolver.js';
import { hudLayoutRegistry } from '../src/app/hud-layout/registry.js';
import { resolveGardenComposition } from '../src/games/garden-shelf/gardenComposition.js';
import { getGardenHostVariables, applyGardenHostLayout } from '../src/games/garden-shelf/gardenHostLayout.js';
import { livingPlantSpecies, makeLivingPlantArt } from '../src/games/garden-shelf/living/living-plant-art.mjs';
import { loadAssetPipelineEntries } from '../scripts/assets-pipeline.config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewports = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
const resolve = (width, height) => resolveHudLayout({ repoLayout, viewport: { width, height, orientation: width >= height ? 'landscape' : 'portrait', aspectRatio: width / height } });

test('Garden defaults contain all registered custom and asset regions', () => {
  const result = validateHudLayout(repoLayout, { knownRegionIds: hudLayoutRegistry.allRegionIds, knownGameIds: ['garden'], source: 'repo' });
  assert.deepEqual(result.errors, []);
  for (const id of ['gardenComposition','gardenStatusRail','gardenSheet','gardenQuestSheet','gardenBackgroundAsset','gardenSignAsset','gardenShelfAsset']) {
    assert.ok(repoLayout.base.regions[id], id);
    assert.ok(hudLayoutRegistry.games.garden.regions[id], id);
  }
});

test('all nine required viewports plus extended portrait resolve finite three-slot geometry', () => {
  for (const [width, height] of viewports) {
    const hudLayout = resolve(width, height);
    const host = getGardenHostVariables(hudLayout);
    const padding = parseFloat(host['--garden-host-padding']);
    const local = resolveGardenComposition({ width: width - padding * 2, height: height - padding - parseFloat(host['--garden-dock-reserve']), hudLayout });
    for (const [key, value] of Object.entries(local)) if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0, `${width}x${height} ${key}`);
    assert.ok(local.spotWidth >= 44, `${width}x${height}: three accessible plant targets fit`);
    assert.ok(local.rackWidth <= local.shelfWidth);
    assert.ok(Math.abs(local.spotWidth * 3 + local.spotGap * 2 - local.rackWidth) < 1e-8);
    if (width > height) assert.equal(local.landscape, true, `${width}x${height}: separate landscape composition`);
  }
});

test('safe insets are subtracted once by the composition adapter when supplied explicitly', () => {
  const a = resolveGardenComposition({width: 844, height: 390, safe: {left: 44,right: 44,top: 12,bottom: 21}});
  const b = resolveGardenComposition({width: 756, height: 357});
  for (const key of ['rackWidth','rail','shelfWidth','shelfHeight','spotWidth','landscape','compact']) assert.equal(a[key], b[key], key);
});

test('transient or malformed measurements and overrides cannot generate NaN or negative geometry', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, 'bad', -10, 0]) {
    const layout = resolveGardenComposition({ width:value, height:value, safe:{top:value,left:value}, hudLayout:{regions:{gardenComposition:{padding:value,gap:value,rackMax:value,railRatio:value}}} });
    for (const [key, item] of Object.entries(layout)) if (typeof item === 'number') assert.ok(Number.isFinite(item) && item >= 0, key);
  }
});

test('production host releases the global dock reserve in phone and landscape', () => {
  assert.equal(getGardenHostVariables(resolve(390,844))['--garden-dock-reserve'], '0px');
  assert.equal(getGardenHostVariables(resolve(844,390))['--garden-dock-reserve'], '0px');
  assert.equal(getGardenHostVariables({regions:{bottomDock:{visible:false}}})['--garden-dock-reserve'], '0px');
});

test('production host adapter restores owned style and marker after unmount', () => {
  const attrs = new Map(), styles = new Map([['--garden-host-padding','5px']]);
  const host = { getAttribute:key=>attrs.get(key) ?? null, setAttribute:(key,value)=>attrs.set(key,value), removeAttribute:key=>attrs.delete(key), style:{ getPropertyValue:key=>styles.get(key)||'',getPropertyPriority:()=>'',setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key) } };
  const restore = applyGardenHostLayout(host, resolve(390,844));
  assert.equal(attrs.get('data-garden-presentation'),'living');
  assert.equal(styles.get('--garden-dock-reserve'),'0px');
  restore(); restore();
  assert.deepEqual([...attrs],[]);
  assert.deepEqual([...styles],[['--garden-host-padding','5px']]);
  applyGardenHostLayout(null)();
});

test('all fourteen species and four phases resolve to exactly 56 runtime WebP images', () => {
  const React = { useRef:()=>({current:null}),useState:value=>[value,()=>{}],useEffect:()=>{},createElement:(type,props,...children)=>({type,props,children}) };
  const Plant = makeLivingPlantArt(React), files = new Set();
  assert.equal(livingPlantSpecies.length,14);
  for (const type of livingPlantSpecies) for (let phase=0; phase<4; phase++) {
    const node = Plant({plant:{id:'saved-plant',type,phase}}), image = node.children[0];
    assert.equal(image.type,'img');
    const filename = path.join(root,'public',image.props.src);
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.subarray(0,4).toString(),'RIFF');
    assert.equal(bytes.subarray(8,12).toString(),'WEBP');
    files.add(path.basename(filename));
  }
  assert.equal(files.size,56);
  assert.deepEqual(fs.readdirSync(path.join(root,'public/games/garden-living')).sort(),[...files].sort());
  assert.ok(!files.has('lavender-seedling-r1.webp'));
});

test('runtime UI asset closure includes every component and CSS art reference', () => {
  const names = ['background','button','coin','leaf','panel','pot','quest','shelf','sign','water'];
  assert.deepEqual(fs.readdirSync(path.join(root,'public/games/garden-v2')).sort(),names.map(name=>name+'.webp').sort());
  assert.ok(fs.statSync(path.join(root,'public/games/garden-shelf/assets_transparent.png')).size > 0, 'legacy fallback remains available');
});

test('asset pipeline preserves pre-encoded Garden public art and its legacy fallback entry', async () => {
  const entries = await loadAssetPipelineEntries(root);
  assert.ok(entries.some(entry => entry.key === 'gardenShelf.sheet.transparent' && entry.source === 'public/games/garden-shelf/assets_transparent.png'));
  assert.equal(entries.filter(entry => /public\/games\/garden-(living|v2)\//.test(entry.source)).length, 0, 'verified WebP files are not re-encoded');
  const pipeline = fs.readFileSync(path.join(root,'scripts/assets-pipeline.mjs'),'utf8');
  assert.match(pipeline, /const DEFAULT_OUTPUT_ROOT = "public\/assets-runtime"/);
  assert.match(pipeline, /const allowed = path\.resolve\(rootDir, "public", "assets-runtime"\)/);
  assert.match(pipeline, /Refusing to clean unexpected asset output path/);
  const vite = fs.readFileSync(path.join(root,'vite.config.js'),'utf8');
  assert.doesNotMatch(vite, /publicDir\s*:\s*false|copyPublicDir\s*:\s*false/);
  assert.ok(vite.includes('url.pathname.startsWith("/games/")'), 'production runtime art cache covers direct Garden URLs');
});

test('R3 inventory thumbnails remain static and never register a WebGL surface', () => {
  const effects=[],image={style:{removeProperty:key=>{assert.equal(key,'visibility');image.restored=true;}}};
  const node={dataset:{},closest:selector=>selector==='.gs2-catalog'?{}:{},querySelector:()=>image};
  let refs=0;
  const React={useRef:()=>({current:refs++===0?node:null}),useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn),createElement:()=>({})};
  makeLivingPlantArt(React)({plant:{id:'inventory-plant',type:'daisy',phase:3}});
  for(const effect of effects)effect();
  assert.equal(node.dataset.livingMode,'static-catalog');assert.equal(image.restored,true);
});

test('production modules retain real hub actions and exclude QA host imports', () => {
  const game = fs.readFileSync(path.join(root,'src/games/garden-shelf/GardenShelfGame.tsx'),'utf8');
  for (const action of ['garden.goldDelta','garden.sync','garden.resetEconomy','garden.levelUp']) assert.ok(game.includes(action));
  assert.match(game,/useGameHub\.getState\(\)\.performAction/);
  for (const name of ['GardenShelfGame.tsx','GardenPresentation.tsx','gardenHostLayout.js']) {
    const source = fs.readFileSync(path.join(root,'src/games/garden-shelf',name),'utf8');
    assert.doesNotMatch(source,/preview\/garden|fixture|request-policy|__GARDEN_PREVIEW__/);
  }
});
