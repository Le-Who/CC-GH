/** Serialize visual owners. A retiring fetch/decode must settle before replacement. */
let retirementBarrier=Promise.resolve();
export function createSceneOwner(canvas,{createLegacy,loadPrototype,prototypeAllowed=false,directHost,uiImageOwner,onView=()=>{},onError=()=>{},onPrototypeState=()=>{},...options}){
 let active=null,snapshot=null,view=null,disposed=false,suspended=false,desired=false,epoch=0,tail=Promise.resolve(),currentMode='legacy',lastFailure=null,lastRetired=null,transitions=0,retirements=0;
 const state=extra=>{if(extra?.error)lastFailure=extra.error;onPrototypeState({allowed:prototypeAllowed,enabled:desired,mode:currentMode,error:lastFailure,...extra});};
 function guarded(token){return{...options,directHost,uiImageOwner,onView:value=>{if(token===epoch&&!disposed&&!suspended){view=value;onView(value);}},onError:error=>{if(token===epoch&&!disposed)onError(error);},onPrototypeState:value=>{if(token===epoch&&!disposed)state(value);},onFailure:error=>{if(token===epoch&&!disposed){state({phase:'failed',error:error.message});switchMode(false);}}};}
 function blocked(error){if(!disposed){state({phase:'failed',error:error.message});onError(error);}return false;}
 function retire(){const old=active;active=null;if(!old)return retirementBarrier;let finished;try{finished=old.dispose();}catch(error){finished=Promise.reject(error);}uiImageOwner?.setAdmissionCheck(()=>false);const done=Promise.resolve(finished).then(()=>{retirements++;try{lastRetired=old.diagnostics?.()??null;}catch(error){lastRetired={diagnosticsError:error.message};}canvas.width=0;canvas.height=0;});retirementBarrier=Promise.all([retirementBarrier,done]).then(()=>{});retirementBarrier.catch(()=>{});return retirementBarrier;}
 function switchMode(enabled){
  if(disposed)return Promise.resolve(false);if(enabled&&!prototypeAllowed)return Promise.resolve(false);
  desired=Boolean(enabled);if(desired)lastFailure=null;transitions++;const token=++epoch,previous=retire();currentMode='transition';
  if(view)onView({...view,mutable:false,mediaReady:false});state({phase:'loading'});
  tail=tail.then(()=>previous).then(async()=>{
   if(token!==epoch||disposed||suspended)return false;
   try{const create=desired?(await loadPrototype()).createPipYardScene:createLegacy;if(token!==epoch||disposed||suspended)return false;
    currentMode=desired?'pip-prototype':'legacy';active=create(canvas,guarded(token));if(snapshot)active.update(snapshot);state({phase:desired?'loading':'off'});return true;
   }catch(error){if(token===epoch&&!disposed){state({phase:'failed',error:error.message});if(desired){desired=false;queueMicrotask(()=>switchMode(false));}else onError(error);}return false;}
  }).catch(blocked);return tail;
 }
 const onHide=()=>{suspended=true;desired=false;++epoch;const previous=retire();tail=tail.then(()=>previous).catch(blocked);state({phase:'off',enabled:false});};
 const onShow=event=>{if(event.persisted&&!disposed){suspended=false;switchMode(false);}};
 window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);
 // React effect cleanup cannot await disposal. A new mount must also honor
 // all earlier scene retirements before allocating a legacy canvas or images.
 uiImageOwner?.setAdmissionCheck(()=>false);const initialEpoch=epoch;
 tail=retirementBarrier.then(()=>{if(disposed||suspended||epoch!==initialEpoch)return;active=createLegacy(canvas,guarded(initialEpoch));if(snapshot)active.update(snapshot);}).catch(blocked);
 return{update(value){snapshot=value;active?.update(value);},setGhost(value){active?.setGhost(value);},point:event=>active?.point(event)??null,hit:event=>active?.hit(event)??null,offsetPoint:(p,d)=>active?.offsetPoint(p,d)??null,
  setPrototypeEnabled:switchMode,inspectAgain:()=>active?.inspectAgain?.(),moveTo:index=>active?.moveTo?.(index),movePlanter:index=>active?.movePlanter?.(index),
  diagnostics:()=>({mode:currentMode,enabled:desired,transitioning:currentMode==='transition',transitions,retirements,lastRetired,uiImages:uiImageOwner?.snapshot?.()??null,scene:active?.diagnostics?.()}),
  get ready(){return active?.ready??tail;},
  dispose(){if(disposed)return tail;disposed=true;desired=false;++epoch;window.removeEventListener('pagehide',onHide);window.removeEventListener('pageshow',onShow);const previous=retire();tail=tail.then(()=>previous).catch(blocked);return tail;}
 };
}
