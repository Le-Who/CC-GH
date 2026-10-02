// No game-specific pressure/timer exemptions. Real canvas motion is not a WebAnimation.
export function animationSnapshot(doc){const finite=[],details=[],ignoredInfinite=[];
 for(const a of doc.getAnimations?.()||[]){if(a.playState!=='running')continue;const end=a.effect?.getComputedTiming().endTime;
  const detail={kind:a.constructor?.name||'Animation',property:a.transitionProperty||null,endTime:end??null};
  if(!Number.isFinite(end)){ignoredInfinite.push(detail);continue;}finite.push(a);details.push(detail);
 }return{finite,details,ignoredInfinite};}
