import{PIP_GROUNDING_PREVIEW_RECIPE}from'./pip-preview-gate.mjs';
import{PresentationClock}from'./presentation-clock.mjs';
import{isCanonicalItemIntent}from'../../game-state/canonicalYardProtocol.mjs';
/** Serialize visual owners. A retiring fetch/decode must settle before replacement. */
let retirementBarrier=Promise.resolve();
const defaultMonotonicNow=()=>performance.now(),clockDomains=new WeakMap();
function clockFor(now){if(!clockDomains.has(now))clockDomains.set(now,new PresentationClock(now));return clockDomains.get(now);}
export function createSceneOwner(canvas,{createLegacy,loadPrototype,prototypeAllowed=false,canonicalSavedVisitsAllowed=false,directHost,uiImageOwner,onView=()=>{},onError=()=>{},onPrototypeState=()=>{},onSceneFailure=()=>{},...options}){
 let active=null,snapshot=null,view=null,disposed=false,suspended=false,desired=false,canonicalItems=false,canonicalSavedVisits=false,canonicalActionPending=false,epoch=0,tail=Promise.resolve(),currentMode='legacy',lastFailure=null,lastRetired=null,transitions=0,retirements=0;
 const savedVisitClock=clockFor(options.now??defaultMonotonicNow);
 const savedSnapshot=()=>canonicalSavedVisitsAllowed&&snapshot?.yardRuntime?.storageVersion===3&&snapshot?.yardRuntime?.canonicalVisitProtocol==='yard-canonical-authoritative/v1';
 const selectedMode=()=>canonicalSavedVisits?'canonical-saved-visits':canonicalItems?'canonical-items':'pip-prototype';
 let failureDetail=null,ownerAccount=null,ownerSession=null,ownerObserved=false;
 const state=extra=>{if(extra?.error)lastFailure=extra.error;onPrototypeState({allowed:prototypeAllowed,enabled:desired,mode:currentMode,error:lastFailure,...extra});};
 function fail(error,context){
  failureDetail={mode:currentMode,name:String(error?.name||'Error'),message:String(error?.message||error).slice(0,1024),stack:String(error?.stack||'').slice(0,4096),context:context??null};
  state({phase:'failed',error:failureDetail.message});
  if(canonicalSavedVisits){
   // A failed genuine owner stays hidden. Never substitute a manual/legacy
   // scene while this authoritative saved projection is still current.
   const failedEpoch=++epoch,previous=retire();currentMode='canonical-saved-visits';
   canvas.style&&(canvas.style.visibility='hidden');directHost.style&&(directHost.style.visibility='hidden');
   if(view)onView({...view,pets:[],mutable:false,itemMutable:false,mediaReady:false});
   tail=tail.then(()=>previous).then(()=>{if(epoch===failedEpoch&&!disposed){canvas.style&&(canvas.style.visibility='hidden');directHost.style&&(directHost.style.visibility='hidden');}}).catch(blocked);
  }else switchMode(false);
  // Retire the visual owner first. Clearing a draft here never touches the
  // durable outbox, including an unresolved committed-response loss.
  onSceneFailure(failureDetail);onError(Object.assign(new Error(failureDetail.message),{code:'YARD_PIP_SCENE_FAILED'}));
 }
 function guarded(token){return{...options,ownerKey:token,canonicalItems,canonicalSavedVisits,savedVisitClock,groundingRecipe:canonicalSavedVisits?PIP_GROUNDING_PREVIEW_RECIPE:options.groundingRecipe,canonicalFoodPreview:canonicalSavedVisits||options.canonicalFoodPreview,canonicalActionPending,directHost,uiImageOwner,onRestartRequired:()=>{if(token===epoch&&!disposed&&desired)switchMode(true,selectedMode());},onView:value=>{if(token===epoch&&!disposed&&!suspended){view=value;onView(value);}},onError:error=>{if(token===epoch&&!disposed)onError(error);},onPrototypeState:value=>{if(token===epoch&&!disposed)state(value);},onFailure:(error,context)=>{if(token===epoch&&!disposed)fail(error,context);}};}
 function blocked(error){if(!disposed){state({phase:'failed',error:error.message});onError(error);}return false;}
 function retire(){const old=active;active=null;if(!old)return retirementBarrier;let finished;try{finished=old.dispose();}catch(error){finished=Promise.reject(error);}uiImageOwner?.setAdmissionCheck(()=>false);const done=Promise.resolve(finished).then(()=>{retirements++;try{lastRetired=old.diagnostics?.()??null;}catch(error){lastRetired={diagnosticsError:error.message};}canvas.width=0;canvas.height=0;});retirementBarrier=Promise.all([retirementBarrier,done]).then(()=>{});retirementBarrier.catch(()=>{});return retirementBarrier;}
 function switchMode(enabled,mode='pip-prototype',{accountExit=false}={}){
  if(disposed)return Promise.resolve(false);
  if(!enabled&&(savedSnapshot()||canonicalSavedVisits)&&!accountExit)return Promise.resolve(false);
  if(enabled&&(mode==='canonical-saved-visits'?!canonicalSavedVisitsAllowed:!prototypeAllowed||savedSnapshot()||canonicalSavedVisits))return Promise.resolve(false);
  desired=Boolean(enabled);canonicalSavedVisits=desired&&mode==='canonical-saved-visits';canonicalItems=desired&&(mode==='canonical-items'||canonicalSavedVisits);if(desired)lastFailure=null;transitions++;const token=++epoch,previous=retire();currentMode='transition';
  if(view)onView({...view,mutable:false,itemMutable:false,mediaReady:false});state({phase:'loading'});
  tail=tail.then(()=>previous).then(async()=>{
   if(token!==epoch||disposed||suspended)return false;
   try{const create=desired?(await loadPrototype()).createPipYardScene:createLegacy;if(token!==epoch||disposed||suspended)return false;
    currentMode=desired?selectedMode():'legacy';if(!desired){canvas.style&&(canvas.style.visibility='');directHost.style&&(directHost.style.visibility='');}active=create(canvas,guarded(token));if(snapshot)active.update(snapshot);state({phase:desired?'loading':'off'});return true;
   }catch(error){if(token===epoch&&!disposed){if(desired)fail(error,{operation:'create-scene'});else{state({phase:'failed',error:error.message});onError(error);}}return false;}
  }).catch(blocked);return tail;
 }
 const onHide=()=>{suspended=true;desired=false;++epoch;const previous=retire();tail=tail.then(()=>previous).catch(blocked);state({phase:'off',enabled:false});};
 const onShow=event=>{if(event.persisted&&!disposed){suspended=false;if(savedSnapshot())switchMode(true,'canonical-saved-visits');else switchMode(false);}};
 window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);
 // React effect cleanup cannot await disposal. A new mount must also honor
 // all earlier scene retirements before allocating a legacy canvas or images.
 uiImageOwner?.setAdmissionCheck(()=>false);const initialEpoch=epoch;
 tail=retirementBarrier.then(()=>{if(disposed||suspended||epoch!==initialEpoch)return;active=createLegacy(canvas,guarded(initialEpoch));if(snapshot)active.update(snapshot);}).catch(blocked);
 return{update(value,{accountSession=null}={}){
   const account=value?.player?.id??null,changed=ownerObserved&&(account!==ownerAccount||accountSession!==ownerSession);
   ownerObserved=true;ownerAccount=account;ownerSession=accountSession;snapshot=value;
   const serverNow=value?.yardRuntime?.serverNow;if(savedSnapshot()&&Number.isSafeInteger(serverNow)&&serverNow>=0)savedVisitClock.update(serverNow);
   if(savedSnapshot()&&(!canonicalSavedVisits||!active&&!suspended&&!lastFailure&&currentMode!=='transition')){switchMode(true,'canonical-saved-visits');return;}
   // Retire the entire optional renderer before A→B or A→B→A can reuse an
   // in-flight food owner. Session identity is opaque, never stringified.
   if(changed&&canonicalSavedVisits&&!savedSnapshot()){switchMode(false,'pip-prototype',{accountExit:true});return;}
   if(changed&&desired){switchMode(true,selectedMode());return;}
   active?.update(value);
  },setGhost(value){if(value&&isCanonicalItemIntent(value)&&currentMode!=='canonical-items')return false;active?.setGhost(value);return true;},point:event=>active?.point(event)??null,hit:event=>active?.hit(event)??null,offsetPoint:(p,d)=>active?.offsetPoint(p,d)??null,
  setCanonicalActionPending:value=>{canonicalActionPending=!!value;active?.setCanonicalActionPending?.(value);},
  commitPresentation:value=>!disposed&&!suspended&&currentMode==='legacy'&&value===view?active?.commitPresentation?.(value)??false:false,
  requestMikaItemArrival:slotId=>!disposed&&!suspended&&currentMode==='legacy'?active?.requestMikaItemArrival?.(slotId)??{ok:false,reason:'NATIVE_ACTION_UNAVAILABLE'}:{ok:false,reason:'NATIVE_ACTION_UNAVAILABLE'},
  inspectCanonicalSlot:slotId=>active?.inspectCanonicalSlot?.(slotId),
  selectCanonicalSlot:slotId=>active?.selectCanonicalSlot?.(slotId),
  beginPointer:()=>active?.beginPointer?.(),endPointer:()=>active?.endPointer?.(),
  checkPlacement:value=>active?.checkPlacement?.(value)??null,defaultItemAnchor:()=>active?.defaultItemAnchor?.()??null,
  setPrototypeEnabled:enabled=>switchMode(enabled),setCanonicalItemsEnabled:enabled=>switchMode(enabled,'canonical-items'),inspectAgain:()=>active?.inspectAgain?.(),moveTo:index=>active?.moveTo?.(index),movePlanter:index=>active?.movePlanter?.(index),
  diagnostics:()=>({mode:currentMode,enabled:desired,canonicalSavedVisitsAllowed,canonicalSavedVisits,savedServerNow:savedVisitClock.read(),transitioning:currentMode==='transition',transitions,retirements,lastFailure:failureDetail?structuredClone(failureDetail):null,lastRetired,uiImages:uiImageOwner?.snapshot?.()??null,scene:active?.diagnostics?.()}),
  get ready(){return active?.ready??tail;},
  dispose(){if(disposed)return tail;disposed=true;desired=false;++epoch;window.removeEventListener('pagehide',onHide);window.removeEventListener('pageshow',onShow);const previous=retire();tail=tail.then(()=>previous).catch(blocked);return tail;}
 };
}

