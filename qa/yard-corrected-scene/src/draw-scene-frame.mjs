/** R5 scene draw sequence extracted for the isolated native/browser candidate.
 * Actual source environment, bowl binding, projection, pivot/scale and Y-sort.
 * UI is real React/CSS outside this canvas; no painted DOM stand-in. */
import {drawEnvironment} from '../vendor/r5/src/games/companion-yard-v2/scene45-environment.mjs';
import {foodBowlPresentation} from '../vendor/r5/game-logic/yard-v2/food-media.mjs';
import {sourcePixelRect} from '../vendor/r5/src/games/companion-yard-v2/scene45-transform.mjs';
export function drawSceneFrame(ctx,{projection,images,stills,cottageLayer,view,actorLayers=[],dpr=1}) {
 const {width,height}=projection;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
 drawEnvironment(ctx,projection,{ground:images.get('environment:ground'),cottage:images.get('environment:cottage')},cottageLayer);
 const drawn=[];
 function sprite(id,anchor,alpha=1){const im=images.get(id),meta=stills[id];if(!im||!meta)throw Error(`Missing verified scene still: ${id}`);
  const r=sourcePixelRect(meta,anchor,projection);ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,r.x,r.y,r.width,r.height);ctx.restore();drawn.push({kind:'still',id,anchor,rect:r,alpha});}
 for(const food of foodBowlPresentation(view.bowls))sprite(food.stillId,food.anchor);
 const layers=[];
 for(const prop of view.props){if(!prop.supported||!prop.drawStandalone)continue;const anchor=prop.transform||prop;
  layers.push({y:projection.project(anchor).y,draw:()=>sprite(prop.stillId,anchor,prop.conditionPixels||prop.condition==='new'?1:.7)});}
 for(const actor of actorLayers)if(actor.pose)layers.push({y:projection.project(actor.anchor).y,draw:()=>{actor.draw(ctx,projection);drawn.push({kind:'actor',id:actor.id,anchor:actor.anchor,sourceAtMs:actor.pose.frame.sourceAtMs});}});
 layers.sort((a,b)=>a.y-b.y).forEach(l=>l.draw());return drawn;
}
