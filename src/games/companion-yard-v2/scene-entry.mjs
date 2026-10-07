import{createCourtyardScene as createLegacy}from'./scene.mjs';
import{createSceneOwner}from'./scene-owner.mjs';
export function createCourtyardScene(canvas,options={}){
 const savedBuild=import.meta.env.VITE_YARD_SAVED_VISITS==='true';
 return createSceneOwner(canvas,{...options,canonicalSavedVisitsAllowed:savedBuild,createLegacy,
  loadPrototype:()=>savedBuild||import.meta.env.VITE_YARD_PIP_PREVIEW==='true'
   ?import('./pip-prototype/yard-pip-scene.mjs'):Promise.reject(Error('Canonical Pip scene is not included in this build'))});
}
