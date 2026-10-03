/** Pure selection of authored poses. Turning never rotates a flat sprite and
 * never quantizes an intermediate yaw into a different walking silhouette. */
import {MIKA_ACTOR_PROFILE} from '../../../game-logic/yard-v2/actor-profiles.mjs';
export function selectPetPose(media,pet,{actorProfile=MIKA_ACTOR_PROFILE}={}){
 if(pet.visitorId&&pet.visitorId!==actorProfile.visitorId)throw Error('Actor visitor/profile mismatch');
 if(pet.actorProfile&&(pet.actorProfile.id!==actorProfile.id||pet.actorProfile.revision!==actorProfile.revision||pet.visitorId!==actorProfile.visitorId))throw Error('Actor pose/profile mismatch');
 if(pet.phase==='active-clip'){
  const clip=media.clips?.[pet.clipId];if(!clip)throw Error('Missing interaction media');
  const sourceIndex=Math.max(0,Math.min(clip.frameCount-1,Math.floor(pet.clipAtMs*clip.fps/1000)));
  return{kind:'interaction',mediaId:pet.clipId,clip,index:clip.frameAliases?.[sourceIndex]??sourceIndex,sourceIndex};
 }
 if(pet.motion?.kind==='turn'){
  const {fromFacing,direction,angleSteps,atMs}=pet.motion;
  if(!Number.isInteger(fromFacing)||fromFacing<0||fromFacing>7||![1,-1].includes(direction)||![2,4].includes(angleSteps)||!Number.isFinite(atMs)||atMs<0)throw Error('Invalid authored turn cursor');
  const mediaId=`${fromFacing}:${direction}:${angleSteps}`,clip=media.turns?.[mediaId];if(!actorProfile.turns.variants.includes(mediaId)||!clip)throw Error(`Missing authored turn media ${mediaId}`);
  return{kind:'turn',mediaId,clip,index:Math.min(clip.frameCount-1,Math.floor(atMs*clip.fps/1000))};
 }
 const heading=pet.headingRadians??0,n=heading/(Math.PI/4),rounded=Math.round(n);
 if(Math.abs(n-rounded)>1e-6)throw Error('Walking route does not match an authored heading');
 const facing=((rounded%8)+8)%8,phase=((pet.gaitPhase??0)%1+1)%1,clip=media.walk?.facings?.[facing];
 if(!actorProfile.locomotion.facings.includes(facing)||!clip)throw Error('True walk media is unavailable; static translation is not allowed');
 let index;
 if(clip.phaseSamples){index=pet.motion?.frameIndex;if(!Number.isInteger(index)||index<0||index>=clip.phaseSamples.length||clip.phaseSamples.length!==clip.frameCount||Math.abs(phase-clip.phaseSamples[index])>1e-8)throw Error('Root and nonuniform authored walk phase disagree');}
 else index=Math.floor(phase*clip.frameCount+1e-7)%clip.frameCount;
 return{kind:'walk',mediaId:`walk:${facing}`,facing,clip,index};
}
