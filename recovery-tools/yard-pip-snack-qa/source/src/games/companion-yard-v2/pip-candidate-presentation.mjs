/** Pip source presenter. It owns neither admission nor the scene cache. */
import {clone} from '../../../game-logic/yard-v2/util.mjs';
import {atlasPageFor} from './atlas.mjs';
const finite=Number.isFinite;
export function createPipCandidatePresenter({source,entry}={}){
 if(source?.binding?.visitorId!=='pip_hamster'||source.binding.playbackReady!==false||entry?.profile?.sourceSampleMs!==40)throw TypeError('Exact inactive Pip source and trusted local entry required');
 const media=entry.manifest;
 function select(plan,at){
  if(plan?.clipId!==source.clip.id||plan.calibrationHash!==source.binding.calibrationHash||plan.visitorId!=='pip_hamster')return{at,pose:null,issue:'PIP_PLAN_MISMATCH'};
  const pose=source.sample(plan,at);if(!pose)return{at,pose:null};
  const clip=pose.phase==='active-clip'?media.clips[pose.clipId]:pose.motion?.kind==='turn'?media.turns[`${pose.motion.fromFacing}:${pose.motion.direction}:${pose.motion.angleSteps}`]:media.walk.facings[pose.motion?.facing];
  const index=pose.phase==='active-clip'?pose.frameIndex:pose.motion?.frameIndex;
  if(!clip||!Number.isInteger(index)||index<0||index>=clip.frameCount)return{at,pose:null,issue:'PIP_FRAME_UNAVAILABLE'};
  return{at,pose,clip,index,anchor:clone(pose.phase==='active-clip'?pose.clipOrigin:pose.position)};
 }
 function requests(plan,at){
  if(!finite(at))throw TypeError('Finite presentation time required');const current=select(plan,at),required=current.pose?[{clip:current.clip,index:current.index}]:[];if(!current.pose)return{current,required,lookahead:[]};
  const key=v=>v.pose?`${v.clip.assetRevision}:${v.clip.id}:${atlasPageFor(v.clip,v.index).page.src}`:null,nowKey=key(current);let future=null;
  // The nearest source page/phase change cannot be skipped by a 1100ms jump.
  // Bounded ≤41 pure samples; no requests are made for intervening frames.
  for(let dt=40;dt<=1640;dt+=40){const v=select(plan,at+dt);if(!v.pose)break;if(key(v)!==nowKey){future=v;break;}}
  return{current,required,lookahead:future?[{clip:future.clip,index:future.index}]:[]};
 }
 function compose(plan,at,props,atlas){
  const selected=select(plan,at);if(!selected.pose)return{...selected,props:clone(props),targetSlotHidden:null,requiresCoherentFrameHold:!!selected.issue};
  if(typeof atlas?.frame!=='function')throw TypeError('Scene-owned bounded cache required');
  if(!atlas.frame(selected.clip,selected.index))return{...selected,props:clone(props),targetSlotHidden:null,requiresCoherentFrameHold:true,issue:'PIP_FRAME_PENDING'};
  const view=source.compose(props,plan,at,{readyFrame:{clipId:selected.clip.id,frameIndex:selected.index,sourceRevision:source.clip.revision}});return{...selected,...view};
 }
 return Object.freeze({select,requests,compose,runtimeActivated:false});
}
