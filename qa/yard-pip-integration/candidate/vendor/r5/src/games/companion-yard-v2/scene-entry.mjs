import{createCourtyardScene as createLegacy}from'./scene.mjs';
import{createSceneOwner}from'./scene-owner.mjs';
export function createCourtyardScene(canvas,options={}){
 return createSceneOwner(canvas,{...options,createLegacy,loadPrototype:()=>import('./pip-prototype/yard-pip-scene.mjs')});
}
