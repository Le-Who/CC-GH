/** Finite PostgreSQL15 acceptance: no SQL mocks or in-memory fallback.
 * The code-owned product capability remains false; only a pinned CI loader enables it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertCanonicalPgEnvironment,CANONICAL_PG_NOW as NOW,CANONICAL_PG_HOUR as HOUR} from './helpers/yard-canonical-pg-guard.mjs';
import {assertYardV2FixtureId} from './helpers/yard-v2-pg-guard.mjs';

if(process.env.YARD_CANONICAL_PG_TEST!=='1'){
  test('Canonical PostgreSQL requires explicit disposable CI opt-in',{skip:'Not executed; no PostgreSQL acceptance evidence'},()=>{});
}else{
  assertCanonicalPgEnvironment();
  await import('./helpers/yard-canonical-pg-loader.mjs');
  const {initDb,ensureDbSchema,getDb,closeDb}=await import('../db.js');
  const {applyActionWithReceipt,buildSnapshot}=await import('../routes/player.js');
  const {createDefaultPlayer,checkAchievements}=await import('../game-logic.js');
  const {ensurePersistentPlayerYard}=await import('../game-logic/yard-v2/service.mjs');
  const {CANONICAL_ITEM_PLACEMENT_ENABLED,CANONICAL_MAX_PLACEMENTS}=await import('../game-logic/yard-v2/canonical-locations.mjs');
  const {digest}=await import('../game-logic/yard-v2/util.mjs');
  const {canonicalFixture,canonicalPayload,assertCanonicalIsolation}=await import('./helpers/yard-canonical-item-fixture.mjs');
  const {yardV2PgProcesses}=await import('./helpers/yard-v2-pg-processes.mjs');
  const processes=yardV2PgProcesses({workerFile:fileURLToPath(new URL('./helpers/yard-canonical-pg-worker.mjs',import.meta.url))});
  const ids=[],success=r=>assert.equal(r.outcome.status,200,JSON.stringify(r.outcome.body));
  const request=(action='yard.placeGoodie',extra={})=>({action,payload:canonicalPayload({slotId:'canonical:pg-one',...extra}),clientActionId:`yard-v2:canonical-v1/pg-${randomUUID()}`,now:NOW});
  // These are the real player envelope fields that every withPlayerLock commit updates.
  const withoutEnvelope=p=>{const copy=structuredClone(p);for(const key of ['_version','_syncSeq','_lastSeen'])delete copy[key];return copy;};
  const isolated=(before,after)=>assertCanonicalIsolation(withoutEnvelope(before),withoutEnvelope(after));
  const unchanged=(before,after)=>assert.deepEqual(withoutEnvelope(after),withoutEnvelope(before));
  function receipt(p,c,status=200){
    const r=p._yardV2.runtime.commandReceipts?.[c.clientActionId];
    assert.ok(r);assert.equal(r.format,'yard-action-receipt/v1');assert.equal(r.actionId,c.clientActionId);
    assert.equal(r.action,c.action);assert.equal(r.requestHash,digest({action:c.action,payload:c.payload}));assert.equal(r.status,status);assert.equal(r.at,c.now);
    assert.equal(p._actionReceipts?.items?.filter(row=>row.clientActionId===c.clientActionId).length||0,0);
    return structuredClone(r);
  }
  async function load(id){assertYardV2FixtureId(id);const [row]=await getDb()`SELECT data FROM players WHERE id=${id}`;assert.ok(row);return row.data;}
  async function seed({bare=false}={}){
    const id=assertYardV2FixtureId(`yard_v2_pg_${randomUUID()}`),p=bare?createDefaultPlayer(id,'Canonical PG fixture',NOW):canonicalFixture();
    p.id=id;p._onboarded=true;p._version=randomUUID();p._syncSeq=0;
    if(bare){
      p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.goodieInventory.leaf_pot=2;
      p.yard.bowls[0]={...p.yard.bowls[0],foodId:'kibble',servings:3,placedAt:NOW,expiresAt:NOW+2*HOUR};
      assert.equal(ensurePersistentPlayerYard(p,{now:NOW}).status,200);
    }
    buildSnapshot(p);checkAchievements(p);ids.push(id);
    await getDb()`INSERT INTO players(id,data) VALUES(${id},${p})`;
    return {id,player:await load(id)};
  }

  test('canonical items: actual PostgreSQL15, API receipts and cross-process OCC',{timeout:180000},async t=>{
    t.mock.method(Date,'now',()=>NOW);
    try{
      assert.equal(CANONICAL_ITEM_PLACEMENT_ENABLED,true,'Test preload must be applied before product imports');
      assert.equal(CANONICAL_MAX_PLACEMENTS,2,'The reviewed scene admits exactly two owned T2 instances');
      const preflight=canonicalFixture(),c=request(),probe=await applyActionWithReceipt(preflight,c.action,c.payload,{clientActionId:c.clientActionId,serverNow:NOW});
      assert.equal(probe.status,200,JSON.stringify(probe.body));
      assert.equal(probe.body.snapshot.yardRuntime.itemPlacementCapabilities.enabled,true);
      assert.equal(probe.body.snapshot.yardRuntime.itemPlacementCapabilities.visitAdmission,false);
      assert.equal(probe.body.snapshot.yardRuntime.itemPlacementCapabilities.maxPlacements,2);
      assert.equal(probe.body.snapshot.yardRuntime.itemPlacementCapabilities.items.leaf_pot.capacity,1,'Per-item visitor capacity and economics are unchanged');
      assert.equal(Object.hasOwn(probe.body.snapshot,'_yardV2'),false);
      assert.ok(initDb(),'Real PostgreSQL required; no memory fallback');await ensureDbSchema();
      const [db]=await getDb()`SELECT current_database() AS name,current_user AS username,current_setting('server_version_num')::int AS version`;
      assert.equal(db.name,'ccgh_merge_ci');assert.equal(db.username,'ccgh_merge_ci');assert.ok(db.version>=150000&&db.version<160000,'PostgreSQL15 required');

      await t.test('same nonce racing across two processes commits one inventory debit and one durable receipt',async()=>{
        const {id,player}=await seed(),c=request(),results=await processes.race(id,[c,c]);results.forEach(success);
        assert.equal(results.filter(r=>r.outcome.body.duplicate).length,1);
        assert.deepEqual(results[0].outcome.body.placement,results[1].outcome.body.placement);
        const saved=await load(id);assert.equal(saved.yard.goodieInventory.leaf_pot,1);assert.equal(saved._yardV2.version,2);
        assert.equal(saved._yardV2.runtime.canonicalPlacements.length,1);assert.deepEqual(Object.keys(saved._yardV2.runtime.commandReceipts),[c.clientActionId]);
        const first=receipt(saved,c);isolated(player,saved);
        const replay=await processes.separate(id,c);success(replay);assert.equal(replay.outcome.body.duplicate,true);
        const reloaded=await load(id);assert.deepEqual(receipt(reloaded,c),first);unchanged(saved,reloaded);
      });

      await t.test('two distinct placements survive a CAS race; simultaneous third and fourth slots cannot debit again',async()=>{
        const {id,player}=await seed(),commands=[request(),request('yard.placeGoodie',{slotId:'canonical:pg-two',x:72,y:145})];
        const results=await processes.race(id,commands);results.forEach(success);
        const saved=await load(id);assert.equal(saved.yard.goodieInventory.leaf_pot,undefined,'Zero ownership uses the actual sparse inventory representation');
        assert.deepEqual(saved._yardV2.runtime.canonicalPlacements.map(r=>r.slotId).sort(),['canonical:pg-one','canonical:pg-two']);
        assert.equal(Object.keys(saved._yardV2.runtime.commandReceipts).length,2);for(const c of commands)receipt(saved,c);isolated(player,saved);
        const overflow=[request('yard.placeGoodie',{slotId:'canonical:pg-three',x:88,y:172}),request('yard.placeGoodie',{slotId:'canonical:pg-four',x:49,y:120})];
        const rejected=await processes.race(id,overflow);
        for(const r of rejected){assert.equal(r.outcome.status,400);assert.equal(r.outcome.body.error,'CANONICAL_LOCATION_CAPACITY_REACHED');}
        const full=await load(id);assert.equal(full.yard.goodieInventory.leaf_pot,undefined);assert.deepEqual(full._yardV2.runtime.canonicalPlacements,saved._yardV2.runtime.canonicalPlacements);
        assert.equal(Object.keys(full._yardV2.runtime.commandReceipts).length,4);for(const c of overflow)receipt(full,c,400);isolated(player,full);
        assert.equal((await processes.separate(id,overflow[0])).outcome.status,400);unchanged(full,await load(id));
        const overlapMove=request('yard.moveGoodie',{x:72,y:145}),blocked=await processes.separate(id,overlapMove);
        assert.equal(blocked.outcome.status,400);assert.equal(blocked.outcome.body.error,'CANONICAL_PLACEMENT_INVALID');
        const unmoved=await load(id);assert.deepEqual(unmoved._yardV2.runtime.canonicalPlacements,saved._yardV2.runtime.canonicalPlacements);assert.equal(unmoved.yard.goodieInventory.leaf_pot,undefined);receipt(unmoved,overlapMove,400);isolated(player,unmoved);
      });

      await t.test('distinct nonces race for the remaining second slot without a third placement or debit',async()=>{
        const {id,player}=await seed();success(await processes.separate(id,request()));
        const commands=[request('yard.placeGoodie',{slotId:'canonical:pg-two',x:72,y:145}),request('yard.placeGoodie',{slotId:'canonical:pg-three',x:88,y:172})];
        const results=await processes.race(id,commands);assert.deepEqual(results.map(r=>r.outcome.status).sort(),[200,400]);
        const winner=results.findIndex(r=>r.outcome.status===200),loser=1-winner;
        assert.equal(results[loser].outcome.body.error,'CANONICAL_LOCATION_CAPACITY_REACHED');
        const saved=await load(id);assert.equal(saved.yard.goodieInventory.leaf_pot,undefined);
        assert.deepEqual(saved._yardV2.runtime.canonicalPlacements.map(r=>r.slotId).sort(),['canonical:pg-one',commands[winner].payload.slotId].sort());
        assert.equal(Object.keys(saved._yardV2.runtime.commandReceipts).length,3);receipt(saved,commands[winner]);receipt(saved,commands[loser],400);isolated(player,saved);
        assert.equal((await processes.separate(id,commands[loser])).outcome.status,400);unchanged(saved,await load(id));
      });

      await t.test('overlapping distinct-slot race rejects one even while the second capacity slot remains available',async()=>{
        const {id,player}=await seed(),commands=[request(),request('yard.placeGoodie',{slotId:'canonical:pg-two'})];
        const results=await processes.race(id,commands);assert.deepEqual(results.map(r=>r.outcome.status).sort(),[200,400]);
        const winner=results.findIndex(r=>r.outcome.status===200),loser=1-winner;
        assert.equal(results[loser].outcome.body.error,'CANONICAL_PLACEMENT_INVALID');
        const saved=await load(id);assert.equal(saved.yard.goodieInventory.leaf_pot,1);assert.equal(saved._yardV2.runtime.canonicalPlacements.length,1);
        assert.equal(saved._yardV2.runtime.canonicalPlacements[0].slotId,commands[winner].payload.slotId);
        assert.equal(Object.keys(saved._yardV2.runtime.commandReceipts).length,2);receipt(saved,commands[winner]);receipt(saved,commands[loser],400);isolated(player,saved);
        assert.equal((await processes.separate(id,commands[loser])).outcome.status,400);unchanged(saved,await load(id));
      });

      await t.test('concurrent pickup refunds one selected unit and preserves the other; both units return exactly once',async()=>{
        const {id,player}=await seed();(await processes.race(id,[request(),request('yard.placeGoodie',{slotId:'canonical:pg-two',x:72,y:145})])).forEach(success);
        const other=structuredClone((await load(id))._yardV2.runtime.canonicalPlacements.find(r=>r.slotId==='canonical:pg-two'));
        const pickup=request('yard.pickupGoodie'),results=await processes.race(id,[pickup,pickup]);results.forEach(success);
        assert.equal(results.filter(r=>r.outcome.body.duplicate).length,1);
        const saved=await load(id);assert.equal(saved.yard.goodieInventory.leaf_pot,1);assert.deepEqual(saved._yardV2.runtime.canonicalPlacements,[other]);receipt(saved,pickup);isolated(player,saved);
        const another=request('yard.pickupGoodie'),rejected=await processes.separate(id,another);
        assert.equal(rejected.outcome.status,400);assert.equal(rejected.outcome.body.error,'CANONICAL_SLOT_NOT_FOUND');
        const after=await load(id);assert.equal(after.yard.goodieInventory.leaf_pot,1);assert.deepEqual(after._yardV2.runtime.canonicalPlacements,[other]);receipt(after,another,400);isolated(player,after);
        const secondPickup=request('yard.pickupGoodie',{slotId:'canonical:pg-two',x:72,y:145});success(await processes.separate(id,secondPickup));
        const empty=await load(id);assert.equal(empty.yard.goodieInventory.leaf_pot,2);assert.deepEqual(empty._yardV2.runtime.canonicalPlacements,[]);receipt(empty,secondPickup);isolated(player,empty);
        const replay=await processes.separate(id,secondPickup);success(replay);assert.equal(replay.outcome.body.duplicate,true);unchanged(empty,await load(id));
      });

      await t.test('lost second-placement reply survives pool restart, fresh worker replay and a subsequent move beside the first',async()=>{
        const {id,player}=await seed(),firstCommand=request();success(await processes.separate(id,firstCommand));
        const firstPlacement=structuredClone((await load(id))._yardV2.runtime.canonicalPlacements[0]);
        const c=request('yard.placeGoodie',{slotId:'canonical:pg-two',x:72,y:145}),lost=await processes.separate(id,c,{loseResponse:true});assert.equal(lost.outcome,undefined);
        const committed=await load(id),first=receipt(committed,c);assert.equal(committed.yard.goodieInventory.leaf_pot,undefined);assert.equal(committed._yardV2.runtime.canonicalPlacements.length,2);
        await closeDb();assert.ok(initDb());await ensureDbSchema();
        const replay=await processes.separate(id,c);success(replay);assert.notEqual(replay.pid,lost.pid);assert.equal(replay.outcome.body.duplicate,true);
        const reloaded=await load(id);assert.deepEqual(receipt(reloaded,c),first);unchanged(committed,reloaded);
        const conflict=await processes.separate(id,{...c,payload:{...c.payload,x:88,y:172}});
        assert.equal(conflict.outcome.status,409);assert.equal(conflict.outcome.body.error,'ACTION_ID_PAYLOAD_CONFLICT');unchanged(committed,await load(id));
        const move=request('yard.moveGoodie',{slotId:'canonical:pg-two',x:88,y:172});success(await processes.separate(id,move));
        const moved=await load(id);assert.equal(moved.yard.goodieInventory.leaf_pot,undefined);
        assert.deepEqual(moved._yardV2.runtime.canonicalPlacements.find(r=>r.slotId==='canonical:pg-one'),firstPlacement);
        const second=moved._yardV2.runtime.canonicalPlacements.find(r=>r.slotId==='canonical:pg-two');assert.equal(second.x,88);assert.equal(second.y,172);
        assert.deepEqual(receipt(moved,c),first);receipt(moved,move);isolated(player,moved);
      });

      await t.test('ordinary Match3 save and canonical placement both survive a genuine shared-version CAS collision',async()=>{
        const {id,player}=await seed(),place=request(),sync={action:'match3.syncMode',payload:{savedModes:{classic:{score:7}}},clientActionId:`canonical-pg:match3:${randomUUID()}`,now:NOW};
        const results=await processes.race(id,[place,sync]);results.forEach(success);
        const saved=await load(id);assert.equal(saved.yard.goodieInventory.leaf_pot,1);assert.equal(saved._yardV2.runtime.canonicalPlacements.length,1);receipt(saved,place);
        assert.deepEqual(saved.match3,{...player.match3,savedModes:JSON.stringify(sync.payload.savedModes)});
        assert.equal(saved._actionReceipts.items.length,1);assert.equal(saved._actionReceipts.items[0].clientActionId,sync.clientActionId);
        const expected=structuredClone(player);expected.match3=saved.match3;expected._actionReceipts=saved._actionReceipts;isolated(expected,saved);
        for(const c of [place,sync]){const replay=await processes.separate(id,c);success(replay);assert.equal(replay.outcome.body.duplicate,true);}
        unchanged(saved,await load(id));
      });

      await t.test('two persisted canonical items admit no visits, food consumption, wear, gifts or photos after ordinary advancement',async()=>{
        const {id}=await seed({bare:true});(await processes.race(id,[request(),request('yard.placeGoodie',{slotId:'canonical:pg-two',x:72,y:145})])).forEach(success);
        const before=await load(id),rows=structuredClone(before._yardV2.runtime.canonicalPlacements);assert.equal(rows.length,2);
        success(await processes.separate(id,{operation:'canonical.advance',payload:{},now:NOW+HOUR}));
        const after=await load(id);assert.deepEqual(after._yardV2.runtime.canonicalPlacements,rows);assert.deepEqual(after._yardV2.runtime.visits,{});
        assert.deepEqual(after.yard.placedGoodies,[]);assert.deepEqual(after.yard.activeVisitors,[]);assert.deepEqual(after.yard.pendingGifts,[]);assert.deepEqual(after.yard.album.photos,[]);
        assert.deepEqual(after.yard.bowls,before.yard.bowls);assert.deepEqual(after.yard.currencies,before.yard.currencies);assert.deepEqual(after.yard.goodieInventory,before.yard.goodieInventory);assert.deepEqual(after._yardV2.migration,before._yardV2.migration);
        const photo=await processes.separate(id,{action:'yard.capturePhoto',payload:{visitId:'canonical:pg-one'},clientActionId:`yard-v2:pg-photo:${randomUUID()}`,now:NOW+HOUR});
        assert.equal(photo.outcome.status,400);assert.deepEqual((await load(id)).yard.album.photos,[]);
      });
    }finally{
      await processes.dispose();
      try{if(getDb())for(const id of ids){assertYardV2FixtureId(id);await getDb()`DELETE FROM players WHERE id=${id}`;}}
      finally{await closeDb();}
    }
  });
}
