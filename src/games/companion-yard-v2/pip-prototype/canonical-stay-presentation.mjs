/** Inactive, deterministic R1 full-stay presentation. No simulation, clocks,
 * timers, admission, renderer allocation, food, wallet or reward writes. */
import fixture from './data/fixture.json' with {type:'json'};
import canonicalGeometry from '../../../../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
import {PIP_PRIVATE_GLB_SHA256} from './source/pip-analytical-coat.mjs';
import {planCanonicalInspection,supportedPose} from './dynamic-prop-planner.mjs';
import {canonicalLayoutKey} from './dynamic-navigation.mjs';
import {sampleMotion} from './motion/kinematics.mjs';
import {smooth} from './motion/trajectory.mjs';
import {buildR1FrontPortal,planStayTransfer,qualifyStayStage,supportedLine} from './canonical-stay-routes.mjs';
export const R1_STAY_VERSION='pip-canonical-stay-rehearsal/v2';
export const R1_STAY_MOTION_PROFILES=Object.freeze(['r1-supported-baseline-v1','r1-brisk-pace-1.4-v1']);
export const R1_STAY_BINDINGS=Object.freeze([]); // Closed: this is not approved media.
const PEEK_MS=5200,MIN_MS=45*60000,MAX_MS=110*60000;
const clone=x=>structuredClone(x),clamp=x=>Math.max(0,Math.min(1,x));
// Navigation's shared key deliberately excludes economic item state. A saved
// presentation must also pin condition/use and the placement lifetime.
export function r1StayLayoutKey(geometry,rows){return JSON.stringify([canonicalLayoutKey(geometry,rows),[...rows].sort((a,b)=>a.slotId.localeCompare(b.slotId)).map(r=>[r.slotId,r.condition,r.uses,r.placedAt])]);}
function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function hash(text){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
// Exact optional R2 obstacle capability. This pins only collision geometry,
// never food assets, stock, admission or rendering readiness. Kept independent
// of the food host module so its selector cannot enter the pure motion graph.
export const R1_STAY_FOOD_EXCLUSION=freeze({id:'pip-garden:food:bowl-1',kind:'canonical-food-union-r2',heightCanonical:2.09,radiusCanonical:3.843,
 polygon:Array.from({length:24},(_,i)=>[80+3.843/Math.cos(Math.PI/24)*Math.cos(i*Math.PI/12),82+3.843/Math.cos(Math.PI/24)*Math.sin(i*Math.PI/12)])});
function geometryRevision(geometry){
 if(JSON.stringify(geometry)===JSON.stringify(canonicalGeometry))return 'pip-garden-t2-r1';
 const withFood={...canonicalGeometry,exclusions:[...canonicalGeometry.exclusions,R1_STAY_FOOD_EXCLUSION]};
 return JSON.stringify(geometry)===JSON.stringify(withFood)?'pip-garden-t2-food-r2':null;
}
const unit=(seed,key)=>hash(`${seed}:${key}`)/4294967296;
const range=(seed,key,a,b)=>Math.floor(a+(b-a)*unit(seed,key));
function restEpisodes(seed,start,end){
 const episodes=[],names=['leaf-look','ear-listen','curiosity-tilt'],recent=[];let cursor=start,index=0;
 while(cursor<end){
  const quietMs=range(seed,`${index}:quiet`,25000,110001),quietEnd=Math.min(end,cursor+quietMs);
  episodes.push({kind:'quiet-rest',startMs:cursor,endMs:quietEnd,target:'supported-rest'});cursor=quietEnd;if(cursor===end)break;
  const available=names.filter(n=>n!==recent.at(-1)),kind=available[range(seed,`${index}:kind`,0,available.length)];
  const duration=range(seed,`${index}:duration`,kind==='ear-listen'?2800:3800,kind==='leaf-look'?6801:5201);
  if(end-cursor<duration){episodes.at(-1).endMs=end;break;}
  episodes.push({kind,startMs:cursor,endMs:cursor+duration,target:kind==='ear-listen'?'garden-sound':'selected-real-leaf',amplitude:.55+.4*unit(seed,`${index}:amplitude`),side:unit(seed,`${index}:side`)>.5?1:-1});
  cursor+=duration;recent.push(kind);index++;if(index>240)throw Error('R1_STAY_EPISODE_LIMIT');
 }
 return episodes;
}
const boundary=(phase,startMs,endMs)=>({phase,startMs,endMs});
const stageDuration=s=>Math.ceil(s.route.totalMs);
const duration=stages=>stages.reduce((n,s)=>n+stageDuration(s),0);
function envelopeBox(points,radius){const minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y));return {x:minX-radius,y:minY-radius,width:Math.max(...points.map(p=>p.x))-minX+2*radius,height:Math.max(...points.map(p=>p.y))-minY+2*radius};}
function spatialRequirements(plan){
 const rows=[],actor=plan.actor,bodyRadius=Math.hypot(actor.bodyHalfExtentsSource.x+.075,actor.bodyHalfExtentsSource.y)*actor.unitsPerSource,soleRadius=Math.hypot(actor.soleHalfExtentsSource.x,actor.soleHalfExtentsSource.y)*actor.unitsPerSource;
 const addStill=(kind,startMs,endMs,world)=>{if(endMs<=startMs)return;rows.push({kind,startMs,endMs,bodyEnvelope:envelopeBox([world.root],bodyRadius),supportEnvelope:envelopeBox(Object.values(world.feet).map(f=>f.position),soleRadius)});};
 const addStages=(stages,startMs)=>{let cursor=startMs;for(const stage of stages){const roots=[stage.route.start.position,stage.route.goal.position,...(stage.route.segments??[]).flatMap(s=>s.control)],feet=[...Object.values(stage.gait.initial).map(f=>f.position),...stage.gait.events.flatMap(e=>[e.from.position,e.to.position])],endMs=cursor+stageDuration(stage);rows.push({kind:stage.kind,startMs:cursor,endMs,bodyEnvelope:envelopeBox(roots,bodyRadius),supportEnvelope:envelopeBox(feet,soleRadius)});cursor=endMs;}};
 addStages(plan.entranceStages,plan.arrivedAt);addStages(plan.approachStages,plan.phases[1].startMs);
 addStill('peek-and-rest',plan.phases[2].startMs,plan.departureAt,plan.settled);
 addStill('exit-supported-wait',plan.departureAt,plan.departureAt+plan.exitHoldMs,plan.settled);
 addStages(plan.exitStages,plan.departureAt+plan.exitHoldMs);
 return {format:'r1-presentation-reservation-requirements/v1',authoritative:false,coordinateSpace:'canonical-ground',locationId:plan.locationId,storageScope:clone(plan.storageScope),navigationScope:clone(plan.navigationScope),navigationRevision:plan.navigationRevision,portalRevision:plan.portal.revision,
  target:{slotId:plan.target.slotId,startMs:plan.arrivedAt,endMs:plan.departureAt},spatial:rows,
  notice:'Required envelopes only, derived from current declared source bounds and route control hulls. They do not acquire a prop or reserve server state; canonical admission must validate and persist them before use.'};
}
/** Inputs are a source-owned server record and authoritative committed rows.
 * No browser payload or restored save is permitted to set a binding registry.
 * Even a prepared plan remains admission:false with pending native evidence. */
export function prepareR1Stay({visitId,arrivedAt,leavesAt,motionSeed,targetSlotId,rows,geometry=canonicalGeometry,actor=fixture.actor,motionProfile=R1_STAY_MOTION_PROFILES[0]}={}){
 try{
  if(typeof visitId!=='string'||!visitId||typeof motionSeed!=='string'||!motionSeed||motionSeed.length>160||![arrivedAt,leavesAt].every(Number.isSafeInteger)||leavesAt-arrivedAt<MIN_MS||leavesAt-arrivedAt>MAX_MS)throw Error('R1_STAY_SERVER_IDENTITY_REQUIRED');
  if(!R1_STAY_MOTION_PROFILES.includes(motionProfile))throw Error('R1_STAY_MOTION_PROFILE_UNREGISTERED');
  const brisk=motionProfile===R1_STAY_MOTION_PROFILES[1];
  const navigationRevision=geometryRevision(geometry);
  if(JSON.stringify(actor)!==JSON.stringify(fixture.actor)||!navigationRevision)throw Error('R1_STAY_SOURCE_REVISION_MISMATCH');
  if(!Array.isArray(rows)||rows.length<1||rows.length>2)throw Error('R1_STAY_RENDERER_PLACEMENT_CAPACITY');
  const target=rows.find(r=>r.slotId===targetSlotId);
  if(!target||!Number.isSafeInteger(target.placedAt)||target.placedAt>arrivedAt||target.condition!=='new')throw Error('R1_STAY_TARGET_NOT_PRESENT_AT_ARRIVAL');
  const baseline=brisk?prepareR1Stay({visitId,arrivedAt,leavesAt,motionSeed,targetSlotId,rows,geometry,actor}):null;
  if(brisk&&!baseline.prepared)throw Error(baseline.code);
  if(brisk)actor={...actor,maxSpeedSourcePerSecond:actor.maxSpeedSourcePerSecond*1.4,halfStepMs:actor.halfStepMs/1.4,anticipationMs:actor.anticipationMs/1.4};
  const portal=buildR1FrontPortal(geometry,actor,rows),start={position:portal.outside,heading:portal.inwardHeading},initial=supportedPose(actor,start);
  const entrance=qualifyStayStage(supportedLine(actor,start,portal.join),actor,initial,portal.navigation,'front-edge-enter');
  if(!entrance.prepared)throw Error(entrance.code);
  const approach=planCanonicalInspection({geometry,rows,actor,targetSlotId,previous:entrance.end,attentionVariant:0});
  if(!approach.ok)throw Error(approach.code);
  const returnPath=planStayTransfer({geometry,rows,actor,previous:approach.settled,goal:{position:portal.join,heading:portal.outwardHeading},curveFinalApproach:brisk});
  if(!returnPath.prepared)throw Error(returnPath.code);
  const outside=qualifyStayStage(supportedLine(actor,{position:portal.join,heading:portal.outwardHeading},portal.outside),actor,returnPath.settled,portal.navigation,'front-edge-exit');
  if(!outside.prepared)throw Error(outside.code);
  const exitStages=[...returnPath.stages,outside],enterEnd=arrivedAt+stageDuration(entrance),approachEnd=enterEnd+duration(approach.stages),peekEnd=approachEnd+PEEK_MS,departureAt=brisk?baseline.plan.departureAt:leavesAt-duration(exitStages),exitHoldMs=leavesAt-departureAt-duration(exitStages);
  if(exitHoldMs<0)throw Error('R1_STAY_CANDIDATE_EXCEEDS_BASELINE_EXIT_RESERVATION');
  if(peekEnd+30000>=departureAt)throw Error('R1_STAY_TOO_SHORT_FOR_REAL_ROUTES');
  const {navigation,...portalRecord}=portal;
  const plan={version:R1_STAY_VERSION,visitId,arrivedAt,leavesAt,motionSeed,coordinateSpace:'canonical-ground',locationId:'pip-garden',locationVersion:1,storageScope:{locationId:target.locationId,locationVersion:target.locationVersion,geometryRevision:target.geometryRevision},navigationScope:{baseGeometryRevision:'pip-garden-t2-r1',fixedObstacleRevision:navigationRevision,portalId:portal.id,portalRevision:portal.revision},
   layoutKey:r1StayLayoutKey(geometry,rows),navigationLayoutKey:canonicalLayoutKey(geometry,rows),navigationRevision,foodObstacle:navigationRevision==='pip-garden-t2-food-r2'?clone(R1_STAY_FOOD_EXCLUSION):null,actor:clone(actor),source:{actorId:actor.id,movementRevision:motionProfile,comparisonOnly:brisk,calibrationSha256:actor.revision,modelSha256:PIP_PRIVATE_GLB_SHA256,unitsPerSource:actor.unitsPerSource,propRevision:target.itemGeometryRevision},
   target:clone(target),anchor:clone(approach.anchor),portal:portalRecord,initial,settled:approach.settled,final:outside.end,
   entranceStages:[entrance],approachStages:approach.stages,exitStages,
   phases:[boundary('entrance',arrivedAt,enterEnd),boundary('approach',enterEnd,approachEnd),boundary('interaction',approachEnd,peekEnd),boundary('rest',peekEnd,departureAt),boundary('exit',departureAt,leavesAt)],
   episodes:restEpisodes(`${visitId}:${motionSeed}`,peekEnd,departureAt),departureAt,exitHoldMs,proposedPropReleaseAt:departureAt,propCommits:[],
   qualification:{visual:false,fullStay:false,admission:false,portal:'source-candidate-awaiting-native-clipping',requires:['native-entry-exit-clipping','45-and-110-minute-random-access-native-pose-and-visual-review','canonical-food-binding','canonical-save-and-server-reservations']}};
  plan.reservationRequirements=spatialRequirements(plan);
  return {prepared:true,admission:false,ready:false,plan:freeze(plan)};
 }catch(error){return {prepared:false,admission:false,ready:false,code:error.message};}
}
function still(world,intention){return {world:clone(world),startsFromSettled:true,styleFrame:96,anticipationU:1,settleU:1,intention};}
function sampleStages(stages,actor,elapsed){
 for(const stage of stages){if(elapsed<stageDuration(stage)){elapsed=Math.min(elapsed,stage.route.totalMs);const step=Math.max(0,(elapsed-stage.route.anticipationMs)/actor.halfStepMs);return {world:sampleMotion(stage.route,stage.gait,actor,elapsed),startsFromSettled:true,styleFrame:29+7.5*((step%2+2)%2),anticipationU:clamp(elapsed/stage.route.anticipationMs),settleU:clamp((elapsed-stage.route.anticipationMs-stage.route.moveMs)/stage.route.settleMs),intention:stage.kind};}elapsed-=stageDuration(stage);}
 return still(stages.at(-1).end,'supported-rest');
}
function envelope(t,d,rise=.23,fall=.27){return clamp(smooth(t/(d*rise))*(1-smooth((t-d*(1-fall))/(d*fall))));}
function gesture(plan,kind,t,d,amplitude=1,side=1){
 const world=plan.settled,focus=plan.anchor.focus,actor=plan.actor,theta=world.heading+Math.PI/2,dx=(focus.x-world.root.x)/actor.unitsPerSource,dy=(focus.y-world.root.y)/actor.unitsPerSource;
 const e=envelope(t,d),delayed=envelope(t-100,d-100),a={anticipate:0,lean:0,sniff:0,curiosity:0,earFollow:0,earSniff:0};
 // Real leaf-directed look with a slow hold; no sniff pulses or lateral root sway.
 if(kind==='peek'||kind==='leaf-look'){a.lean=e*amplitude*(kind==='peek'?.65:.28);a.earFollow=delayed*amplitude*.45;a.curiosity=envelope(t-d*.25,d*.5)*amplitude*.22;}
 else if(kind==='curiosity-tilt'){a.curiosity=e*amplitude*.6;a.lean=e*amplitude*.12;}
 else if(kind==='ear-listen')a.earFollow=e*amplitude*.4;
 return {version:'pip-planter-inspection/experimental-v1',...a,focusSource:[Math.cos(theta)*dx+Math.sin(theta)*dy,-Math.sin(theta)*dx+Math.cos(theta)*dy,(focus.z-(world.root.z??0))/actor.unitsPerSource],attentionSide:side};
}
/** Random access in absolute server time. Hidden tabs may skip any duration;
 * the next sample catches up exactly. No accumulated RAF delta or local clock. */
export function sampleR1Stay(plan,serverNow,{layoutKey=plan?.layoutKey}={}){
 if(plan?.version!==R1_STAY_VERSION||!Number.isFinite(serverNow))throw Error('R1_STAY_SAMPLE_INVALID');
 // Departure is terminal even when a newer layout invalidates the old plan.
 if(serverNow>=plan.leavesAt)return {phase:'departed',sample:null,admission:false,nextChangeAt:null,needsAnimationFrame:false};
 if(layoutKey!==plan.layoutKey)return {phase:'unavailable',code:'R1_STAY_LAYOUT_CHANGED',sample:null,admission:false,nextChangeAt:null,needsAnimationFrame:false};
 if(serverNow<plan.arrivedAt)return {phase:'not-arrived',sample:null,admission:false,nextChangeAt:plan.arrivedAt,needsAnimationFrame:false};
 const phase=plan.phases.find(p=>serverNow<p.endMs),elapsed=serverNow-phase.startMs;let sample,nextChangeAt=phase.endMs,needsAnimationFrame=true;
 if(phase.phase==='entrance')sample=sampleStages(plan.entranceStages,plan.actor,elapsed);
 else if(phase.phase==='approach')sample=sampleStages(plan.approachStages,plan.actor,elapsed);
 else if(phase.phase==='exit'){if(elapsed<plan.exitHoldMs){sample=still(plan.settled,'quiet-before-exit');nextChangeAt=phase.startMs+plan.exitHoldMs;needsAnimationFrame=false;}else sample=sampleStages(plan.exitStages,plan.actor,elapsed-plan.exitHoldMs);}
 else {
  const episode=phase.phase==='interaction'?{kind:'peek',startMs:phase.startMs,endMs:phase.endMs,target:'selected-real-leaf'}:plan.episodes.find(e=>serverNow<e.endMs);
  sample=still(plan.settled,episode.kind);sample.attentionTarget=episode.target;nextChangeAt=episode.endMs;needsAnimationFrame=episode.kind!=='quiet-rest';
  if(episode.kind!=='quiet-rest'){sample.inspection=gesture(plan,episode.kind,serverNow-episode.startMs,episode.endMs-episode.startMs,episode.amplitude??1,episode.side??1);sample.focus=clone(plan.anchor.focus);}
 }
 return {phase:phase.phase,sample,serverNow,nextChangeAt,needsAnimationFrame,visitId:plan.visitId,admission:false,savedVisitor:false,reservationIntent:{authoritative:false,targetRequired:serverNow<plan.departureAt,bodyAndExitRequired:true},propUse:false};
}
/** Small draw-side adapter. Drawing can pause; serverNow supplied at each call
 * cannot. A stale layout fails closed until an authoritative replacement plan. */
export function createR1StayPresenter(plan){
 const pinned=freeze(clone(plan));
 return Object.freeze({sampleAt(serverNow,geometry,rows){
  if(serverNow>=pinned.leavesAt)return sampleR1Stay(pinned,serverNow);
  let layoutKey;try{layoutKey=r1StayLayoutKey(geometry,rows);}catch{return {phase:'unavailable',code:'R1_STAY_CURRENT_LAYOUT_INVALID',sample:null,admission:false,nextChangeAt:null,needsAnimationFrame:false};}
  return sampleR1Stay(pinned,serverNow,{layoutKey});
 },plan:pinned});
}
