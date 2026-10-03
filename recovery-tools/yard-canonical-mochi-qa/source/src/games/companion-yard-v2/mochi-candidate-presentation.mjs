/** Opt-in source presenter for the inactive Mochi candidate. This adapter owns
 * no server admission, clock, cache or actor registry. Callers merge requests
 * into the scene's shared atlas working set and keep the previous whole canvas
 * whenever compose() asks for a coherent frame hold. */
import {clone,deepFreeze} from '../../../game-logic/yard-v2/util.mjs';
import {CAMERA_DIRECTION} from './projection.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const requireContract=(condition,message)=>{if(!condition)throw new TypeError(message);};
export function createMochiCandidatePresenter({binding,combinedMedia,cardinalMedia,strideContract,motionContract,combinedBaseURL,cardinalBaseURL}={}){
 const source=binding?.clip,combined=clone(combinedMedia),cardinal=clone(cardinalMedia);
 requireContract(binding?.binding?.visitorId==='mochi_bunny'&&binding.binding.playbackReady===false
  &&source?.visitorId==='mochi_bunny'&&source.unitsPerWorld===8,'Inactive Mochi source binding required');
 requireContract(combined?.format==='mochi-combined-candidate-media/v1'&&combined.visitorId===source.visitorId
  &&combined.id===source.id&&combined.sourceRigSha256===source.sourceRigSha256
  &&combined.containsTargetProp===true&&combined.targetGoodieId===source.goodieId
  &&combined.durationMs===source.durationMs&&combined.sourceSampleMs===source.sourceSampleMs
  &&combined.frameCount===source.samples.length&&same(combined.restLoop,source.restLoop),'Combined media/source identity mismatch');
 requireContract(cardinal?.format==='mochi-inactive-candidate-media/v1'&&cardinal.actorId==='mochi'
  &&cardinal.visitorId===source.visitorId&&combined.runtimeActivated===false&&cardinal.runtimeActivated===false
  &&combined.playbackReady===false&&cardinal.playbackReady===false,'Candidate presenter cannot activate runtime media');
 requireContract(motionContract?.visitorId===source.visitorId&&motionContract.unitsPerWorld===source.unitsPerWorld
  &&cardinal.walk?.stride===strideContract?.strideWorld&&cardinal.walk?.cycleSeconds*1000===strideContract?.durationMs
  &&motionContract.strideWorld===strideContract.strideWorld&&motionContract.cycleMs===strideContract.durationMs,'Authored motion timing mismatch');
 const scope=(media,revision,base)=>{
  requireContract(typeof revision==='string'&&revision.length>0,'Media revision required');
  requireContract(same(media.cameraDirection,CAMERA_DIRECTION)&&media.labelsBaked===false&&media.runtimeSpriteRotationAllowed===false
   &&media.pixelsPerWorld===combined.pixelsPerWorld&&same(media.canvas,combined.canvas)
   &&same(media.pivotPx,combined.pivotPx)&&same(media.originWorld,[0,0,0]),'Source camera, pivot or scale mismatch');
  requireContract(Number.isSafeInteger(media.frameCount)&&media.frameCount>0&&media.groundContacts?.length===media.frameCount
   &&media.groundContacts.every(points=>Array.isArray(points)&&points.every(p=>p.length===3&&p.every(Number.isFinite))),'Complete ground-contact media required');
  let next=0;requireContract(Array.isArray(media.pages)&&media.pages.length>0,'Atlas pages required');
  for(const p of media.pages){
   requireContract(p.first===next&&Number.isSafeInteger(p.count)&&p.count>0&&/^atlases\/[a-z0-9-]+\.webp$/.test(p.src)
    &&Number.isSafeInteger(p.cols)&&p.cols>0&&same([p.tileWidth,p.tileHeight],media.canvas)
    &&Number.isSafeInteger(p.width)&&Number.isSafeInteger(p.height)&&p.width===p.cols*p.tileWidth
    &&p.height>=Math.ceil(((p.offset||0)+p.count)/p.cols)*p.tileHeight,'Invalid source atlas coverage');
   next+=p.count;
  }
  requireContract(next===media.frameCount,'Incomplete source atlas coverage');
  return deepFreeze({...media,assetBaseURL:new URL(base).href,assetRevision:revision});
 };
 const active=scope(combined,combined.manifestRevision,combinedBaseURL),walk={},turns={};
 for(const facing of [0,2,4,6]){
  const media=cardinal.walk.facings?.[facing],rows=strideContract.frames.slice(0,-1);
  requireContract(media?.id===`hop-${facing}`&&media.durationMs===strideContract.durationMs&&media.frameCount===rows.length
   &&media.sourceSamplesSha256===strideContract.source.posesSha256&&media.rootDistanceSamples?.length===rows.length
   &&rows.every((r,i)=>media.phaseSamples[i]===r.atMs/strideContract.durationMs
    &&Math.abs(media.rootDistanceSamples[i]*strideContract.strideWorld-r.distanceWorld)<1e-8),'Hop pixels and authored root rows disagree');
  walk[facing]=scope(media,cardinal.manifestRevision,cardinalBaseURL);
  for(const [direction,steps]of [[1,2],[-1,2],[1,4]]){
   const key=`${facing}:${direction}:${steps}`,m=cardinal.turns?.[key],name=direction===1?'left':'right';
   requireContract(m?.id===`${name}${steps*45}-${facing}`&&m.startFacing===facing&&m.endFacing===(facing+direction*steps+8)%8
    &&m.direction===direction&&m.angleSteps===steps&&m.durationMs===steps*1000&&m.frameCount===m.durationMs/50+1,'Complete authored turn pixels required');
   if(steps===2)requireContract(m.sourceSamplesSha256===motionContract.sourceHashes[direction===1?'turn-poses.json':'turn-variants/right-90/turn-poses.json'],'Turn source evidence mismatch');
   else requireContract(same(m.composition,[`left90-${facing}`,`left90-${(facing+2)%8}`])&&m.compositionSeamFrame===40&&m.noExtraEndpointHold===true,'Two-turn source seam required');
   turns[key]=scope(m,cardinal.manifestRevision,cardinalBaseURL);
  }
 }
 function select(plan,at){
  if(plan?.visitorId!==source.visitorId||plan.clipId!==source.id||plan.calibrationHash!==binding.binding.calibrationHash)
   return{at,pose:null,issue:'CANDIDATE_PLAN_MISMATCH'};
  const pose=binding.sample(plan,at);if(!pose)return{at,pose:null};
  const clip=pose.phase==='active-clip'?active:pose.motion?.kind==='turn'
   ?turns[`${pose.motion.fromFacing}:${pose.motion.direction}:${pose.motion.angleSteps}`]:walk[pose.motion?.facing];
  const index=pose.phase==='active-clip'?pose.frameIndex:pose.motion?.frameIndex;
  if(!clip||!Number.isInteger(index)||index<0||index>=clip.frameCount)return{at,pose:null,issue:'SOURCE_FRAME_UNAVAILABLE'};
  return{at,pose,clip,index,anchor:clone(pose.phase==='active-clip'?pose.clipOrigin:pose.position)};
 }
 function requests(plan,at,lookaheadMs=1100){
  requireContract(Number.isFinite(lookaheadMs)&&lookaheadMs>=0,'Finite lookahead required');
  const current=select(plan,at),future=select(plan,at+lookaheadMs);
  const request=s=>s.pose?[{clip:s.clip,index:s.index}]:[];
  return{current,required:request(current),lookahead:request(future)};
 }
 function compose(plan,at,props,atlas){
  const selected=select(plan,at);
  if(!selected.pose)return{...selected,props:clone(props),targetSlotHidden:null,requiresCoherentFrameHold:!!selected.issue};
  requireContract(typeof atlas?.frame==='function','Scene-owned atlas cache required');
  if(!atlas.frame(selected.clip,selected.index))return{...selected,props:clone(props),targetSlotHidden:null,requiresCoherentFrameHold:true,issue:'SOURCE_FRAME_PENDING'};
  const view=binding.compose(props,plan,at,{readyFrame:{clipId:selected.clip.id,frameIndex:selected.index}});
  return{...selected,...view};
 }
 return Object.freeze({active,walk:deepFreeze(walk),turns:deepFreeze(turns),select,requests,compose,runtimeActivated:false});
}
