import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export async function qualityFixture(root) {
  const load=rel=>import(pathToFileURL(path.join(root,rel)));
  const {fixtureSnapshot}=await load('qa/yard-normal-preview/preview-fixture.mjs');
  const {CANONICAL_LOCATION,CANONICAL_ITEM,canonicalItemCapabilities,canonicalStorageValid}=await load('game-logic/yard-v2/canonical-locations.mjs');
  const {canonicalCapability}=await load('src/game-state/canonicalYardProtocol.mjs');
  const s=structuredClone(fixtureSnapshot);
  const rows=[[98,118],[72,145]].map(([x,y],i)=>({...CANONICAL_LOCATION,goodieId:'leaf_pot',itemGeometryRevision:CANONICAL_ITEM.itemGeometryRevision,slotId:'canonical:quality-'+(i+1),x,y,condition:'new',uses:0,placedAt:1000000}));
  assert(canonicalStorageValid(rows));s.yard.placedGoodies=[];s.yard.goodieInventory={leaf_pot:0};
  s.yardRuntime={...s.yardRuntime,version:1,status:'ready',mutable:true,actionProtocol:'yard-v2:',
    canonicalPlacements:rows,itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:true})};
  assert(canonicalCapability(s));return s;
}
