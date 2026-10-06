/** Finite file-persistence fixture: real API action/snapshot/migration functions,
 * no HTTP listener, database, Redis, actor gate or production policy change. */
import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync,renameSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const capabilityURL=new URL('../game-logic/yard-v2/canonical-locations.mjs',import.meta.url).href;
registerHooks({load(url,context,next){
  if(url!==capabilityURL)return next(url,context);
  const source=readFileSync(new URL(url),'utf8'),closed='export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;';
  assert.equal(source.split(closed).length,2,'Exact inactive code-owned capability required');
  return {shortCircuit:true,format:'module',source:source.replace(closed,'export const CANONICAL_ITEM_PLACEMENT_ENABLED = true;')};
}});
const {applyActionWithReceipt,buildSnapshot}=await import('../routes/player.js');
const {applyMigrations}=await import('../playerManager.js');
const {NOW,canonicalFixture,canonicalPayload,assertCanonicalIsolation}=await import('./helpers/yard-canonical-item-fixture.mjs');

test('reserved canonical nonce rejects generic-first and special-domain requests before mutation or receipt loss',async t=>{
  t.mock.method(Date,'now',()=>NOW);
  for(const [action,payload]of [
    ['match3.syncMode',{savedModes:{classic:{score:99}}}],
    ['garden.r2.reconcile',{}],['garden.r2',{command:'collect'}],['merge.lab',{command:'craft'}],
    ['yard.buyFood',{foodId:'kibble',qty:1}],
  ])for(const nonce of ['yard-v2:canonical-v1/generic-first','yard-v2:canonical-v1/bad/tail','yard-v2:canonical-v1/',' yard-v2:canonical-v1/leading-space']){
    const p=canonicalFixture(),before=structuredClone(p);
    const rejected=await applyActionWithReceipt(p,action,payload,{clientActionId:nonce,serverNow:NOW});
    assert.equal(rejected.status,409,`${action}: ${nonce}`);assert.equal(rejected.body.error,'CANONICAL_ACTION_UNSUPPORTED');
    assert.deepEqual(p,before,'No domain dispatch, shared-inventory debit, receipt or normalization is allowed');
  }
  const p=canonicalFixture(),before=structuredClone(p),nonce='yard-v2:canonical-v1/generic-first';
  assert.equal((await applyActionWithReceipt(p,'match3.syncMode',{savedModes:{classic:{score:99}}},{clientActionId:nonce,serverNow:NOW})).status,409);
  assert.deepEqual(p,before);
  // The rejected request created no receipt and performed no operation. The
  // correctly typed intent can still commit once, then fences every other action.
  const placed=await applyActionWithReceipt(p,'yard.placeGoodie',canonicalPayload(),{clientActionId:nonce,serverNow:NOW});
  assert.equal(placed.status,200);assert.equal(p.yard.goodieInventory.leaf_pot,1);
  assert.equal(Object.keys(p._yardV2.runtime.commandReceipts).length,1);
  const once=structuredClone(p);
  const conflict=await applyActionWithReceipt(p,'match3.syncMode',{savedModes:{classic:{score:99}}},{clientActionId:nonce,serverNow:NOW});
  assert.equal(conflict.body.error,'ACTION_ID_PAYLOAD_CONFLICT');assert.deepEqual(p,once);
  const replay=await applyActionWithReceipt(p,'yard.placeGoodie',canonicalPayload(),{clientActionId:nonce,serverNow:NOW});
  assert.equal(replay.body.duplicate,true);assert.deepEqual(p,once);
  const bad=canonicalFixture(),badBefore=structuredClone(bad);
  assert.equal((await applyActionWithReceipt(bad,'yard.placeGoodie',canonicalPayload(),{clientActionId:'yard-v2:canonical-v1/bad/tail',serverNow:NOW})).body.error,'CANONICAL_NONCE_REQUIRED');
  assert.deepEqual(bad,badBefore);
});

test('real API envelope survives disk reload, lost response, old-client unrelated sync and exact-once pickup',async t=>{
  t.mock.method(Date,'now',()=>NOW);
  const directory=mkdtempSync(join(tmpdir(),'yard-canonical-')),file=join(directory,'player.json');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const save=p=>{writeFileSync(file+'.next',JSON.stringify(p));renameSync(file+'.next',file);};
  const load=()=>JSON.parse(readFileSync(file,'utf8'));
  const initial=canonicalFixture();buildSnapshot(initial);save(initial);const before=load();
  // Each request reads persisted state anew, then commits state and receipt together.
  const request=async(action,payload,clientActionId,{loseResponse=false}={})=>{
    const p=load();applyMigrations(p);
    const response=await applyActionWithReceipt(p,action,payload,{serverNow:NOW,clientActionId});
    save(p);if(loseResponse)throw Error('SIMULATED_COMMITTED_RESPONSE_LOSS');return response;
  };
  const place=canonicalPayload(),nonce='yard-v2:canonical-v1/api-place';
  await assert.rejects(request('yard.placeGoodie',place,nonce,{loseResponse:true}),/COMMITTED_RESPONSE_LOSS/);
  assert.equal(load().yard.goodieInventory.leaf_pot,1);assert.equal(load()._yardV2.version,2);
  assertCanonicalIsolation(before,load());
  const once=load(),replay=await request('yard.placeGoodie',place,nonce);
  assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);assert.deepEqual(load(),once);
  assert.deepEqual(replay.body.snapshot.yardRuntime.canonicalPlacements,once._yardV2.runtime.canonicalPlacements);
  assert.equal(replay.body.snapshot.yardRuntime.itemPlacementCapabilities.enabled,true);
  assert.equal(Object.hasOwn(replay.body.snapshot,'_yardV2'),false,'Server-owned storage is never sent as client save state');
  const conflict=await request('yard.placeGoodie',{...place,x:72,y:145},nonce);
  assert.equal(conflict.status,409);assert.equal(conflict.body.code,'ACTION_ID_PAYLOAD_CONFLICT');assert.deepEqual(load(),once);
  const crossAction=await request('match3.syncMode',{savedModes:{classic:{score:99}}},nonce);
  assert.equal(crossAction.status,409);assert.equal(crossAction.body.error,'ACTION_ID_PAYLOAD_CONFLICT');assert.deepEqual(load(),once);
  const blocker=canonicalPayload({slotId:'canonical:blocker',x:72,y:145}),blockerNonce='yard-v2:canonical-v1/api-blocker';
  await assert.rejects(request('yard.placeGoodie',blocker,blockerNonce,{loseResponse:true}),/COMMITTED_RESPONSE_LOSS/);
  const both=load();assert.equal(both.yard.goodieInventory.leaf_pot,undefined);assert.equal(both._yardV2.runtime.canonicalPlacements.length,2);
  const blockerReplay=await request('yard.placeGoodie',blocker,blockerNonce);
  assert.equal(blockerReplay.body.duplicate,true);assert.deepEqual(load(),both);
  assert.deepEqual(blockerReplay.body.snapshot.yardRuntime.canonicalPlacements,both._yardV2.runtime.canonicalPlacements);
  const moved=await request('yard.moveGoodie',{...place,x:115,y:100},'yard-v2:canonical-v1/api-move');
  assert.equal(moved.status,200);assert.equal(load()._yardV2.runtime.canonicalPlacements[0].x,115);
  assert.deepEqual(load()._yardV2.runtime.canonicalPlacements[1],both._yardV2.runtime.canonicalPlacements[1]);
  const stored=load()._yardV2;
  // An older hub client knows only its game field; forged stale Yard fields in
  // its payload are ignored by the actual action route rather than merged in.
  const sync=await request('match3.syncMode',{savedModes:{classic:{score:7}},yard:before.yard,_yardV2:before._yardV2},'old-client:match3-sync');
  assert.equal(sync.status,200);assert.deepEqual(load()._yardV2,stored);
  assert.deepEqual(JSON.parse(load().match3.savedModes),{classic:{score:7}});
  const pickupNonce='yard-v2:canonical-v1/api-pickup';
  assert.equal((await request('yard.pickupGoodie',place,pickupNonce)).status,200);
  const picked=load();assert.equal(picked.yard.goodieInventory.leaf_pot,1);assert.equal(picked._yardV2.version,2);
  assert.deepEqual(picked._yardV2.runtime.canonicalPlacements,[both._yardV2.runtime.canonicalPlacements[1]]);
  assert.equal((await request('yard.pickupGoodie',place,pickupNonce)).body.duplicate,true);assert.deepEqual(load(),picked);
  assert.equal((await request('yard.pickupGoodie',blocker,'yard-v2:canonical-v1/api-blocker-pickup')).status,200);
  assert.equal(load().yard.goodieInventory.leaf_pot,2);assert.deepEqual(load()._yardV2.runtime.canonicalPlacements,[]);
});
