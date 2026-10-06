/** Static food binding for the inactive courtyard candidate. Catalog price,
 * servings, attraction and lifetime remain owned by yard-catalog.js.
 * Bounds come from evaluated Blender meshes, not the apparent alpha rectangle.
 * Art remains a candidate until the scene/browser quality gate is accepted. */
export const YARD_FOOD_MEDIA_REVISION='yard-food-stills/20261002-r1';
export const FOOD_BINDINGS=Object.freeze({
  kibble:Object.freeze({presentationReady:true,filledStillId:'kibble-bowl-clean',emptyStillId:'kibble-bowl-empty',
    worldBounds:Object.freeze({min:Object.freeze([-.45,-.45,0]),max:Object.freeze([.45,.45,.23])})}),
  berry_plate:Object.freeze({presentationReady:true,filledStillId:'berry-plate-clean',emptyStillId:'kibble-bowl-empty',
    worldBounds:Object.freeze({min:Object.freeze([-.4803236722946167,-.4803236722946167,.012000001966953278]),
      max:Object.freeze([.4803236722946167,.4803236722946167,.2608437240123749])})}),
  bonito_bowl:Object.freeze({presentationReady:true,filledStillId:'bonito-bowl-clean',emptyStillId:'kibble-bowl-empty',
    worldBounds:Object.freeze({min:Object.freeze([-.4430169463157654,-.4430169463157654,.012000001966953278]),
      max:Object.freeze([.4430169463157654,.4430169463157654,.31467205286026])})}),
});
export const BOWL_BINDINGS=Object.freeze({
  'bowl-1':Object.freeze({presentationReady:true,anchor:Object.freeze({x:25,y:83})}),
});
// Reserve the union of every supported vessel, even when empty. Refilling cannot
// enlarge an obstacle under a saved visit, and a food change never relocates a prop.
export function foodVesselExclusion(anchor=BOWL_BINDINGS['bowl-1'].anchor,unitsPerWorld=8) {
  const items=Object.values(FOOD_BINDINGS),min=[0,1].map(i=>Math.min(...items.map(v=>v.worldBounds.min[i]))),
    max=[0,1].map(i=>Math.max(...items.map(v=>v.worldBounds.max[i])));
  return {x:anchor.x+min[0]*unitsPerWorld,y:anchor.y+min[1]*unitsPerWorld,
    width:(max[0]-min[0])*unitsPerWorld,height:(max[1]-min[1])*unitsPerWorld};
}
/** Unknown/saved second bowls remain represented in the UI as unavailable; they
 * must not be rendered at the first bowl's anchor or become its food source. */
export function foodBowlPresentation(bowls,{foodBindings=FOOD_BINDINGS,bowlBindings=BOWL_BINDINGS}={}) {
  return (bowls||[]).flatMap(bowl=>{
    const socket=Object.hasOwn(bowlBindings,bowl?.id)?bowlBindings[bowl.id]:null;
    if(!socket?.presentationReady)return [];
    const food=Object.hasOwn(foodBindings,bowl.foodId)?foodBindings[bowl.foodId]:null;
    const filled=food?.presentationReady===true&&Number.isFinite(bowl.servings)&&bowl.servings>0;
    return [{bowlId:bowl.id,anchor:{...socket.anchor},foodId:filled?bowl.foodId:null,
      stillId:filled?food.filledStillId:'kibble-bowl-empty',preservedUnsupported:!!bowl.foodId&&!food?.presentationReady}];
  });
}
