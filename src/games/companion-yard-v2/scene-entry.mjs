import{createCourtyardScene as createLegacy}from'./scene.mjs';
import{DEFAULT_RENDER_PROFILE,PAINTED_RENDER_PROFILE}from'./pip-prototype/render-quality-profile.mjs';
import{createSceneOwner}from'./scene-owner.mjs';
export function createCourtyardScene(canvas,options={}){
 const savedBuild=import.meta.env.VITE_YARD_SAVED_VISITS==='true';
 const qaBuild=!savedBuild&&import.meta.env.VITE_YARD_MIKA_QA==='true';
 const qaContinuation=qaBuild&&import.meta.env.VITE_YARD_MIKA_ITEM_QA==='true'&&import.meta.env.VITE_YARD_MIKA_CONTINUATION_QA==='true';
 let qaEpoch=0,qaSession=null,qaAccount=null,qaSessionObserved=false;
 const legacyFactory=qaBuild?(canvas,options)=>createLegacy(canvas,{...options,qaSessionEpoch:()=>qaEpoch,qaContinuation,qaItemApproach:import.meta.env.VITE_YARD_MIKA_ITEM_QA==='true',loadQaLayer:()=>import('./mika-qa/mika-yard-layer.mjs')}):createLegacy;
 const owner=createSceneOwner(canvas,{...options,canonicalSavedVisitsAllowed:savedBuild,renderProfile:savedBuild&&import.meta.env?.VITE_YARD_PAINTED_FOOD_TRIAL==='true'?PAINTED_RENDER_PROFILE:DEFAULT_RENDER_PROFILE,createLegacy:legacyFactory,
  loadPrototype:()=>savedBuild||import.meta.env.VITE_YARD_PIP_PREVIEW==='true'
   ?import('./pip-prototype/yard-pip-scene.mjs'):Promise.reject(Error('Canonical Pip scene is not included in this build'))});
 if(qaBuild){const update=owner.update;owner.update=(value,context)=>{const next=context?.accountSession??null,nextAccount=value?.player?.id??null;if(qaSessionObserved&&(next!==qaSession||nextAccount!==qaAccount))qaEpoch++;qaSessionObserved=true;qaSession=next;qaAccount=nextAccount;return update(value,context);};const diagnostics=Object.freeze({snapshot:()=>owner.diagnostics(),...(qaContinuation?{requestItemArrival:slotId=>owner.requestMikaItemArrival(slotId)}:{})});globalThis.__yardMikaQa=diagnostics;const dispose=owner.dispose;owner.dispose=()=>{qaEpoch++;qaSession=null;qaAccount=null;if(globalThis.__yardMikaQa===diagnostics)delete globalThis.__yardMikaQa;return dispose();};}
 return owner;
}

