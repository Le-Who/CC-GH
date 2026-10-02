import './merge-lab-route-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
const {createDefaultPlayer}=await import('../game-logic.js');
const {withPlayerLock,applyMigrations}=await import('../playerManager.js');
const {buildSnapshot,applyActionWithReceipt}=await import('../routes/player.js');
const {default:mergeRoutes}=await import('../routes/mergeRoutes.js');
const {ensureMergeLabState}=await import('../game-logic/merge-lab-service.js');
const {createMergeLabAction,createMergeLabQuote}=await import('../game-logic/merge-lab-domain.js');
const {MERGE_LAB_CATALOG:catalog}=await import('../game-logic/merge-lab-catalog.js');
const now=Date.now();
function player(id){const p=createDefaultPlayer(id,id,now);p.merge.board=JSON.stringify(Array.from({length:7},(_,r)=>Array.from({length:9},(_,c)=>({id:'seed',instanceId:`cell-${r}-${c}`}))));p.yard.goodieInventory.alchemy_echo_chimes=1402;p.yard.goodieInventory.alchemy_living_arbor=1201;ensureMergeLabState(p,{now});return p;}
function make(p,type,payload,id='command',quote=false){const params=quote?{...payload,quote:createMergeLabQuote(p,type,payload,catalog,{now})}:payload;return {command:createMergeLabAction(p,type,params,catalog,{actionId:id}),expectedMergeEpoch:p.merge.serverEpoch};}
async function call(router,path,body,userId){let status=200,response;const res={status:s=>{status=s;return res;},json:b=>{response=b;return b;}};const route=router.stack.find(item=>item.method==='post'&&item.path===path);assert.ok(route);await route.handlers.at(-1)({body,userId},res,error=>{throw error;});return {status,body:response};}

test('actual default clean-start snapshot archives 63-cell board, starts empty and preserves both pending Yard grants',()=>{const p=player('snapshot'),rawBoard=p.merge.board;const snap=buildSnapshot(p);assert.deepEqual(p.merge.stock,{});assert.equal(p.merge.migration.archive.merge.board,rawBoard);assert.equal(p.merge.board,rawBoard);assert.deepEqual(snap.merge.itemCounts,{});assert.deepEqual(snap.inventory.mergeItems,{});assert.equal(snap.yard.goodieInventory.alchemy_echo_chimes,1402);assert.equal(snap.yard.goodieInventory.alchemy_living_arbor,1201);assert.equal(snap.merge.actionLedger,undefined);const saved=JSON.parse(JSON.stringify(p));applyMigrations(saved);assert.deepEqual(buildSnapshot(saved).merge.stock,{});assert.equal(saved.merge.board,rawBoard);});
test('actual generic route bypasses old TTL receipts and trusts V3 epoch+ledger on lost reply',async()=>{const p=player('generic'),payload=make(p,'claimFreeCharges',{},'replay');const first=await applyActionWithReceipt(p,'merge.lab',payload,{clientActionId:'outer-id-old',serverNow:now});assert.equal(first.status,200);assert.equal(first.body.mergeLab.ok,true);assert.equal(p.merge.mergeRevision,1);const repeat=await applyActionWithReceipt(p,'merge.lab',payload,{clientActionId:'new-outer-id',serverNow:now+999999999});assert.equal(repeat.body.mergeLab.replayed,true);assert.equal(p.merge.mergeRevision,1);assert.equal(p._actionReceipts?.items?.length||0,0);});
test('all actual legacy routes and generic mutations reject a converted frozen board',async()=>{const id='legacy-routes';await withPlayerLock(id,p=>{Object.assign(p,player(id));});const router=mergeRoutes(()=>{},req=>({userId:req.userId}));const routes=router.stack.filter(r=>r.method==='post'&&r.path!=='/api/merge/lab/quote');assert.ok(routes.length>=5);for(const route of routes){const res=await call(router,route.path,{},id);assert.equal(res.status,410,route.path);assert.equal(res.body.code,'LEGACY_MERGE_RETIRED');}const p=player('legacy-generic');for(const action of ['merge.tap','merge.merge','merge.exchange','merge.freePull','merge.trash','merge.claimFreeTaps'])assert.equal((await applyActionWithReceipt(p,action,{},{})).status,410);});
test('actual authenticated quote path gates future project and prices supported starter kit',async()=>{const id='quote-route';await withPlayerLock(id,p=>{Object.assign(p,player(id));});const router=mergeRoutes(()=>{},req=>({userId:req.userId}));let epoch;await withPlayerLock(id,p=>{epoch=p.merge.serverEpoch;});const blocked=await call(router,'/api/merge/lab/quote',{type:'craftProject',parameters:{projectId:'echo_chimes',quantity:1},expectedMergeEpoch:epoch},id);assert.equal(blocked.status,409);assert.equal(blocked.body.code,'YARD_UPDATE_REQUIRED');const q=await call(router,'/api/merge/lab/quote',{type:'claimStarterKit',parameters:{},expectedMergeEpoch:epoch},id);assert.equal(q.status,200);assert.equal(q.body.quote.serverEpoch,epoch);assert.deepEqual(q.body.quote.terms.stockGrant,catalog.starterKit);const denied=await call(router,'/api/merge/lab/quote',{},null);assert.equal(denied.status,400);});
test('actual withPlayerLock memory serialization permits one debit for concurrent identical commands',async()=>{const id='concurrent';let request;await withPlayerLock(id,p=>{Object.assign(p,player(id));request=make(p,'claimStarterKit',{},'parallel',true);});const outputs=await Promise.all(Array.from({length:8},()=>withPlayerLock(id,p=>applyActionWithReceipt(p,'merge.lab',request,{serverNow:now}))));assert.equal(outputs.filter(r=>r.body.mergeLab.replayed===false).length,1);assert.equal(outputs.filter(r=>r.body.mergeLab.replayed===true).length,7);await withPlayerLock(id,p=>assert.equal(p.merge.mergeRevision,1));});
test('actual OCC retry callback reloads a competing commit and returns the same receipt once (synthetic SQL boundary)',async()=>{
 const id='fake-occ',initial=player(id);initial._version='v0';const request=make(initial,'claimStarterKit',{},'same-command',true);let row=structuredClone(initial),selects=0,updates=0,collided=false;
 globalThis.__mergeTestDb=async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.includes('INSERT INTO players'))return [];
  if(sql.includes('SELECT data')){selects++;return[{data:structuredClone(row)}];}
  if(sql.includes('UPDATE players')){
   updates++;
   if(!collided){collided=true;const remote=structuredClone(row);const outcome=await applyActionWithReceipt(remote,'merge.lab',request,{serverNow:now});assert.equal(outcome.body.mergeLab.ok,true);remote._version='remote-committed';row=remote;return[];}
   assert.equal(values[2],row._version);row=structuredClone(values[0]);return[{id}];
  }
  throw Error(`Unexpected synthetic SQL: ${sql}`);
 };
 try{const result=await withPlayerLock(id,p=>applyActionWithReceipt(p,'merge.lab',request,{serverNow:now}));assert.equal(result.body.mergeLab.replayed,true);assert.equal(selects,2);assert.equal(updates,2);assert.equal(row.merge.mergeRevision,1);assert.equal(row.merge.actionLedger.length,1);assert.equal(row.merge.stock.seed||0,catalog.starterKit.seed||0);}
 finally{delete globalThis.__mergeTestDb;}
});
