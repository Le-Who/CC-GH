/** Inactive pure server adapter. Only an already-selected authoritative lottery
 * candidate may enter. There is no lottery, retry, admission callback or writer.
 * Serialized records are proposals requiring container v3, never legacy visits. */
import {CANONICAL_LOCATION,CANONICAL_ITEM,CANONICAL_GEOMETRY,CANONICAL_MAX_PLACEMENTS,canonicalFootprintValid} from './canonical-locations.mjs';
import {CANONICAL_FOOD_CONTRACT,canonicalFoodOverlap} from './canonical-food-protocol.mjs';
import {YARD_FOODS,YARD_GOODIES,YARD_VISITORS,getYardGoodieActivities} from './catalog.mjs';
import {clone,deepFreeze,digest,integer} from './util.mjs';
import {prepareR1SavedStay,sampleR1SavedStay,r1SavedStayLayoutCompatible,r1SavedStayGeometry,R1_SAVED_STAY_PROFILE,R1_SAVED_NAVIGATION_PROFILE} from '../../src/games/companion-yard-v2/pip-prototype/canonical-saved-stay.mjs';

export const CANONICAL_SAVED_VISIT_FORMAT='yard-canonical-saved-visit/v2';
export const CANONICAL_SAVED_VISIT_BINDINGS=Object.freeze([]);
export const CANONICAL_SAVED_VISIT_ENABLED=false;
export const CANONICAL_SAVED_VISIT_PROFILE=deepFreeze({id:R1_SAVED_STAY_PROFILE,navigationProfile:R1_SAVED_NAVIGATION_PROFILE,
 storageLocation:clone(CANONICAL_LOCATION),placementGeometryHash:digest(CANONICAL_GEOMETRY),requiredContainerVersion:3,
 actorId:'Pip-R1-A2',visitorId:'pip_hamster',modelSha256:'74edd9400bcb69266ce670c977f05bf3ae8c62b448877f4ee34967565815c45b',unitsPerSource:16,
 movement:'r1-supported-baseline-v1',portal:{id:'pip-front-edge-portal-r1',revision:'actor-only-corridor-v1',actorOnly:true},
 routeCoverage:'source-bezier-control-hull-and-gait-endpoint-envelopes/v1',foodDescriptorId:CANONICAL_FOOD_CONTRACT.id,
 foodDescriptorHash:digest(CANONICAL_FOOD_CONTRACT),release:'arrivedAt+ceil((leavesAt-arrivedAt)*0.84)',
 postRelease:'neutral-rest-outside-target-and-incoming-envelopes',conditions:['new'],admission:false});
export const CANONICAL_SAVED_VISIT_GATES=Object.freeze(['NATIVE_FULL_STAY_ACCEPTANCE_REQUIRED','VERSIONED_ATOMIC_STORAGE_INTEGRATION_REQUIRED','AUTHORITATIVE_RESERVATION_AND_LOCATION_POLICY_REQUIRED','CANONICAL_SAVED_VISIT_ADMISSION_DISABLED']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const identity=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const fail=(code,extra={})=>({prepared:false,ready:false,admission:false,code,...extra});
const result=(record,plan)=>({prepared:true,ready:false,admission:false,record,plan,gates:[...CANONICAL_SAVED_VISIT_GATES]});
const rowSort=rows=>clone(rows).sort((a,b)=>a.slotId<b.slotId?-1:a.slotId>b.slotId?1:0);
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const validBox=r=>object(r)&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;

/** New-version-only row validation; the item-v1 uses:0 validator is unchanged. */
export function canonicalSavedVisitRowsValid(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>CANONICAL_MAX_PLACEMENTS)return false;
 const ids=new Set();for(const row of rows){if(!object(row)||!/^canonical:[A-Za-z0-9_.:-]{1,80}$/.test(row.slotId)||ids.has(row.slotId)||Object.entries(CANONICAL_LOCATION).some(([k,v])=>row[k]!==v)||row.goodieId!==CANONICAL_ITEM.goodieId||row.itemGeometryRevision!==CANONICAL_ITEM.itemGeometryRevision||row.condition!=='new'||!integer(row.uses)||row.uses>=YARD_GOODIES.leaf_pot.durability||!integer(row.placedAt)||![row.x,row.y].every(Number.isFinite))return false;ids.add(row.slotId);}
 return rows.every(row=>canonicalFootprintValid(row.x,row.y,rows,row.slotId)&&!canonicalFoodOverlap(row.x,row.y));
}

/** Project the already-existing one-serving/one-use outcome without committing
 * anything. Plan against the projected post-use rows so a real atomic commit
 * would not invalidate its own layout identity on the first frame. */
export function prepareCanonicalSavedVisit({candidate,rows,bowl}={}){
 try{
  if(!object(candidate)||candidate.visitorId!=='pip_hamster'||candidate.goodieId!=='leaf_pot'||candidate.activityId!=='peek')return fail('CANONICAL_SELECTED_CANDIDATE_UNSUPPORTED');
  const {visitId,slotId,arrivedAt,leavesAt}=candidate,stay=leavesAt-arrivedAt;
  if(!identity(visitId)||!identity(slotId)||![arrivedAt,leavesAt].every(integer)||stay<45*60000||stay>110*60000||stay%60000!==0)return fail('CANONICAL_SERVER_CANDIDATE_INVALID');
  if(!canonicalSavedVisitRowsValid(rows)||rows.some(row=>row.placedAt>arrivedAt))return fail('CANONICAL_AUTHORITATIVE_ROWS_INVALID');
  const beforeRows=rowSort(rows),target=beforeRows.find(row=>row.slotId===slotId);if(!target)return fail('CANONICAL_TARGET_UNAVAILABLE');
  if(!getYardGoodieActivities(YARD_GOODIES.leaf_pot,target.condition).some(a=>a.id==='peek'&&YARD_VISITORS.pip_hamster.poses.includes(a.pose)))return fail('CANONICAL_ACTIVITY_UNAVAILABLE');
  if(!object(bowl)||bowl.id!==CANONICAL_FOOD_CONTRACT.bowlId||!['kibble','berry_plate','bonito_bowl'].includes(bowl.foodId)||!YARD_FOODS[bowl.foodId]||!integer(bowl.servings)||bowl.servings<1||!integer(bowl.placedAt)||bowl.placedAt>arrivedAt||!integer(bowl.expiresAt)||bowl.expiresAt<=arrivedAt)return fail('CANONICAL_AUTHORITATIVE_FOOD_UNAVAILABLE');
  const afterRows=clone(beforeRows),afterTarget=afterRows.find(row=>row.slotId===slotId);afterTarget.uses+=1;
  if(afterTarget.uses>=YARD_GOODIES.leaf_pot.durability)return fail('CANONICAL_POST_USE_CONDITION_UNAVAILABLE');
  const afterBowl=clone(bowl);afterBowl.servings-=1;if(afterBowl.servings===0)Object.assign(afterBowl,{foodId:null,servings:0,placedAt:null,expiresAt:null});
  const selected={visitId,visitorId:'pip_hamster',goodieId:'leaf_pot',activityId:'peek',slotId,arrivedAt,leavesAt};
  const compiled=prepareR1SavedStay({visitId,arrivedAt,leavesAt,motionSeed:digest(`${visitId}:motion`).slice(0,16),targetSlotId:slotId,rows:afterRows});
  if(!compiled.prepared)return fail(compiled.code);
  const plan=compiled.plan,releaseAt=arrivedAt+Math.ceil(stay*.84);
  if(plan.releaseAt!==releaseAt||plan.reservationRequirements.target.endMs!==releaseAt)return fail('CANONICAL_TARGET_RELEASE_MISMATCH');
  const record={format:CANONICAL_SAVED_VISIT_FORMAT,status:'prepared-inactive',authoritative:false,requiredContainerVersion:3,profile:clone(CANONICAL_SAVED_VISIT_PROFILE),candidate:selected,
   releaseAt,departureAt:plan.departureAt,motionSeed:digest(`${visitId}:motion`).slice(0,16),geometryHash:plan.geometryHash,
   before:{rows:beforeRows,bowl:clone(bowl)},after:{rows:afterRows,bowl:afterBowl},
   economicIntent:{servings:1,itemUses:1,giftId:`gift_v2_${digest(visitId).slice(0,32)}`,giftCreationAt:leavesAt,petbookVisitDelta:1,committed:false},
   presentationHash:digest(plan),reservations:clone(plan.reservationRequirements),propCommits:[]};
  record.reservations.target.rect={x:target.x-CANONICAL_ITEM.footprintRadius,y:target.y-CANONICAL_ITEM.footprintRadius,width:CANONICAL_ITEM.footprintRadius*2,height:CANONICAL_ITEM.footprintRadius*2};
  record.recordHash=digest(record);return result(deepFreeze(record),plan);
 }catch(error){return fail('CANONICAL_SAVED_VISIT_INPUT_INVALID',{detail:String(error.message)});}
}

/** Save hashes establish integrity, never trust. Rebuild using exact pinned
 * source code and compare the complete proposal before using any reservation.
 * Unknown versions stay opaque and must be preserved by their containing save. */
export function restoreCanonicalSavedVisit(record,{rows,serverNow}={}){
 try{
  if(record?.format!==CANONICAL_SAVED_VISIT_FORMAT)return fail('CANONICAL_SAVED_VISIT_VERSION_UNSUPPORTED');
  if(record.status!=='prepared-inactive'||record.authoritative!==false||record.requiredContainerVersion!==3||digest(record.profile)!==digest(CANONICAL_SAVED_VISIT_PROFILE))return fail('CANONICAL_SAVED_VISIT_PROFILE_UNSUPPORTED');
  const {recordHash,...body}=record;if(recordHash!==digest(body))return fail('CANONICAL_SAVED_VISIT_INTEGRITY_INVALID');
  const replay=prepareCanonicalSavedVisit({candidate:record.candidate,rows:record.before?.rows,bowl:record.before?.bowl});
  if(!replay.prepared||replay.record.recordHash!==recordHash)return fail('CANONICAL_SAVED_VISIT_SOURCE_REPLAY_MISMATCH');
  if(serverNow!==undefined&&!integer(serverNow))return fail('CANONICAL_SERVER_TIME_INVALID');
  if(serverNow!==undefined&&serverNow>=record.candidate.leavesAt)return {...replay,sample:sampleR1SavedStay(replay.plan,serverNow)};
  if(serverNow!==undefined&&rows===undefined)return fail('CANONICAL_CURRENT_ROWS_REQUIRED');
  if(rows!==undefined&&(!canonicalSavedVisitRowsValid(rows)||digest(rowSort(rows))!==digest(record.after.rows)&&!(serverNow!==undefined&&r1SavedStayLayoutCompatible(replay.plan,serverNow,r1SavedStayGeometry(),rows))))return fail('CANONICAL_SAVED_VISIT_LAYOUT_STALE');
  return serverNow===undefined?replay:{...replay,sample:sampleR1SavedStay(replay.plan,serverNow,{rows:rows??record.after.rows})};
 }catch{return fail('CANONICAL_SAVED_VISIT_RECORD_INVALID');}
}

/** Read-only half-open reservations. Validate/replay before returning any box;
 * no malformed saved envelope is treated as empty. Do not mix legacy records. */
export function canonicalSavedVisitReservations(record,at){
 if(!integer(at))return fail('CANONICAL_SERVER_TIME_INVALID');
 const replay=restoreCanonicalSavedVisit(record);if(!replay.prepared)return replay;
 const active=record.reservations.spatial.filter(r=>r.startMs<=at&&at<r.endMs),targetReserved=record.candidate.arrivedAt<=at&&at<record.releaseAt;
 return {prepared:true,ready:false,admission:false,authoritative:false,targetReserved,
  boxes:[...active.flatMap(r=>[clone(r.bodyEnvelope),clone(r.supportEnvelope)]),...(targetReserved?[clone(record.reservations.target.rect)]:[])],navigationProfile:record.profile.navigationProfile};
}

/** Useful for future atomic placement/admission integration; currently not
 * called by actions or simulation. Endpoint touching is conservatively blocked. */
export function canonicalSavedVisitConflict(record,{rect,startMs,endMs,navigationProfile=R1_SAVED_NAVIGATION_PROFILE}={}){
 if(!validBox(rect)||!integer(startMs)||!integer(endMs)||endMs<=startMs)return fail('CANONICAL_RESERVATION_REQUEST_INVALID');
 const replay=restoreCanonicalSavedVisit(record);if(!replay.prepared)return replay;
 if(navigationProfile!==record.profile.navigationProfile)return fail('CANONICAL_RESERVATION_PROFILE_MISMATCH');
 const touching=(a,b)=>overlap(a,b)||a.x<=b.x+b.width&&a.x+a.width>=b.x&&a.y<=b.y+b.height&&a.y+a.height>=b.y;
 const target=record.reservations.target;
 return {prepared:true,ready:false,admission:false,conflict:startMs<target.endMs&&endMs>target.startMs&&touching(target.rect,rect)||record.reservations.spatial.some(r=>startMs<r.endMs&&endMs>r.startMs&&[r.bodyEnvelope,r.supportEnvelope].some(b=>touching(b,rect)))};
}
