/** Inspect only the already committed presentation plan. Never simulate economics. */
function legHint(media,leg){if(!leg)return null;if(leg.kind==='turn'){const key=`${leg.fromFacing}:${leg.direction}:${leg.angleSteps}`;return{clip:media.turns[key],index:0,mediaId:key};}const clip=media.walk.facings[leg.facing],phase=leg.phaseStart||0,index=clip.phaseSamples?clip.phaseSamples.findIndex(p=>Math.abs(p-phase)<1e-8):Math.floor(phase*clip.frameCount)%clip.frameCount;if(index<0)throw Error('Upcoming root phase has no authored media sample');return{clip,index,mediaId:`walk:${leg.facing}`};}
export function nextMediaHint(media,pet,plan,leadMs=1000){
 if(!plan)return null;
 if(pet.phase==='active-clip'){const clip=media.clips[pet.clipId];if(clip.durationMs-pet.clipAtMs>leadMs)return null;return legHint(media,plan.exitMotion?.legs?.[0]);}
 const program=pet.phase==='approach'?plan.entryMotion:plan.exitMotion,index=pet.motion?.legIndex;
 if(!program||!Number.isInteger(index)||pet.motion.durationMs-pet.motion.atMs>leadMs)return null;
 const next=program.legs[index+1];if(next)return legHint(media,next);
 if(pet.phase==='approach')return{clip:media.clips[pet.clipId],index:0,mediaId:pet.clipId};
 return null;
}
