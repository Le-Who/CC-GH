import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {createDefaultPlayer}=await import('../game-logic.js');
const {applyActionWithReceipt}=await import('../routes/player.js');

const walletOf=p=>({gold:p.resources.gold,gachaTokens:p.resources.gachaTokens});

// Route-domain regression only: no browser, socket, database, or genuine score-earning claim.
for (const game of ['blox', 'match3', 'bubbo']) {
  test(`${game}: identical reward command replays once after persisted reload`, async () => {
    let player=createDefaultPlayer(`once-${game}`, 'Audit', Date.now());
    const run=(action,payload,id)=>applyActionWithReceipt(player,action,payload,{clientActionId:`audit-${id}`});
    assert.equal((await run(`${game}.start`,{},`${game}-start`)).status,200);
    const payload={score:3500,fromQuit:true};
    assert.equal((await run(`${game}.end`,payload,`${game}-end`)).status,200);
    const wallet=walletOf(player);
    player=JSON.parse(JSON.stringify(player));
    const replay=await run(`${game}.end`,payload,`${game}-end`);
    assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);
    assert.deepEqual(walletOf(player),wallet);
  });
  test(`${game}: completed run cannot reward again under a new command ID`, async () => {
    let player=createDefaultPlayer(`new-id-${game}`, 'Audit', Date.now());
    const run=(action,payload,id)=>applyActionWithReceipt(player,action,payload,{clientActionId:`audit-${id}`});
    assert.equal((await run(`${game}.start`,{},`${game}-start`)).status,200);
    const payload={score:3500,fromQuit:true};
    assert.equal((await run(`${game}.end`,payload,`${game}-end`)).status,200);
    const wallet=walletOf(player);
    player=JSON.parse(JSON.stringify(player));
    await run(`${game}.end`,payload,`${game}-new-id`);
    assert.deepEqual(walletOf(player),wallet,'A finished run must not grant a second wallet reward');
  });
}

for (const game of ['blox', 'match3', 'bubbo']) {
  test(`${game}: zero-score end settles once and a new started session can settle`,async()=>{
    const p=createDefaultPlayer(`zero-${game}`,'Audit',Date.now());
    const run=(action,payload,id)=>applyActionWithReceipt(p,action,payload,{clientActionId:`audit-${id}`});
    assert.equal((await run(`${game}.end`,{score:0,fromQuit:true},'orphan')).status,403);
    await run(`${game}.start`,{},'start');
    assert.equal((await run(`${game}.end`,{score:0,fromQuit:true},'zero')).status,200);
    const wallet=walletOf(p);
    assert.equal((await run(`${game}.end`,{score:0,fromQuit:true},'zero-again')).status,403);
    assert.deepEqual(walletOf(p),wallet);
    await run(`${game}.start`,{},'next-start');
    assert.equal((await run(`${game}.end`,{score:3500,fromQuit:true},'next-end')).status,200);
    assert.equal(p.resources.gachaTokens,wallet.gachaTokens+4);
  });
  test(`${game}: late fresh-ID save cannot reopen a completed run after reload`,async()=>{
    let p=createDefaultPlayer(`late-${game}`,'Audit',Date.now());
    const run=(action,payload,id)=>applyActionWithReceipt(p,action,payload,{clientActionId:`audit-${id}`});
    await run(`${game}.start`,{},'start');
    const sync=game==='blox'?'blox.sync':game==='match3'?'match3.syncMode':'bubbo.sync';
    const payload=game==='blox'?{savedState:JSON.parse(p.blox.savedState)}:{game:structuredClone(p[game].currentGame)};
    assert.equal((await run(sync,payload,'save')).status,200);
    await run(`${game}.end`,{score:3500,fromQuit:true},'finish');
    const wallet=walletOf(p);p=JSON.parse(JSON.stringify(p));
    const sameSave=await run(sync,payload,'save');assert.equal(sameSave.body.duplicate,true);
    assert.equal((await run(sync,payload,'late-save')).status,403);
    assert.equal((await run(`${game}.end`,{score:3500,fromQuit:true},'late-finish')).status,403);
    assert.deepEqual(walletOf(p),wallet);
    assert.equal(game==='blox'?p.blox.activeGame:!!p[game].currentGame,false);
  });
}

const {default:match3Routes}=await import('../routes/match3.js');
const {withPlayerLock}=await import('../playerManager.js');
for(const path of ['/api/game/end','/api/game/sync-modes'])test(`legacy ${path} cannot bypass inactive-session fence`,async()=>{
  const id=`legacy-fence-${path}`;
  await withPlayerLock(id,async p=>{p.match3.currentGame=null;});
  const router=match3Routes((_req,_res,next)=>next(),()=>({userId:id,username:'Audit'}));
  const route=router.stack.find(row=>row.path===path);
  let status=200,body;
  const res={status(value){status=value;return this;},json(value){body=value;return this;}};
  await route.handlers.at(-1)({body:{score:3500,fromQuit:true,game:{score:3500,movesLeft:0}}},res);
  assert.equal(status,403);assert.equal(body.error,'Invalid session');
});

const {default:bloxRoutes}=await import('../routes/blox.js');
function terminalBloxFixture(){
 const board=Array.from({length:10},(_,r)=>Array.from({length:10},(_,c)=>r===c?null:'#60a5fa'));board[0][1]=null;
 return {board,tray:[{piece:{id:'single',cells:[[0,0]],color:'#60a5fa'},placed:false},{piece:{id:'h3',cells:[[0,0],[0,1],[0,2]],color:'#60a5fa'},placed:false}],score:3500,gameActive:true,rotateCharges:3};
}
test('legacy Blox late sync cannot enable a second natural-end reward; stale active savedState cannot authorize place or rotate',async()=>{
 const id='arcade-regression-legacy-blox';let before;
 await withPlayerLock(id,async p=>{await applyActionWithReceipt(p,'blox.start');await applyActionWithReceipt(p,'blox.end',{score:3500});before=walletOf(p);});
 const router=bloxRoutes((_q,_s,next)=>next(),()=>({userId:id,username:'Audit'}));let status=200;
 const res={status(value){status=value;return this;},json(){return this;}};
 await router.stack.find(row=>row.path==='/api/blox/sync').handlers.at(-1)({body:{savedState:terminalBloxFixture()}},res);assert.equal(status,403);
 await withPlayerLock(id,async p=>{
  assert.equal(p.blox.activeGame,false);assert.equal(p.blox.savedState,null);
  // Represents old persisted stale input: neither endpoint may trust its active flag.
  p.blox.savedState=JSON.stringify(terminalBloxFixture());
  assert.equal((await applyActionWithReceipt(p,'blox.rotate',{pieceIdx:0})).status,403);
  assert.equal((await applyActionWithReceipt(p,'blox.place',{pieceIdx:0,row:0,col:1})).status,403);
  assert.deepEqual(walletOf(p),before);
 });
});
test('valid Blox natural gameover still grants once, closes its session, and rejects subsequent placement',async()=>{
 const p=createDefaultPlayer('arcade-regression-natural-blox','Audit',Date.now());
 await applyActionWithReceipt(p,'blox.start');await applyActionWithReceipt(p,'blox.sync',{savedState:terminalBloxFixture()});
 const before=walletOf(p),payload={pieceIdx:0,row:0,col:1},meta={clientActionId:'natural-gameover-placement'};
 const placed=await applyActionWithReceipt(p,'blox.place',payload,meta);assert.equal(placed.status,200);assert.equal(placed.body.savedState.gameActive,false);assert.equal(p.blox.activeGame,false);
 assert.equal(p.resources.gachaTokens,before.gachaTokens+4);assert.ok(p.resources.gold>before.gold);const once=walletOf(p);
 assert.equal((await applyActionWithReceipt(p,'blox.place',payload,meta)).body.duplicate,true);
 assert.equal((await applyActionWithReceipt(p,'blox.place',payload,{clientActionId:'natural-gameover-new-id'})).status,403);assert.deepEqual(walletOf(p),once);
});
test('legacy Blox active sync, quit and fresh session remain valid',async()=>{
 const id='arcade-regression-active-legacy-blox',router=bloxRoutes((_q,_s,next)=>next(),()=>({userId:id,username:'Audit'}));
 async function call(path,body){let status=200,result;const res={status(value){status=value;return this;},json(value){result=value;return this;}};await router.stack.find(row=>row.path===path).handlers.at(-1)({body},res);return {status,result};}
 assert.equal((await call('/api/blox/start',{})).status,200);assert.equal((await call('/api/blox/sync',{savedState:terminalBloxFixture()})).status,200);
 const first=await call('/api/blox/end',{score:3500});assert.equal(first.status,200);assert.equal(first.result.tokenReward,4);
 assert.equal((await call('/api/blox/end',{score:3500})).status,403);assert.equal((await call('/api/blox/start',{})).status,200);assert.equal((await call('/api/blox/end',{score:0})).status,200);
});
