import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {initializeReleasedPlayerYard,releasedYardSnapshot} from '../game-logic/yard-v2/player-release.mjs';
import {publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {isCanonicalYardEntryAllowed,isPipPreviewAllowed,isCanonicalFoodPreviewAllowed,pipPreviewGroundingRecipe,PIP_GROUNDING_PREVIEW_RECIPE} from '../src/games/companion-yard-v2/pip-preview-gate.mjs';

const now=Date.UTC(2026,9,7),player=createDefaultPlayer('entry-owner','Owner',now);
assert.equal(initializeReleasedPlayerYard(player,{now}).status,200);
const snapshot={player:{id:player.id},...releasedYardSnapshot(player,{now})};
test('internal entry requires a true build flag, authenticated current capability and ready media',()=>{
 const before=structuredClone(snapshot);
 assert.equal(isCanonicalYardEntryAllowed({enabled:true,snapshot,mediaReady:true}),true);
 for(const enabled of[false,undefined,'true',1])assert.equal(isCanonicalYardEntryAllowed({enabled,snapshot,mediaReady:true}),false);
 for(const mediaReady of[false,undefined,'true'])assert.equal(isCanonicalYardEntryAllowed({enabled:true,snapshot,mediaReady}),false);
 for(const mutate of[s=>delete s.player,s=>s.player.id='',s=>s.yardRuntime.mutable=false,s=>s.yardRuntime.error='UNSUPPORTED_YARD_STORAGE_VERSION',s=>s.yardRuntime.version=99,s=>s.yardRuntime.itemPlacementCapabilities.enabled=false,s=>s.yardRuntime.canonicalPlacements=null,s=>s.yardRuntime.canonicalPlacements=[{slotId:'canonical:unknown',goodieId:'leaf_pot'}]]){
  const value=structuredClone(snapshot);mutate(value);assert.equal(isCanonicalYardEntryAllowed({enabled:true,snapshot:value,mediaReady:true}),false);
 }
 const closed={...snapshot,yardRuntime:publicPersistentYard(player,{now})};
 assert.equal(isCanonicalYardEntryAllowed({enabled:true,snapshot:closed,mediaReady:true}),false);
 assert.deepEqual(snapshot,before);
});
test('the existing explicit URL visual settings remain independent and build-gated',()=>{
 assert.equal(isPipPreviewAllowed({enabled:true,search:''}),false);
 assert.equal(isCanonicalFoodPreviewAllowed({enabled:true,search:''}),false);
 assert.equal(pipPreviewGroundingRecipe({enabled:true,search:''}),'baseline');
 const search='?yardPipPreview=1&yardCanonicalFood=1&yardPipGrounding='+PIP_GROUNDING_PREVIEW_RECIPE;
 assert.equal(isPipPreviewAllowed({enabled:true,search}),true);
 assert.equal(isCanonicalFoodPreviewAllowed({enabled:true,search}),true);
 assert.equal(pipPreviewGroundingRecipe({enabled:true,search}),PIP_GROUNDING_PREVIEW_RECIPE);
 assert.equal(isPipPreviewAllowed({enabled:false,search}),false);
 assert.equal(isCanonicalFoodPreviewAllowed({enabled:false,search}),false);
 assert.equal(pipPreviewGroundingRecipe({enabled:false,search}),'baseline');
});
