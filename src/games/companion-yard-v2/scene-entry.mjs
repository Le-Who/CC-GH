import{createCourtyardScene as createLegacy}from'./scene.mjs';
import{createSceneOwner}from'./scene-owner.mjs';
export function createCourtyardScene(canvas,options={}){
 return createSceneOwner(canvas,{...options,createLegacy,loadPrototype:()=>import.meta.env.VITE_YARD_PIP_PREVIEW==='true'
  ?import('./pip-prototype/yard-pip-scene.mjs'):Promise.reject(Error('Pip preview is not included in this build'))});
}
