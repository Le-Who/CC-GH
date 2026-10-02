import './yard-inventory-only-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
const {createDefaultPlayer}=await import('../game-logic.js');
const {buildSnapshot}=await import('../routes/player.js');
const {applyMigrations}=await import('../playerManager.js');
const {compileMergeLabCatalog,createMergeLabState,createMergeLabQuote,createMergeLabAction,applyMergeLabAction}=await import('../game-logic/merge-lab-domain.js');
const {MERGE_LAB_CATALOG:catalog}=await import('../game-logic/merge-lab-catalog.js');
// Deliberately exercises the exact domain grant as a test-only enabled operation.
// Release service quote/mutation gates stay disabled for these projects until Yard supports them.
for(const projectId of['living_arbor','echo_chimes'])test(`exact Merge v3 ${projectId} grant → real snapshot → load → receipt replay retains counts`,()=>{
 const now=Date.now(),p=createDefaultPlayer(`grant-${projectId}`,'Grant preservation',now);
 p.yard.goodieInventory.alchemy_living_arbor=1201;p.yard.goodieInventory.alchemy_echo_chimes=2402;
 p.merge=createMergeLabState(catalog,{now});p.merge.knowledge.itemIds=catalog.items.map(item=>item.id);
 const project=compileMergeLabCatalog(catalog).projects.get(projectId),quantity=2;assert.ok(project);
 p.merge.stock=Object.fromEntries(Object.entries(project.input).map(([id,n])=>[id,n*quantity]));p.merge.alchemyEssence=100000;
 const payload={projectId,quantity};const quote=createMergeLabQuote(p,'craftProject',payload,catalog,{now});
 const action=createMergeLabAction(p,'craftProject',{...payload,quote},catalog,{actionId:`preserved-${projectId}`});
 const outcome=applyMergeLabAction(p,action,catalog,{now});assert.equal(outcome.ok,true,JSON.stringify(outcome.error));
 assert.equal(outcome.result.placementRequired,true);assert.equal(outcome.result.visitorGranted,false);
 const earned=outcome.player.yard.goodieInventory[project.output.itemId];assert.equal(earned,p.yard.goodieInventory[project.output.itemId]+quantity);
 const savedReceipts=structuredClone(outcome.player.merge.actionLedger),savedCrafts=structuredClone(outcome.player.merge.projects.crafted);
 const snapshot=buildSnapshot(outcome.player);assert.equal(snapshot.yard.goodieInventory[project.output.itemId],earned);
 assert.equal(snapshot.inventory.yardGoodies[project.output.itemId],earned);
 const loaded=applyMigrations(JSON.parse(JSON.stringify(outcome.player)));assert.equal(buildSnapshot(loaded).yard.goodieInventory[project.output.itemId],earned);
 const replay=applyMergeLabAction(loaded,action,catalog,{now:now+1});assert.equal(replay.ok,true,JSON.stringify(replay.error));assert.equal(replay.replayed,true);
 assert.equal(replay.player.yard.goodieInventory[project.output.itemId],earned);
 assert.deepEqual(replay.player.merge.actionLedger,savedReceipts);assert.deepEqual(replay.player.merge.projects.crafted,savedCrafts);
 assert.equal(replay.player.yard.activeVisitors.length,0);assert.equal(replay.player.yard.placedGoodies.length,0);
});
