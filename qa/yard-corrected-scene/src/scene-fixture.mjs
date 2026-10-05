import {courtyardPresentation} from '../vendor/r5/src/games/companion-yard-v2/presentation.mjs';
import {MIKA_CLIPS} from '../vendor/r5/game-logic/yard-v2/media/mika-clips.mjs';
/** Read-only owned fixture; no server mutation/outbox replacement or saved-plan rewrite. */
export const fixtureSnapshot={serverTime:1000000,player:{id:'isolated-preview-only'},yard:{
 currencies:{treats:1280,shinyTreats:24},remodel:'meadow',ownedRemodels:['meadow'],
 placedGoodies:[
  {slotId:'preview-mouse',goodieId:'yarn_mouse',x:45,y:45,rotationZ:0,condition:'new'},
  {slotId:'preview-cushion',goodieId:'sun_cushion',x:54,y:66,rotationZ:0,condition:'new'},
  {slotId:'preview-leaf',goodieId:'leaf_pot',x:74,y:60,rotationZ:0,condition:'new'},
  {slotId:'preview-moon',goodieId:'moon_lamp',x:60,y:40,rotationZ:0,condition:'worn'},
  {slotId:'preview-fountain',goodieId:'fountain_bowl',x:31,y:68,rotationZ:0,condition:'new'},
  {slotId:'preview-table',goodieId:'snack_table',x:71,y:81,rotationZ:0,condition:'new'}],
 foodInventory:{kibble:3,berry_plate:1,bonito_bowl:1},goodieInventory:{sun_cushion:1},
 bowls:[{id:'bowl-1',foodId:'kibble',servings:3}],pendingGifts:[],petbook:Object.fromEntries(['mochi_bunny','mika_cat','pip_hamster','pebble_pup','willow_fox','starlit_fox','basil_turtle','sage_turtle'].map(id=>[id,{visits:1}])),album:{photos:[]},companion:{species:'bunny',name:'Mochi'},
 dailyLetter:{stamps:2}},yardRuntime:{serverNow:1000000,mutable:false,visits:[],supportedBindings:{},display:{issues:[]}}};
export function sceneView(snapshot=fixtureSnapshot,at=snapshot.serverTime,catalog=null,targetStillId='mochi:target-yarn-mouse',propStillIds={}) {
 const view=courtyardPresentation(snapshot,at,MIKA_CLIPS);
 const byGoodie={sun_cushion:'sun-cushion-clean',yarn_mouse:targetStillId,leaf_pot:'pebble:leaf-pot',snack_table:'pip:target-snack-table',moon_lamp:'moon-lamp',fountain_bowl:'fountain-bowl',...propStillIds};
 return {...view,renderCatalog:catalog,renderRevision:'isolated-corrected-source-preview',mutable:false,
  props:view.props.map(p=>({...p,supported:!!byGoodie[p.goodieId],conditionPixels:true,
   stillId:['moon_lamp','fountain_bowl'].includes(p.goodieId)?`${byGoodie[p.goodieId]}-${p.condition}-r2`:byGoodie[p.goodieId]}))};
}
export function createSourcePreviewPlan(sampler,presenter,{startAt=1000000,placement=fixtureSnapshot.yard.placedGoodies[0]}={}) {
 const ids=sampler.selectedDescriptorIds,d=ids.map(id=>sampler.getDescriptor(id)).find(d=>d.family==='combined');
 const walk=facing=>ids.map(id=>sampler.getDescriptor(id)).find(d=>d.family==='hop'&&d.startFacing===facing);
 const incomingWalk=walk(d.startFacing),outgoingWalk=walk(d.endFacing),u=8;
 if(!incomingWalk||!outgoingWalk)throw Error('Actual source entry and exit facing media required');
 const origin=[placement.x-sampler.source.propRoot[0]*u,placement.y-sampler.source.propRoot[1]*u,0];
 const entry=d.first.root.map((n,i)=>origin[i]+n*u),exit=d.last.root.map((n,i)=>origin[i]+n*u);
 const displacement=incomingWalk.last.root.map((n,i)=>(n-incomingWalk.first.root[i])*u);
 const incoming=sampler.createRoute({origin:entry.map((n,i)=>n-displacement[i]),initialFacing:d.startFacing,unitsPerWorld:u,legs:[{descriptorId:incomingWalk.newId}]});
 const outgoing=sampler.createRoute({origin:exit,initialFacing:d.endFacing,unitsPerWorld:u,legs:[{descriptorId:outgoingWalk.newId}]});
 return presenter.bindPreviewPlan(sampler.createPreviewPlan({startAt,placement,unitsPerWorld:u,incoming,outgoing,restCycles:1}));
}
