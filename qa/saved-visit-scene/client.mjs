import{createCourtyardScene}from'/source/src/games/companion-yard-v2/scene-entry.mjs';
import{createUiImageReserve}from'/source/src/games/companion-yard-v2/ui-image-reserve.mjs';
const fixture=await(await fetch('/source/tests/fixtures/canonical-saved-public.json')).json();
const snapshot={...fixture,player:{id:'saved-scene-qa'}},original=JSON.stringify(snapshot),plan=snapshot.yardRuntime.canonicalVisits[0].plan;
let owner=null,view=null,offset=0,ui=null,modeState=null;const failures=[],now=()=>performance.now()+offset,session={};
const canvas=document.querySelector('#background'),host=document.querySelector('#direct');
async function settle(){await owner.ready;await owner.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
async function mount(){ui=createUiImageReserve();owner=createCourtyardScene(canvas,{directHost:host,uiImageOwner:ui,prototypeAllowed:false,now,onView:v=>view=v,onPrototypeState:v=>modeState=v,onError:e=>failures.push(String(e)),onSceneFailure:e=>failures.push(e)});owner.update(snapshot,{accountSession:session});await settle();}
await mount();
window.sceneQA={ready:true,plan,failures,
 diagnostics:()=>({...owner.diagnostics(),view:{pets:view?.pets,itemMutable:view?.itemMutable,canonicalState:view?.canonicalState},hostVisibility:host.style.visibility,modeState,sourceUnchanged:JSON.stringify(snapshot)===original}),
 async advanceTo(serverNow){const current=owner.diagnostics().savedServerNow;if(serverNow<current)throw Error('Cannot rewind authoritative presentation clock');offset+=serverNow-current;owner.update(snapshot,{accountSession:session});await settle();},
 async pending(){owner.update({...snapshot,yardRuntime:{...snapshot.yardRuntime,status:'reconciliation-pending'}},{accountSession:session});await settle();},
 async recover(){owner.update(snapshot,{accountSession:session});await settle();},
 async remount(){await owner.dispose();await mount();},
 async loseAndRestoreContext(){const surface=host.querySelector('canvas'),gl=surface?.getContext('webgl2'),extension=gl?.getExtension('WEBGL_lose_context');if(!extension)throw Error('WEBGL_lose_context unavailable');extension.loseContext();await new Promise(r=>setTimeout(r,100));extension.restoreContext();},
 async resumePastDeparture(){window.dispatchEvent(new Event('blur'));const current=owner.diagnostics().savedServerNow;offset+=Math.max(0,plan.leavesAt+1000-current);window.dispatchEvent(new Event('focus'));await settle();},
 manualDenied:async()=>({prototype:await owner.setPrototypeEnabled(true),items:await owner.setCanonicalItemsEnabled(true),disablePrototype:await owner.setPrototypeEnabled(false),disableItems:await owner.setCanonicalItemsEnabled(false),inspect:owner.inspectCanonicalSlot('canonical:a')}),
 async dispose(){await owner.dispose();}
};
