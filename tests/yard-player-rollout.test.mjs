import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gameLoadingGraph} from '../scripts/game-loading-graph.mjs';
import {withNormalizedSnapshot} from '../src/game-state/inventory.js';
import {yardReleasePresentation} from '../src/games/companion-yard-v2/release-presentation.mjs';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_PLAYER_RELEASE_POLICY,usesPersistentYard} from '../game-logic/yard-v2/release-policy.mjs';
import {initializeReleasedPlayerYard,releasedYardSnapshot,executeReleasedYardAction,inspectReleasedYardGrantTarget} from '../game-logic/yard-v2/player-release.mjs';
import {ensurePersistentPlayerYard} from '../game-logic/yard-v2/service.mjs';
const {applyMigrations}=await import('../playerManager.js');
const {buildSnapshot,applyActionWithReceipt}=await import('../routes/player.js');
import {FAMILY_SOURCE_PROP_PROFILES,YARD_PROP_PROFILES} from '../game-logic/yard-v2/released-prop-profiles.mjs';
const NOW=Date.UTC(2026,9,4,0),copy=structuredClone;
function player(){const p=createDefaultPlayer('rollout-fixture','Fixture',NOW);p.yard.lastSimulatedAt=NOW;p.yard.currencies.treats=5000;return p;}
function historical(){const p=player();p.yard.future={keep:['opaque']};p.yard.pendingGifts=Array.from({length:105},(_,i)=>({id:`gift-${i}`,visitorId:'mika_cat',treats:1,shinyTreats:0,createdAt:NOW,opaque:i}));p.yard.album.photos=Array.from({length:110},(_,i)=>({id:`photo-${i}`,visitorId:'mika_cat',capturedAt:NOW,opaque:i}));return p;}
test('ordinary release remains closed and legacy accounts are not migrated',async t=>{
 t.mock.method(Date,'now',()=>NOW);assert.equal(YARD_PLAYER_RELEASE_POLICY.enabled,false);assert.ok(Object.isFrozen(YARD_PLAYER_RELEASE_POLICY));
 const p=player();assert.equal(usesPersistentYard(p),false);applyMigrations(p);const s=buildSnapshot(p);assert.equal(p._yardV2,undefined);assert.equal(s.yardRuntime,undefined);
 const result=await applyActionWithReceipt(p,'yard.buyFood',{foodId:'kibble'},{clientActionId:'legacy-rollout-proof',serverNow:NOW});assert.equal(result.status,200);assert.equal(p._yardV2,undefined);
 const policy=readFileSync(new URL('../game-logic/yard-v2/release-policy.mjs',import.meta.url),'utf8');assert.doesNotMatch(policy,/process\.env|localStorage|URLSearchParams/);
});
test('a migrated account remains byte-preserved and read-only after code-owned rollout closes',async t=>{
 t.mock.method(Date,'now',()=>NOW);const p=historical();assert.equal(ensurePersistentPlayerYard(p,{now:NOW}).status,200);const before=copy({yard:p.yard,storage:p._yardV2});
 applyMigrations(p);initializeReleasedPlayerYard(p,{now:NOW+7*86400000,simulate:true});const view=buildSnapshot(p);
 assert.equal(view.yardRuntime.mutable,false);assert.equal(view.yardRuntime.status,'rollout-paused');assert.equal(view.yardRuntime.error,'YARD_ROLLOUT_PAUSED');
 const result=await applyActionWithReceipt(p,'yard.collectGifts',{}, {clientActionId:'yard-v2:held',serverNow:NOW+86400000});assert.equal(result.status,409);assert.equal(result.body.error,'YARD_ROLLOUT_PAUSED');
 assert.equal(inspectReleasedYardGrantTarget(p).status,409);assert.deepEqual({yard:p.yard,storage:p._yardV2},before);assert.equal(p.yard.pendingGifts.length,105);assert.equal(p.yard.album.photos.length,110);
});
test('malformed/future v2 marker never falls through to a legacy starter grant or simulator',t=>{
 t.mock.method(Date,'now',()=>NOW);for(const marker of [null,{format:'future',version:99}]){const p=player();p._yardV2=marker;p.yard=null;const before=JSON.stringify({yard:p.yard,v2:p._yardV2});applyMigrations(p);const view=buildSnapshot(p);assert.equal(view.yardRuntime.mutable,false);assert.equal(JSON.stringify({yard:p.yard,v2:p._yardV2}),before);}
});
test('family geometry is source-owned but unreleased until every family profile and acceptance agrees',()=>{
 assert.deepEqual(Object.keys(FAMILY_SOURCE_PROP_PROFILES),['moon_lamp','fountain_bowl']);assert.equal(YARD_PROP_PROFILES.moon_lamp,undefined);assert.equal(YARD_PROP_PROFILES.fountain_bowl,undefined);
 for(const p of Object.values(FAMILY_SOURCE_PROP_PROFILES)){assert.deepEqual(p.conditions,['new','worn','broken']);assert.ok(p.footprint.width>0&&p.footprint.height>0);}
});
test('candidate room uses Home lifecycle and loading graph counts the actual new entry',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');assert.match(read('src/games/companion-yard-v2/YardReleaseGame.jsx'),/if\(mode==='read-only'\)return <section/);assert.match(read('src/games/companion-yard-v2/YardReleaseGame.jsx'),/yardReleasePresentation\(state.snapshot\)/);assert.match(read('src/games/companion-yard-v2/CourtyardGame.jsx'),/onClick=\{openHome\}/);assert.match(read('scripts/game-loading-graph.mjs'),/'companion-yard-v2': 'src\/games\/companion-yard-v2\/CourtyardGame\.jsx'/);
});
test('test-only active wiring exercises real routes and modeled commit/failure contracts with actor gates closed',()=>{
 const result=spawnSync(process.execPath,['--import','./tests/helpers/yard-player-rollout-test-loader.mjs','--test','tests/helpers/yard-player-active.checks.mjs'],{cwd:new URL('..',import.meta.url),env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='NODE_TEST_CONTEXT')),NODE_ENV:'test',YARD_PLAYER_WIRING_TEST:'1',DATABASE_URL:'',REDIS_URL:'',NODE_OPTIONS:''},encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/(?:tests 5|# tests 5)/,result.stdout);
});

test('actual snapshot to client normalization selects a non-gameplay shell for preserved malformed lists',t=>{
 t.mock.method(Date,'now',()=>NOW);
 for(const key of ['placedGoodies','bowls','activeVisitors','pendingGifts'])for(const value of [{opaque:'preserve'},'future-list',42]){
  const p=player();p._yardV2={version:99,format:'future'};p.yard[key]=value;const before=JSON.stringify({yard:p.yard,v2:p._yardV2});
  const snapshot=withNormalizedSnapshot(buildSnapshot(p));assert.equal(yardReleasePresentation(snapshot),'read-only');assert.equal(snapshot.yardRuntime.mutable,false);assert.equal(JSON.stringify({yard:p.yard,v2:p._yardV2}),before);
 }
 const p=player();p._yardV2=null;p.yard.album={photos:{opaque:'preserve'}};const snapshot=withNormalizedSnapshot(buildSnapshot(p));assert.equal(yardReleasePresentation(snapshot),'read-only');
 assert.equal(yardReleasePresentation({yardRuntime:{version:99,mutable:true}}),'read-only');assert.equal(yardReleasePresentation({yardRuntime:{version:1,mutable:true}}),'persistent');assert.equal(yardReleasePresentation({}),'legacy');
});

test('inherited invalid Yard economic evidence remains snapshot-blocked without weakening Merge validation',async t=>{
 t.mock.method(Date,'now',()=>NOW);
 for(const change of [p=>p.yard.currencies.treats='broken',p=>p.yard.goodieInventory='broken',p=>p.yard.currencies={opaque:'future'}]){
  const p=player();assert.equal(ensurePersistentPlayerYard(p,{now:NOW}).status,200);change(p);const before=structuredClone({yard:p.yard,storage:p._yardV2,merge:p.merge,fence:p._mergeLabFence});
  assert.throws(()=>buildSnapshot(p),e=>['INVALID_INTEGER','INVALID_DATA'].includes(e.code));assert.deepEqual({yard:p.yard,storage:p._yardV2,merge:p.merge,fence:p._mergeLabFence},before);assert.equal(inspectReleasedYardGrantTarget(p).status,409);
 }
 const valid=player();ensurePersistentPlayerYard(valid,{now:NOW});const snapshot=buildSnapshot(valid);assert.equal(snapshot.merge.schemaVersion,3,'pausing valid Yard must not reopen legacy Merge');const mergeBefore=structuredClone(valid.merge);const denied=await applyActionWithReceipt(valid,'merge.claimFreeTaps',{},{});assert.equal(denied.status,410);assert.deepEqual(valid.merge,mergeBefore,'legacy free charges cannot return during Yard pause');
});

test('generated loading graph includes room wrapper and both real presentation entries',()=>{
 const plugin=gameLoadingGraph(),root=fileURLToPath(new URL('..',import.meta.url));plugin.configResolved({root});let emitted;
 const chunk=(fileName,source,dynamicImports=[])=>({type:'chunk',fileName,modules:{[root+source]:{renderedLength:100}},imports:[],dynamicImports,isEntry:false});
 plugin.generateBundle.call({emitFile:file=>{emitted=JSON.parse(file.source);}}, {}, {
  'room.js':chunk('room.js','src/games/companion-yard-v2/YardReleaseGame.jsx',['legacy.js','courtyard.js']),
  'legacy.js':chunk('legacy.js','src/games/companion-yard/CompanionYardGame.jsx'),
  'courtyard.js':chunk('courtyard.js','src/games/companion-yard-v2/CourtyardGame.jsx')});
 assert.equal(emitted.entries['yard-player-entry'],'room.js');assert.equal(emitted.entries['companion-yard'],'legacy.js');assert.equal(emitted.entries['companion-yard-v2'],'courtyard.js');assert.deepEqual(emitted.chunks.find(c=>c.file==='room.js').dynamicImports,['legacy.js','courtyard.js']);
});
