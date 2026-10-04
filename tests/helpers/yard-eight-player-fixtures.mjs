/** Fixture inputs only. HTTP snapshot must perform the next native admission. */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {nativePlayer,nativeDrawForSeed,NOW,H,EIGHT_FIXTURE_SPECS} from './yard-eight-domain-fixtures.mjs';
import {ensurePersistentPlayerYard,executePersistentYardAction,publicPersistentYard} from '../../game-logic/yard-v2/service.mjs';
import {getYardServerOptions} from '../../game-logic/yard-v2/yard-media.mjs';
import {YARD_GOODIES} from '../../game-logic/yard-v2/catalog.mjs';
import {nativeDrawContext,drawNativeSeed} from './yard-native-draw.mjs';
import {AUTHORED_CLOCK_ORIGIN,EIGHT_IDS,assertEightCandidateBuild,CANDIDATE_SOURCE_PINS} from './yard-eight-player-candidate.mjs';
const placement=(slotId,goodieId,x,y)=>({slotId,goodieId,x,y,uses:0,condition:'new',rotationZ:0});
export const PAIR_FIXTURES=Object.freeze({
 'mika-willow':{first:'mika',second:'willow',seed:'yard-native-mika-supported-mika-willow-16683',placements:[placement('a-target','yarn_mouse',45,45),placement('b-target','moon_lamp',60,65)],source:'pair continuation: Mika Mouse/chase; exact positive witness'},
 'pip-starlit':{first:'pip',second:'starlit',seed:'yard-native-pair-pip-starlit-27',placements:[placement('a-target','snack_table',50,65),placement('b-target','moon_lamp',60,40)],source:'prior pair package: Pip then Starlit; exact positive witness'},
 'willow-starlit':{first:'willow',second:'starlit',seed:'yard-native-pair-willow-starlit-5',placements:[placement('a-target','moon_lamp',30,44),placement('b-target','moon_lamp',70,44)],source:'prior pair package: Willow then Starlit; exact positive witness'},
});
export const ALL_FIXTURE_KEYS=Object.freeze([...EIGHT_IDS,...Object.keys(PAIR_FIXTURES),...['willow','starlit','basil','sage'].flatMap(id=>[`${id}:worn`,`${id}:broken`]),'reject:pip:worn','reject:pip:broken','reject:starlit:threshold']);
export function prepareEightPlayerFixture(key){
 assertEightCandidateBuild();assert.deepEqual(Object.keys(getYardServerOptions().actorProfiles),EIGHT_IDS);
 const pair=PAIR_FIXTURES[key];let player,expectedActors;
 if(key.startsWith('reject:')){
  const [,actor,condition]=key.split(':'),spec=EIGHT_FIXTURE_SPECS[actor],durability=YARD_GOODIES[spec.goodieId].durability;
  assert.ok((actor==='pip'&&['worn','broken'].includes(condition))||(actor==='starlit'&&condition==='threshold'));
  const uses=condition==='threshold'?durability-1:durability*(condition==='broken'?2:1);
  player=nativePlayer(actor,{id:'candidate-seed-search',uses});player.yard.lastSimulatedAt=NOW+H;
  const context=nativeDrawContext({yard:player.yard,placement:player.yard.placedGoodies[0],foodId:spec.foodId,scene:getYardServerOptions().scene,at:NOW+2*H});
  assert.ok(context.ok);let seed;
  for(let n=0;n<50000;n++){const id=`yard-eight-player-reject-${actor}-${condition}-${n}`,draw=drawNativeSeed(id,context);if(draw?.visitorId===spec.visitorId&&(actor!=='starlit'||draw.activityId==='glow')){seed=id;break;}}
  assert.ok(seed);player.id=seed;assert.equal(ensurePersistentPlayerYard(player,{now:NOW+H}).status,200);expectedActors=[];
 }else if(pair){
  player=nativePlayer(pair.first,{id:pair.seed});player.yard.placedGoodies=structuredClone(pair.placements);player.yard.currencies.treats=240;
  assert.equal(ensurePersistentPlayerYard(player,{now:NOW}).status,200);
  assert.equal(ensurePersistentPlayerYard(player,{now:NOW+H,simulate:true}).status,200);
  assert.equal(Object.keys(player._yardV2.runtime.visits).length,1);
  const now=NOW+H+(key==='mika-willow'?5*60000:1),foodId=EIGHT_FIXTURE_SPECS[pair.second].foodId;
  if(!(player.yard.foodInventory[foodId]>0))assert.equal(executePersistentYardAction(player,'yard.buyFood',{foodId,qty:1},{now,actionId:`yard-v2:candidate-${key}-buy`}).status,200);
  assert.equal(executePersistentYardAction(player,'yard.setFood',{foodId,bowlId:'bowl-1'},{now,actionId:`yard-v2:candidate-${key}-fill`}).status,200);
  expectedActors=[pair.first,pair.second];
 }else{
  const [actor,condition='new',activity]=key.split(':');assert.ok(EIGHT_IDS.includes(actor));
  const durability=YARD_GOODIES[EIGHT_FIXTURE_SPECS[actor].goodieId].durability;
  const uses=condition==='new'?0:condition==='worn'?durability:condition==='broken'?durability*2:NaN;assert.ok(Number.isInteger(uses));
  const desiredActivity=activity||(actor==='starlit'&&condition==='new'?'glow':EIGHT_FIXTURE_SPECS[actor].activityId);
  let seed;
  for(let n=0;n<50000;n++){const id=`yard-eight-player-${actor}-${condition}-${desiredActivity}-${n}`,draw=nativeDrawForSeed(id,EIGHT_FIXTURE_SPECS[actor],condition);if(draw?.visitorId===EIGHT_FIXTURE_SPECS[actor].visitorId&&draw.activityId===desiredActivity&&draw.minutes>=100){seed=id;break;}}
  assert.ok(seed,'Reachable fixed native seed required; never force an outcome');player=nativePlayer(actor,{uses,id:seed,activityId:desiredActivity});
  assert.equal(ensurePersistentPlayerYard(player,{now:NOW}).status,200);assert.equal(Object.keys(player._yardV2.runtime.visits).length,0);
  expectedActors=[actor];
 }
 // The stored seed is historical fixture input. Copy only Yard/archive into a
 // generated canonical dev account; account identity, Merge and Garden come from
 // its real default player. No saved record, source plan or native draw is edited.
 const expected=structuredClone(player);assert.equal(ensurePersistentPlayerYard(expected,{now:AUTHORED_CLOCK_ORIGIN,simulate:true}).status,200);
 const view=publicPersistentYard(expected,{now:AUTHORED_CLOCK_ORIGIN});
 assert.deepEqual(view.visits.map(v=>v.visitorId).sort(),expectedActors.map(id=>EIGHT_FIXTURE_SPECS[id].visitorId).sort());assert.ok(view.visits.every(v=>v.renderCompatible));
 if(key.startsWith('reject:')){assert.ok(expected._yardV2.runtime.events.some(e=>e.type==='admission-blocked-media'));for(const field of ['placedGoodies','bowls','petbook','currencies'])assert.deepEqual(expected.yard[field],player.yard[field]);}
 return {key,source:pair?.source||'native fixed-seed single actor with unchanged source-owned profile',yard:player.yard,storage:player._yardV2,expectedActors,
  expected:expected._yardV2.runtime.visits,expectedYard:expected.yard};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='--all'){
  const dir=new URL('../../test-results/yard-eight-player-fixtures/',import.meta.url);await mkdir(dir,{recursive:true});
  for(const key of ALL_FIXTURE_KEYS){const fixture=prepareEightPlayerFixture(key);await writeFile(new URL(`${key.replaceAll(':','-')}.json`,dir),JSON.stringify({sourcePins:CANDIDATE_SOURCE_PINS,fixture}));console.log('Native fixture verified:',key);}
 }else process.stdout.write(JSON.stringify(prepareEightPlayerFixture(process.argv[2])));
}
