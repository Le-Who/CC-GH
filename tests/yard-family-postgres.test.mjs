/** Parent CI gate only. Fixture profiles admit closed source candidates through
 * the actual domain service and real PostgreSQL CAS; this does not activate HTTP/player media. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertFamilyPgGate} from './helpers/yard-family-pg-guard.mjs';
import {assertYardV2FixtureId} from './helpers/yard-v2-pg-guard.mjs';
if(process.env.YARD_FAMILY_PG_TEST!=='1'){
 test('Family real PostgreSQL acceptance was not executed',{skip:'Requires isolated parent PostgreSQL15 CI; no persistence evidence'},()=>{});
}else{
 assertFamilyPgGate();
 const {initDb,ensureDbSchema,getDb,closeDb}=await import('../db.js');
 const {ensurePersistentPlayerYard,publicPersistentYard}=await import('../game-logic/yard-v2/service.mjs');
 const {createEightAcceptanceOptions}=await import('./fixtures/yard-eight-canonical/acceptance.mjs');
 const {nativePlayer,nativeDrawForSeed,EIGHT_FIXTURE_SPECS,NOW,H}=await import('./helpers/yard-eight-domain-fixtures.mjs');
 const {makeYardV2PgFixture,gardenCommand}=await import('./helpers/yard-v2-pg-fixture.mjs');
 const {yardV2PgProcesses}=await import('./helpers/yard-v2-pg-processes.mjs');
 const {YARD_GOODIES}=await import('../game-logic/yard-v2/catalog.mjs');
 const {checkAchievements}=await import('../game-logic.js');
 const {FAMILY_ASSETS}=await import('../game-logic/yard-v2/media/family-assets.mjs');
 const {conditionAtUses}=await import('../game-logic/yard-v2/family-media-source.mjs');
 const options=createEightAcceptanceOptions(),ids=[],processes=yardV2PgProcesses({workerFile:fileURLToPath(new URL('./helpers/yard-family-pg-worker.mjs',import.meta.url)),waitTimeoutMs:120000});
 const copy=structuredClone,success=r=>assert.equal(r.outcome.status,200,JSON.stringify(r.outcome));
 const adjacent=p=>({merge:p.merge,fence:p._mergeLabFence,garden:p.garden,gardenAccounting:p.gardenAccounting,gardenProgress:p._gardenProgression,
  resources:p.resources,purchases:p.purchases,retainedFixtureField:p.retainedFixtureField,futureAccount:p.futureAccount});
 async function load(id){assertYardV2FixtureId(id);const[row]=await getDb()`SELECT data FROM players WHERE id=${id}`;assert.ok(row);return row.data;}
 async function seed(actor,uses){
  const s=EIGHT_FIXTURE_SPECS[actor],condition=conditionAtUses(uses,YARD_GOODIES[s.goodieId].durability);let id;
  for(let i=0;i<10000;i++){const candidate=assertYardV2FixtureId(`yard_v2_pg_${randomUUID()}`),draw=nativeDrawForSeed(candidate,s,condition);if(draw?.visitorId===s.visitorId&&draw.activityId===s.activityId){id=candidate;break;}}
  assert.ok(id,'Native UUID seed required, not a fabricated outcome');
  const fixture=makeYardV2PgFixture({now:NOW}),native=nativePlayer(actor,{uses,id}),player=fixture.player;
  const grantedInventory=copy(player.yard.goodieInventory);
  player.id=id;player.yard=native.yard;Object.assign(player.yard.goodieInventory,grantedInventory);
  player.futureAccount={preserve:'family PostgreSQL'};delete player._yardV2;
  checkAchievements(player);
  // Preserve actual historical Merge grants and adjacent Garden data; never fabricate grants.
  assert.equal(ensurePersistentPlayerYard(player,{...options,now:NOW}).status,200);
  ids.push(id);await getDb()`INSERT INTO players(id,data) VALUES(${id},${player})`;return{id,player:await load(id)};
 }
 const advance=now=>({operation:'family.advance',payload:{},now});
 const collect=now=>({operation:'family.collect',payload:{},now,clientActionId:`yard-v2:family-pg-collect:${randomUUID()}`});
 test('actual family condition/reward PostgreSQL15 persistence and separate-process OCC',{timeout:1200000},async t=>{
  try{
   assert.ok(initDb(),'No PostgreSQL handle; refusing memory fallback');await ensureDbSchema();
   const[db]=await getDb()`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;assert.equal(db.name,'ccgh_merge_ci');assert.ok(db.version>=150000&&db.version<160000);
   for(const actor of ['willow','starlit','basil','sage']){
    const d=YARD_GOODIES[EIGHT_FIXTURE_SPECS[actor].goodieId].durability;
    for(const uses of [0,d-1,2*d-1])await t.test(`${actor} ${conditionAtUses(uses+1,d)}: native use, pool restart, completion and collect OCC`,async()=>{
     const {id,player}=await seed(actor,uses),beforeAdjacent=copy(adjacent(player));
     const admitted=await processes.separate(id,advance(NOW+H),{loseResponse:true});assert.equal(admitted.outcome,undefined);
     await closeDb();assert.ok(initDb());await ensureDbSchema();const active=await load(id),rows=Object.values(active._yardV2.runtime.visits);assert.equal(rows.length,1);
     const visit=rows[0],plan=visit.mediaAdmission.plan,condition=conditionAtUses(uses+1,d),clip=FAMILY_ASSETS[actor].clips[plan.clipId];
     assert.equal(visit.original.visitorId,EIGHT_FIXTURE_SPECS[actor].visitorId);assert.equal(visit.activityId,EIGHT_FIXTURE_SPECS[actor].activityId);assert.deepEqual(clip.conditions,[condition]);
     assert.equal(plan.conditionReceipt.usesBefore,uses);assert.equal(plan.conditionReceipt.usesAfter,uses+1);assert.equal(plan.conditionReceipt.conditionAfter,condition);assert.equal(active.yard.placedGoodies[0].uses,uses+1);assert.equal(active.yard.placedGoodies[0].condition,condition);assert.equal(active.yard.bowls[0].servings,0);assert.equal(active.yard.petbook[visit.original.visitorId].visits,1);
     const saved=JSON.stringify(active);assert.equal(publicPersistentYard(active,{...options,now:NOW+H}).visits[0].renderCompatible,true);assert.equal(JSON.stringify(active),saved);assert.deepEqual(adjacent(active),beforeAdjacent);
     success(await processes.separate(id,advance(visit.leavesAt-1)));assert.equal((await load(id)).yard.pendingGifts.length,0);
     const completeRace=await processes.race(id,[advance(visit.leavesAt),advance(visit.leavesAt)]);completeRace.forEach(success);
     const completed=await load(id);assert.equal(completed.yard.pendingGifts.length,1);assert.equal(Object.keys(completed._yardV2.runtime.giftLedger).length,1);assert.equal(completed.yard.placedGoodies[0].uses,uses+1);assert.deepEqual(adjacent(completed),beforeAdjacent);
     const command=collect(visit.leavesAt+1),gift=copy(completed.yard.pendingGifts[0]),balance=copy(completed.yard.currencies);
     const collectRace=await processes.race(id,[command,command]);collectRace.forEach(success);assert.equal(collectRace.filter(r=>r.outcome.replayed).length,1);
     const claimed=await load(id);assert.equal(claimed.yard.pendingGifts.length,0);for(const k of ['treats','shinyTreats'])assert.equal(claimed.yard.currencies[k],balance[k]+gift[k]);
     const receipt=copy(claimed._yardV2.runtime.commandReceipts[command.clientActionId]);assert.ok(receipt);assert.equal(receipt.action,'yard.collectGifts');assert.deepEqual(adjacent(claimed),beforeAdjacent);
     const lost=await processes.separate(id,{...command,now:visit.leavesAt+10*86400000},{loseResponse:true});assert.equal(lost.outcome,undefined);const afterLost=await load(id);assert.deepEqual(afterLost.yard,claimed.yard);assert.deepEqual(afterLost._yardV2,claimed._yardV2);
     const retry=await processes.separate(id,{...command,now:visit.leavesAt+10*86400000});success(retry);assert.equal(retry.outcome.replayed,true);const afterRetry=await load(id);assert.deepEqual(afterRetry.yard,claimed.yard);assert.deepEqual(afterRetry._yardV2,claimed._yardV2);assert.deepEqual(afterRetry._yardV2.runtime.commandReceipts[command.clientActionId],receipt);
     const conflict=await processes.separate(id,{...command,payload:{unexpected:true},now:visit.leavesAt+10*86400000});assert.equal(conflict.outcome.status,409);assert.equal(conflict.outcome.error,'ACTION_ID_PAYLOAD_CONFLICT');const afterConflict=await load(id);assert.deepEqual(afterConflict.yard,claimed.yard);assert.deepEqual(afterConflict._yardV2,claimed._yardV2);assert.deepEqual(adjacent(afterConflict),beforeAdjacent);
    });
   }
   await t.test('actual Garden purchase and family gift collect survive a shared PostgreSQL CAS loss',async()=>{
    const {id}=await seed('sage',0);success(await processes.separate(id,advance(NOW+H)));let player=await load(id);
    const adopt=gardenCommand(player,NOW+H,'adopt',{legacyRevision:player.gardenAccounting.revision,acknowledgedTotal:player.gardenAccounting.creditedTotal});success(await processes.separate(id,{...adopt,operation:'garden.command'}));
    player=await load(id);const visit=Object.values(player._yardV2.runtime.visits)[0];success(await processes.separate(id,advance(visit.leavesAt)));const before=await load(id),yard=collect(visit.leavesAt+1),garden=gardenCommand(before,visit.leavesAt+1,'buyPlant',{type:'daisy',shelfIndex:0,spotIndex:0});
    const results=await processes.race(id,[yard,{...garden,operation:'garden.command'}]);results.forEach(success);const after=await load(id),gift=before.yard.pendingGifts[0];
    assert.equal(after.resources.gold,before.resources.gold-25);assert.equal(after.garden.plants.length,before.garden.plants.length+1);assert.equal(after._gardenProgression.revision,before._gardenProgression.revision+1);assert.equal(after.yard.pendingGifts.length,0);assert.equal(after.yard.currencies.treats,before.yard.currencies.treats+gift.treats);assert.equal(after.yard.currencies.shinyTreats,before.yard.currencies.shinyTreats+gift.shinyTreats);assert.deepEqual(after.merge,before.merge);assert.deepEqual(after._mergeLabFence,before._mergeLabFence);assert.deepEqual(after.purchases,before.purchases);assert.deepEqual(after.futureAccount,before.futureAccount);
    const economy=copy({yard:after.yard,yardV2:after._yardV2,adjacent:adjacent(after)});
    // The family domain replay does not build a shared player snapshot. It must
    // preserve every selected field, including the energy maintenance timestamp.
    const familyReplay=await processes.separate(id,yard);success(familyReplay);assert.equal(familyReplay.outcome.replayed,true);
    const afterFamilyReplay=await load(id);assert.deepEqual({yard:afterFamilyReplay.yard,yardV2:afterFamilyReplay._yardV2,adjacent:adjacent(afterFamilyReplay)},economy);
    // Garden's actual route returns a fresh shared snapshot even for a duplicate.
    // At full energy, calcRegen writes exactly that snapshot's wall-clock time.
    // Model this one proven transition; do not omit the timestamp from comparison.
    const energyBefore=afterFamilyReplay.resources.energy;assert.equal(energyBefore.current,energyBefore.max);
    const replayStartedAt=Date.now(),gardenReplay=await processes.separate(id,{...garden,operation:'garden.command'}),replayFinishedAt=Date.now();
    success(gardenReplay);assert.equal(gardenReplay.outcome.body.duplicate,true);
    const snapshot=gardenReplay.outcome.body.snapshot,stamp=snapshot.serverTime,replayed=await load(id);
    assert.ok(Number.isSafeInteger(stamp));assert.ok(stamp>=replayStartedAt&&stamp<=replayFinishedAt);assert.ok(stamp>=energyBefore.lastRegenTimestamp);
    assert.equal(replayed.resources.energy.current,energyBefore.current);assert.equal(replayed.resources.energy.max,energyBefore.max);
    assert.equal(replayed.resources.energy.lastRegenTimestamp,stamp);assert.equal(snapshot.resources.energy.lastRegenTimestamp,stamp);
    assert.deepEqual(snapshot.resources.energy,replayed.resources.energy);
    const expected=copy(economy);expected.adjacent.resources.energy.lastRegenTimestamp=stamp;
    assert.deepEqual({yard:replayed.yard,yardV2:replayed._yardV2,adjacent:adjacent(replayed)},expected);
   });
  }finally{
   await processes.dispose();try{if(getDb())for(const id of ids){assertYardV2FixtureId(id);await getDb()`DELETE FROM players WHERE id=${id}`;}}finally{await closeDb();}
  }
 });
}
