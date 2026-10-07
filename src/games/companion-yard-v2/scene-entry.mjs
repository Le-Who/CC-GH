import{createCourtyardScene as createLegacy}from'./scene.mjs';
import{DEFAULT_RENDER_PROFILE,PAINTED_RENDER_PROFILE}from'./pip-prototype/render-quality-profile.mjs';
import{createSceneOwner}from'./scene-owner.mjs';
export function createCourtyardScene(canvas,options={}){
 const savedBuild=import.meta.env.VITE_YARD_SAVED_VISITS==='true';
 return createSceneOwner(canvas,{...options,canonicalSavedVisitsAllowed:savedBuild,renderProfile:savedBuild&&import.meta.env?.VITE_YARD_PAINTED_FOOD_TRIAL==='true'?PAINTED_RENDER_PROFILE:DEFAULT_RENDER_PROFILE,createLegacy,
  loadPrototype:()=>savedBuild||import.meta.env.VITE_YARD_PIP_PREVIEW==='true'
   ?import('./pip-prototype/yard-pip-scene.mjs'):Promise.reject(Error('Canonical Pip scene is not included in this build'))});
}
