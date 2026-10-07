/** Test fixture inputs, not a runtime capability or alternate admission path. */
import {selectOpportunity} from '../game-logic/yard-v2/opportunity-selection.mjs';
import {YARD_GOODIES,YARD_FOODS,getYardGoodieActivities} from '../game-logic/yard-v2/catalog.mjs';
import {CANONICAL_LOCATION,CANONICAL_ITEM} from '../game-logic/yard-v2/canonical-locations.mjs';
export const FIXED_SEED='saved-pip-real-backend/v1';
export const TEST_REFILL_FOOD_ID='bonito_bowl';
export const DEV_EXTERNAL_PREFIX='saved-pip-real-';
export function requireDisposableBackend(env=process.env,baseURL='http://127.0.0.1:3199'){
 if(env.NODE_ENV!=='test'||env.YARD_SAVED_VISIT_PG!=='1'||env.DEV_AUTH_ENABLED!=='true')throw Error('EXPLICIT_DISPOSABLE_TEST_ENV_REQUIRED');
 let db,base;try{db=new URL(env.DATABASE_URL);base=new URL(baseURL);}catch{throw Error('DISPOSABLE_TEST_URL_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(db.protocol)||db.hostname!=='127.0.0.1'||db.port!=='55437'
  ||db.username!=='ccgh_visit_test'||db.pathname!=='/ccgh_visit_test'||db.password||db.search||db.hash)throw Error('ONLY_DISPOSABLE_CI_POSTGRES_ALLOWED');
 if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.port!=='3199'||base.username||base.password
  ||base.pathname!=='/'||base.search||base.hash)throw Error('ONLY_LOOPBACK_TEST_SERVER_ALLOWED');
 if(env.REDIS_URL)throw Error('TEST_REDIS_MUST_BE_DISABLED');
 return base.origin;
}
export function requireExternalId(value){
 if(typeof value!=='string'||!/^saved-pip-real-[a-zA-Z0-9_-]{1,90}$/.test(value))throw Error('UNIQUE_TEST_DEV_ID_REQUIRED');
 return value;
}
/** Search test INITIAL timestamps, never worker/media results. The selected
 * fixture retains this exact seed/time, then the real simulator draws once.
 * No plan/record is authored here and a source refusal fails the test. */
export function selectCurrentFixture(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<120001)throw Error('CURRENT_TEST_TIME_REQUIRED');
 const start=now-120000,food=YARD_FOODS.kibble,goodie=YARD_GOODIES.leaf_pot;
 const available=getYardGoodieActivities(goodie,'new').sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 for(let offset=0;offset<60000;offset++){
  const at=start+offset,row={...CANONICAL_LOCATION,slotId:'canonical:a',goodieId:'leaf_pot',
   itemGeometryRevision:CANONICAL_ITEM.itemGeometryRevision,x:98,y:118,condition:'new',uses:0,placedAt:at-1};
  const bowl={id:'bowl-1',foodId:'kibble',servings:food.servings,placedAt:at-1,expiresAt:at-1+food.durationMs};
  const selected=selectOpportunity({seed:FIXED_SEED,at,placed:row,goodie,available,bowls:[bowl],n:0});
  if(selected?.visitor.id==='pip_hamster'&&selected.activity.id==='peek'&&selected.leavesAt===at+45*60000)
   return {seed:FIXED_SEED,at,row,bowl,candidate:{visitId:selected.id,visitorId:selected.visitor.id,goodieId:'leaf_pot',activityId:'peek',slotId:row.slotId,arrivedAt:at,leavesAt:selected.leavesAt},searchOffset:offset};
 }
 throw Error('CURRENT_SOURCE_FIXTURE_NOT_FOUND');
}
