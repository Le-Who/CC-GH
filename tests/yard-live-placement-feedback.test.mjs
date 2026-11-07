import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {selectPendingPlacementVisuals,mergePlacementVisuals} from '../src/game-state/yardPlacementFeedback.mjs';
const courtyard=await readFile(process.env.YARD_LIVE_COURTYARD_SOURCE||new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url),'utf8');
const helper=courtyard.match(/function pendingScenePlacement\([\s\S]*?\n\}/)?.[0]||'';
const intent=(extra={})=>({accountId:'A',clientActionId:'yard:test',action:'yard.placeGoodie',payload:{slotId:'free_test',goodieId:'yarn_mouse',x:45,y:45},status:'pending',...extra});
const snapshot=()=>({player:{id:'A'},yard:{placedGoodies:[],goodieInventory:{yarn_mouse:1},currencies:{treats:20}}});
function select(){const context={selectPendingPlacementVisuals,isCanonicalItemIntent:p=>!!p.locationId,canonicalPlacements:s=>s.yardRuntime?.canonicalPlacements||[],canonicalCommandScope:()=>({locationId:'canonical',locationVersion:1,geometryRevision:'g1'})};vm.runInNewContext(helper+'\nglobalThis.select=pendingScenePlacement',context);return context.select;}
test('actual Courtyard editor handoff keeps a durable pending visual without changing ownership',()=>{
 const source=courtyard.match(/const cancel=useCallback\(([\s\S]*?),\[\]\);/)[1],state={snapshot:snapshot(),pendingActions:[intent()]},before=JSON.stringify(state.snapshot);
 let sceneGhost={...intent().payload};
 const context={useGameHub:{getState:()=>state},ghostRef:{current:sceneGhost},drag:{current:null},canvas:{current:null},scene:{current:{endPointer(){},setGhost:row=>sceneGhost=row}},setGhost(){},pendingPlacement:()=>state.pendingActions[0],placementMode:{current:{canonical:false}},selectPendingPlacementVisuals,isCanonicalItemIntent:()=>false,canonicalPlacements:()=>[],canonicalCommandScope:()=>null};
 vm.runInNewContext(helper+'\n('+source+')(true)',context);
 assert.ok(sceneGhost,'accepted editor close must retain the pending visual');assert.equal(sceneGhost.pendingActionId,'yard:test');assert.equal(JSON.stringify(state.snapshot),before);
});
test('pending visual remains one per slot through server echo and retires only with settlement or failure',()=>{
 const choose=select(),state={snapshot:snapshot(),pendingActions:[intent(),intent()]};
 for(const status of ['pending','sending','rollout-paused','canonical-blocked']){state.pendingActions[0].status=status;assert.equal(choose(state).pendingActionId,'yard:test');assert.equal(selectPendingPlacementVisuals({accountId:'A',pendingActions:state.pendingActions}).length,1);}
 state.snapshot.yard.placedGoodies=[{...intent().payload,condition:'new'}];assert.equal(mergePlacementVisuals(state.snapshot.yard.placedGoodies,[choose(state)]).length,1);
 state.pendingActions=[];assert.equal(choose(state),null);assert.equal(state.snapshot.yard.placedGoodies.length,1);
 state.pendingActions=[intent({status:'failed'})];assert.equal(choose(state),null);
});
test('foreign account, review-required and malformed intents do not project; move requires an owned placement',()=>{
 const choose=select(),state={snapshot:snapshot(),pendingActions:[]};
 for(const row of [intent({accountId:'B'}),intent({requiresUserDecision:true}),intent({requiresCanonicalReview:true}),intent({action:'yard.buyGoodie'}),intent({payload:{...intent().payload,x:NaN}}),intent({action:'yard.moveGoodie'})]){state.pendingActions=[row];assert.equal(choose(state),null);}
 state.snapshot.yard.placedGoodies=[{...intent().payload,x:20,condition:'worn'}];state.pendingActions=[intent({action:'yard.moveGoodie',payload:{slotId:'free_test',x:50,y:55}})];const moved=choose(state);assert.equal(moved.goodieId,'yarn_mouse');assert.equal(moved.x,50);assert.equal(state.snapshot.yard.placedGoodies[0].x,20);
 state.pendingActions=[];assert.equal(choose(state),null);
});
test('existing canonical coordinates stay isolated and current geometry scope is required',()=>{
 const choose=select(),state={snapshot:snapshot(),pendingActions:[intent({payload:{...intent().payload,locationId:'canonical',locationVersion:1,geometryRevision:'g1'}})]};
 assert.equal(choose(state),null);assert.equal(choose(state,{canonical:true}).slotId,'free_test');state.pendingActions[0].payload.geometryRevision='old';assert.equal(choose(state,{canonical:true}),null);
 assert.ok(!courtyard.includes('canonical-saved-')&&!courtyard.includes('savedMode'),'minimal live component does not import unreleased saved-v3 modes');
});
