/** Calibrated Mika media and deterministic full-stay preflight. Missing coverage rejects admission before serving or wear consumption. */
import {planningSceneWithObstacles,obstacleContextRevision} from './prop-obstacles.mjs';
import {presentationReservationsConflict} from './visit-reservations.mjs';
import { routeProgram } from './media/stride-routes.mjs';
import { buildStaySchedule } from './media/stay-schedule.mjs';
import { MIKA_ACTOR_ASSETS } from './media/mika-actor-assets.mjs';
import { ACTOR_PROFILES,MIKA_ACTOR_PROFILE,MIKA_ACTOR_REFERENCE,resolveActorProfile } from './actor-profiles.mjs';
import { footprint, overlaps, buildNavigation, validateLayout } from './geometry.mjs';
import { clone, digest } from './util.mjs';
import { createMotionGroundGuard,MIKA_GROUND_FOOTPRINT_REVISION } from './motion-ground-guard.mjs';
import { FOOD_BINDINGS,BOWL_BINDINGS,foodVesselExclusion,YARD_FOOD_MEDIA_REVISION } from './food-media.mjs';
import {MIKA_ITEM_FOOTPRINTS} from './mika-item-geometry.mjs';
export const MIKA_SCENE = Object.freeze({entry:{x:90,y:68},bowlAnchor:BOWL_BINDINGS['bowl-1'].anchor,
  walkReservationRadius:3.44, footprints:MIKA_ITEM_FOOTPRINTS,
  exclusions:[foodVesselExclusion()]});
/** Suggestions for a NEW placement only. Migration never applies these to stored rows. */
export const MIKA_PLACEMENT_SUGGESTIONS=Object.freeze({
  yarn_mouse:Object.freeze({x:45,y:45}),sun_cushion:Object.freeze({x:54,y:66}),
});
export function createMikaMedia(clips,turns,{scene=MIKA_SCENE,unitsPerWorld=MIKA_ACTOR_PROFILE.unitsPerWorld,
  groundRest=MIKA_ACTOR_ASSETS.groundRest,settledMouse=MIKA_ACTOR_ASSETS.settledMouse}={}) {
  const actorProfile=MIKA_ACTOR_PROFILE,{strideWorld,cycleMs}=actorProfile.locomotion;
  const registry={revision:'mika-persistent-stay/r3-foods',kind:'persistent-mika',foodMediaRevision:YARD_FOOD_MEDIA_REVISION,
    foodBindings:clone(FOOD_BINDINGS),bowlBindings:clone(BOWL_BINDINGS),
    calibrationHash:digest({scene,turns,unitsPerWorld,groundRest,settledMouse,groundFootprints:MIKA_GROUND_FOOTPRINT_REVISION}),bindings:Object.values(clips).map(c=>({
    id:c.id,revision:digest(c),visitorId:actorProfile.visitorId,goodieId:c.goodieId,activityIds:clone(c.activityIds),
    conditions:['new'],propMode:c.propMode,playbackReady:c.playbackReady && (c.goodieId!=='yarn_mouse' || !!(groundRest?.playbackReady && settledMouse?.playbackReady)),requiredPhases:clone(c.requiredPhases),
    validatedPhases:clone(c.validatedPhases),coverage:'persistent-posed-rest-cycle',
  }))};
  // Composing an unrelated species registry must not invalidate an active Mika.
  for(const binding of registry.bindings)binding.calibrationHash=registry.calibrationHash;
  const rect=(min,max)=>({x:min[0],y:min[1],width:max[0]-min[0],height:max[1]-min[1]});
  const transform=(c,p,row)=>({x:p.x+(row.prop[0]-c.samples[0].prop[0])*unitsPerWorld,
    y:p.y+(row.prop[1]-c.samples[0].prop[1])*unitsPerWorld,rotationZ:row.rotationZ,compression:row.compression});
  const root=(c,p,row)=>({x:p.x+(row.root[0]-c.samples[0].prop[0])*unitsPerWorld,
    y:p.y+(row.root[1]-c.samples[0].prop[1])*unitsPerWorld,z:row.root[2]});
  const calibratedScene=scene;
  const preflight=(candidate,b,obstacleContext)=>{
    let c=clips[b.id];const p=candidate.placement,yard=candidate.yard;
    if(!Object.hasOwn(registry.foodBindings,candidate.bowl?.foodId)||registry.foodBindings[candidate.bowl.foodId].presentationReady!==true)
      return{ok:false,code:'FOOD_PRESENTATION_UNAVAILABLE'};
    if(!Object.hasOwn(registry.bowlBindings,candidate.bowl?.id)||registry.bowlBindings[candidate.bowl?.id].presentationReady!==true)
      return{ok:false,code:'BOWL_PRESENTATION_UNAVAILABLE'};
    if(yard.remodel!=='meadow')return{ok:false,code:'REMODEL_PRESENTATION_UNAVAILABLE'};
    const planning=planningSceneWithObstacles(calibratedScene,yard,obstacleContext);if(!planning.ok)return planning;const scene=planning.scene;
    if(yard.placedGoodies.some(row=>!Object.hasOwn(scene.footprints||{},row.goodieId)))return{ok:false,code:'PLACED_PROP_PRESENTATION_UNAVAILABLE'};
    if(candidate.visitor&&candidate.visitor.id!==actorProfile.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
    if(b.visitorId!==actorProfile.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
    if(candidate.active?.some(r=>r.original?.visitorId===actorProfile.visitorId))return{ok:false,code:'MIKA_ALREADY_VISITING'};
    if(c?.goodieId==='yarn_mouse'){
      const yaw=p.rotationZ??0;
      if(Math.abs(yaw-.1)<1e-7){if(!settledMouse?.playbackReady)return{ok:false,code:'SETTLED_MOUSE_MEDIA_UNAVAILABLE'};c=settledMouse;}
      else if(Math.abs(yaw)>1e-7)return{ok:false,code:'MOUSE_ORIENTATION_UNSUPPORTED'};
    }
    if(!c||turns.playbackReady!==true)return{ok:false,code:'TURN_OR_CLIP_MEDIA_NOT_READY'};
    if(!c.actorEnvelope?.meshValidated&&!c.actorEnvelope?.validated)
      return{ok:false,code:'ACTOR_ENVELOPE_NOT_VALIDATED'};
    const e=c.actorEnvelope,origin=c.samples[0].prop;
    const bounds=[e.min,e.max].map((v,k)=>v.map((n,i)=>p[['x','y'][i]]+(n-origin[i]
      +(e.space==='root-relative-world'?(k?Math.max:Math.min)(...c.samples.map(s=>s.root[i])):0))*unitsPerWorld));
    const actorBox=rect(...bounds),other=yard.placedGoodies.filter(q=>q.slotId!==p.slotId).map(q=>footprint(q,scene));
    if(other.some(x=>!x)||actorBox.x<0||actorBox.y<0||actorBox.x+actorBox.width>100||actorBox.y+actorBox.height>100
      ||[...other,...(scene.exclusions||[])].some(r=>overlaps(actorBox,r)))return{ok:false,code:'INTERACTION_ENVELOPE_COLLISION'};
    const final=transform(c,p,c.samples.at(-1));
    const finalYard={...yard,placedGoodies:yard.placedGoodies.map(q=>q.slotId===p.slotId?{...q,...final}:q)};
    if(!validateLayout(finalYard,scene).ok)return{ok:false,code:'FINAL_PROP_PLACEMENT_INVALID'};
    const propBoxes=c.samples.map(row=>footprint({...p,...transform(c,p,row)},scene));
    if(propBoxes.some(box=>[...other,...(scene.exclusions||[])].some(r=>overlaps(box,r))))return{ok:false,code:'PROP_SWEEP_COLLISION'};
    const route=(currentYard,anchor,incoming,initialPhase)=>{
      const obstacles=currentYard.placedGoodies.map(q=>footprint(q,scene)).concat(scene.exclusions||[]);
      const navigation=buildNavigation(currentYard,{...scene,actorRadius:scene.walkReservationRadius,exclusions:[...(scene.exclusions||[]),
        ...currentYard.placedGoodies.map(q=>footprint(q,scene)).filter(box=>!box.blocksMovement)]});
      const ground=createMotionGroundGuard(currentYard,{scene,unitsPerWorld,actorProfile,calibrationHash:b.calibrationHash||registry.calibrationHash});
      navigation.walkSegment=ground.walkSegment;
      return routeProgram({navigation,anchor,entry:scene.entry,portalHalfSize:scene.entryClearance??4,
        unitsPerWorld,actorProfile,incoming,initialPhase,turnDurations:turns.durations,
        canTurn:(position,fromFacing,direction,angleSteps)=>{
          const env=turns.variants?.[`${fromFacing}:${direction}:${angleSteps}`]?.actorEnvelope;
          if(!env?.validated||!ground.canTurn(position,fromFacing,direction,angleSteps))return false;
          const box={x:position.x+env.min[0]*unitsPerWorld,y:position.y+env.min[1]*unitsPerWorld,
            width:(env.max[0]-env.min[0])*unitsPerWorld,height:(env.max[1]-env.min[1])*unitsPerWorld};
          return box.x>=0&&box.y>=0&&box.x+box.width<=100&&box.y+box.height<=100&&!obstacles.some(o=>overlaps(o,box));
        }});
    };
    const startRoot=root(c,p,c.samples[0]),endRoot=root(c,p,c.samples.at(-1));
    if(Math.abs(startRoot.z)>1e-8||Math.abs(endRoot.z)>1e-8)return{ok:false,code:'GROUND_HANDOFF_REQUIRED'};
    const incoming=route(yard,startRoot,true,c.entryGaitPhase||0);
    let outgoing=route(finalYard,endRoot,false,c.terminalGaitPhase||0),restApproach=null,restOrigin=null,restBox=null;
    if(c.goodieId==='yarn_mouse') {
      if(!groundRest?.playbackReady||!groundRest.actorEnvelope?.meshValidated)return{ok:false,code:'LONG_STAY_GROUND_REST_UNAVAILABLE'};
      const nav=buildNavigation(finalYard,{...scene,actorRadius:scene.walkReservationRadius,exclusions:[...(scene.exclusions||[]),
        ...finalYard.placedGoodies.map(q=>footprint(q,scene)).filter(box=>!box.blocksMovement)]});
      const restGround=createMotionGroundGuard(finalYard,{scene,unitsPerWorld,actorProfile,calibrationHash:b.calibrationHash||registry.calibrationHash});
      const obstacles=finalYard.placedGoodies.map(q=>footprint(q,scene)).concat(scene.exclusions||[]);
      // A full-stride +X runway preserves the actual clip's terminal phase and
      // separates the resting paws from the mouse they just pushed.
      for(let strides=1;strides<=10;strides++){
        const target={x:endRoot.x+strides*strideWorld*unitsPerWorld,y:endRoot.y,z:0};
        const e=groundRest.actorEnvelope,box={x:target.x+e.min[0]*unitsPerWorld,y:target.y+e.min[1]*unitsPerWorld,
          width:(e.max[0]-e.min[0])*unitsPerWorld,height:(e.max[1]-e.min[1])*unitsPerWorld};
        const radius=scene.walkReservationRadius,pathBox={x:endRoot.x-radius,y:endRoot.y-radius,
          width:target.x-endRoot.x+radius*2,height:radius*2};
        if(box.x<0||box.y<0||box.x+box.width>100||box.y+box.height>100
          ||obstacles.some(o=>overlaps(box,o)||overlaps(pathBox,o))||!nav.segment(endRoot,target)||!restGround.walkSegment(endRoot,target,0,0))continue;
        const departure=route(finalYard,target,false,groundRest.terminalGaitPhase||0);
        if(!departure.ok)continue;
        const durationMs=strides*cycleMs,distance=strides*strideWorld*unitsPerWorld;
        restApproach={ok:true,durationMs,distance,points:[clone(endRoot),target],phaseAtStart:0,phaseAtEnd:0,turnCount:0,
          legs:[{kind:'walk',from:clone(endRoot),to:target,facing:0,distance,durationMs,startMs:0,endMs:durationMs,
            phaseStart:0,phaseEnd:0,rampInDistance:0,rampOutDistance:0,rampInMs:0,rampOutMs:0,
            cruiseDistance:distance,cruiseMs:durationMs}]};
        restOrigin=target;restBox=box;outgoing=departure;break;
      }
      if(!restApproach)return{ok:false,code:'NO_SAFE_GROUND_REST_SITE'};
    }
    if(!incoming.ok||!outgoing.ok)return{ok:false,code:'CALIBRATED_ROUTE_UNAVAILABLE',incomingReason:incoming.reason||null,outgoingReason:outgoing.reason||null};
    // Keep the same conservative per-leg geometry, but reserve it only while
    // that authored leg is traversed. Rest/clip envelopes keep their full phase.
    const routeBox=leg=>{
      if(leg.kind==='turn'){
        const env=turns.variants[`${leg.fromFacing}:${leg.direction}:${leg.angleSteps}`].actorEnvelope;
        return{x:leg.position.x+env.min[0]*unitsPerWorld,y:leg.position.y+env.min[1]*unitsPerWorld,
          width:(env.max[0]-env.min[0])*unitsPerWorld,height:(env.max[1]-env.min[1])*unitsPerWorld};
      }
      const r=scene.walkReservationRadius??3.44;return{x:Math.min(leg.from.x,leg.to.x)-r,y:Math.min(leg.from.y,leg.to.y)-r,
        width:Math.abs(leg.to.x-leg.from.x)+2*r,height:Math.abs(leg.to.y-leg.from.y)+2*r};
    };
    // Preserve the legacy projection/order for existing placement consumers.
    const boxes=[actorBox,...(restBox?[restBox]:[]),...[incoming,outgoing,...(restApproach?[restApproach]:[])].flatMap(path=>path.legs.map(routeBox))];
    const plan={version:2,clipId:c.id,clipDurationMs:c.durationMs,contactAtMs:c.contactAtMs,
      propFinalAtMs:c.finalTransformAtMs,startRoot,endRoot,initialPlacement:clone(p),finalTransform:final,
      propReleaseAfterMs:c.durationMs,incoming,outgoing,restApproach,restOrigin,reservationBoxes:boxes,
      groundFootprintRevision:MIKA_GROUND_FOOTPRINT_REVISION,
      singleVisualOwner:'clip-while-active',requiresEndpointCommit:true,endpointCommitted:false,
      longStayPresentation:'posed-curl-rest-loop',artStatus:'prototype-under-review',envelopeStatus:c.actorEnvelope.meshValidated?'mesh-validated':'unvalidated'};
    const schedule=buildStaySchedule(candidate,plan,c,groundRest,{actorProfile});
    if(!schedule.ok)return schedule;
    Object.assign(plan,{schedule,segments:schedule.segments,propCommits:schedule.propCommits,propReleaseAt:schedule.propReleaseAt,arrivalAt:candidate.at,departureAt:schedule.departureAt});
    const phaseReservations=schedule.segments.flatMap(seg=>seg.kind==='hidden'||seg.startAt===seg.endAt?[]:
      seg.kind==='route'?seg.route.legs.filter(l=>l.durationMs>0).map(l=>({startMs:seg.startAt+l.startMs,endMs:seg.startAt+l.endMs,rect:routeBox(l)})):
      [{startMs:seg.startAt,endMs:seg.endAt,rect:seg.clipId===c.id?actorBox:restBox}]);
    // Settle/rest/wake share one envelope continuously. Merge only the same
    // phase-box object; geometrically equal, distinct route legs stay distinct.
    const reservations=[];
    for(const row of phaseReservations){const last=reservations.at(-1);if(last?.rect===row.rect&&last.endMs===row.startMs)last.endMs=row.endMs;else reservations.push(row);}
    if([...(candidate.active||[]),...(candidate.reserved||[])].some(r=>presentationReservationsConflict(reservations,r)))
      return{ok:false,code:'PRESENTATION_REGION_RESERVED'};
    plan.reservations=reservations;
    if(planning.receipt)plan.obstacleReceipt=planning.receipt;
    return{ok:true,plan};
  };
  // Read-only usability projection. Existing saves remain byte-identical; a
  // calibrated route failure becomes an explicit recoverable placement state.
  const readinessCache=new Map();
  const placementReadiness=(yard,{actorProfile:requestedActor=MIKA_ACTOR_REFERENCE,obstacleContext}={})=>{
    const rows=yard.placedGoodies||[];
    const selected=resolveActorProfile(requestedActor);
    if(!selected||selected.id!==actorProfile.id||selected.revision!==actorProfile.revision)
      return rows.map(p=>({slotId:p?.slotId,status:'media-unavailable',reason:'ACTOR_PROFILE_UNAVAILABLE'}));
    const slots=rows.map(p=>p?.slotId);
    const key=digest({obstacleRevision:obstacleContextRevision(obstacleContext),actor:requestedActor,calibration:registry.calibrationHash,
      bindings:registry.bindings.filter(b=>b.visitorId===selected.visitorId).map(b=>({id:b.id,revision:b.revision,calibrationHash:b.calibrationHash,playbackReady:b.playbackReady})),remodel:yard.remodel,
      expansionLevel:yard.expansion?.level,duplicateSlots:new Set(slots).size!==slots.length,
      placements:rows.map(p=>p?{goodieId:p.goodieId,x:p.x,y:p.y,rotationZ:p.rotationZ??0,condition:p.condition,
        validSlot:typeof p.slotId==='string'&&p.slotId.length>0}:null)});
    // Geometry is shared across equivalent layouts; account-specific slot IDs,
    // timestamps and opaque saved metadata must never leak through the cache.
    const withSlots=result=>clone(result).map((row,index)=>({...row,slotId:rows[index]?.slotId}));
    if(readinessCache.has(key))return withSlots(readinessCache.get(key));
    const result=rows.map(p=>{
      const matches=registry.bindings.filter(b=>b.visitorId===selected.visitorId&&b.goodieId===p?.goodieId);
      const b=matches.length===1?matches[0]:null;
      if(!b?.playbackReady)return{slotId:p?.slotId,status:'media-unavailable',reason:'INTERACTION_MEDIA_NOT_READY'};
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return{slotId:p.slotId,status:'reposition-needed',reason:'SAVED_ANCHOR_UNRESOLVED'};
      const check=preflight({at:0,leavesAt:45*60000,slotId:p.slotId,placement:p,yard,
        bowl:{id:'bowl-1',foodId:'kibble'},active:[],reserved:[]},b,obstacleContext);
      return{slotId:p.slotId,goodieId:p.goodieId,
        status:check.ok?(p.condition==='new'?'ready':'repair-required'):
          ['PLACED_PROP_PRESENTATION_UNAVAILABLE','REMODEL_PRESENTATION_UNAVAILABLE','PROP_OBSTACLE_SOURCE_UNAVAILABLE','PROP_OBSTACLE_STATE_UNSUPPORTED','UNTRUSTED_PROP_OBSTACLE_CONTEXT'].includes(check.code)?'media-unavailable':'reposition-needed',
        reason:check.ok?(p.condition==='new'?null:'WORN_MEDIA_UNAVAILABLE'):check.code,
        ...(check.incomingReason?{incomingReason:check.incomingReason}:{}),
        ...(check.outgoingReason?{outgoingReason:check.outgoingReason}:{})};
    });
    if(readinessCache.size>=128)readinessCache.delete(readinessCache.keys().next().value);
    readinessCache.set(key,result.map(({slotId,...row})=>clone(row)));return result;
  };
  return{mediaRegistry:registry,preflight,scene,placementReadiness,actorProfiles:ACTOR_PROFILES};
}

let options;
export function getMikaServerOptions(){return options??=createMikaMedia(MIKA_ACTOR_ASSETS.clips,MIKA_ACTOR_ASSETS.turns);}
