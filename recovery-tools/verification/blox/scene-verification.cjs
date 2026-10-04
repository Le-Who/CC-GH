const {pathToFileURL}=require('node:url');
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');const {test}=require('node:test');const {createPixiMock,loadClosure}=require('./pixi-mock.cjs');const root=process.env.CC_GH_SOURCE_ROOT||path.resolve(__dirname,'../../..'),preview=__dirname+'/fixtures/preview';const ast=require(root+'/recovery-tools/ast-recovery.cjs'),maps=JSON.parse(fs.readFileSync(__dirname+'/fixtures/blox-symbol-mapping.json'));const clean=x=>JSON.parse(JSON.stringify(x));
async function harness(kind,width,height,coarse=false){const env=createPixiMock({width,height,publicRoot:root+'/public',coarse}),engine=await import(pathToFileURL(root+'/game-logic/blox-engine.js').href),geometry=await import(pathToFileURL(root+'/src/game-runtime/sceneGeometry.js').href),pointer=await import(pathToFileURL(root+'/src/game-runtime/pointerSession.js').href);const art=loadClosure(root+'/src/games/blox/bloxArt.js',['BLOX_NINE_SLICE','bloxArtUrl','bloxTileAsset'],{assetUrl:x=>x},ast);const layout=loadClosure(root+'/src/games/blox/bloxComposition.js',['composeBlox'],{bloxLayoutDefaults:JSON.parse(fs.readFileSync(root+'/src/app/hud-layout/defaultLayouts/blox.json'))},ast);const interaction=loadClosure(root+'/src/games/blox/bloxInteraction.js',['bloxTrayPieceLayout'],{},ast);const runtimeNames=['spriteFit','centeredPieceOrigin','clear','strokedRect','label','AMBER','makeSparkles','MINT','makeRipple','CORAL','viewWidth','viewHeight','rect','publishCanvasAssetLayout','applyHudAssetRegion','makeInteractive','publishCanvasLayout','PANEL','setupStage','makeRafScheduler'];const runtime=loadClosure(root+'/src/game-runtime/scenes/shared/runtime.js',runtimeNames,{...env.ctx,...geometry},ast);const {createFeedbackTrack}=await import(pathToFileURL(root+'/src/game-runtime/scenes/feedbackTrack.js').href);const ctx={createFeedbackTrack,...env.ctx,...runtime,...art,...layout,...interaction,...geometry,...engine,...pointer,GRID:10,canPlaceBloxPiece:engine.canPlace};let code,name;if(kind==='source'){code=ast.extract(root+'/src/game-runtime/scenes/bloxScene.js',['createBloxFrame','buildBloxScene']);name='buildBloxScene'}else{code=ast.extract(preview+'/assets/bloxScene-skG69G5D.js',['zt','jt','Ci']);name='Ci';for(const [old,next]of Object.entries(maps.sceneGlobals))if(Object.hasOwn(ctx,next))ctx[old]=ctx[next]}
const build=vm.runInNewContext(code+';'+name,ctx);const log=[];const piece={id:'h3',cells:[[0,0],[0,1],[0,2]],color:'#60a5fa'};const composition=layout.composeBlox({width,height,safe:{}});const data={blox:{board:engine.createEmptyBoard(),tray:[{piece,placed:false},{piece,placed:false},{piece,placed:true}],gameActive:true,score:0,linesCleared:0},bloxComposition:composition,bloxHideStatusText:true,onBloxCell:(...args)=>log.push(['cell',...args]),onBloxTray:(...args)=>log.push(['tray',...args]),onBloxDrop:(...args)=>{log.push(['drop',...args]);return Promise.resolve({clear:{cleared:2,rows:[4],cols:[3]}})}};const scene=build(env.app,data);env.flush();return {env,scene,data,composition,log,targets:()=>env.app.stage.children[0].children.filter(n=>n.eventMode==='static')}}
test('Blox scene render and full-cell hit areas match preview at all required viewports',async()=>{for(const[width,height]of [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[375,812]]){const a=await harness('preview',width,height),b=await harness('source',width,height);assert.deepEqual(b.env.snapshot(),a.env.snapshot(),width+'x'+height);assert.equal(b.targets().length,103);for(const cell of b.targets().slice(0,100)){assert.ok(Math.abs(cell.hitArea.width*cell.scale.x-b.composition.board.cell)<1e-8);assert.ok(Math.abs(cell.hitArea.height*cell.scale.y-b.composition.board.cell)<1e-8)}a.scene.destroy();b.scene.destroy();a.env.flush();b.env.flush();assert.equal(b.env.window.listenerCount,0);assert.equal(b.env.document.listenerCount,0);assert.equal(b.env.tickers.size,0)}});
test('Blox pointer and static-board contract survives new feedback across cancel, pause, resize and teardown',async()=>{for(const operation of ['cell-tap','tray-tap','mouse-drop','touch-drop','cancel','blur','hidden','pause','resize','destroy']){const results=[];for(const kind of ['preview','source']){const h=await harness(kind,390,844,operation==='touch-drop'),{env,composition:c}=h;const slot=c.slots[0],start=env.event(slot.left+slot.width/2,slot.top+slot.height/2,{pointerType:operation==='touch-drop'?'touch':'mouse'});if(operation==='cell-tap'){const cell=h.targets()[43],ev=env.event(cell.x,cell.y);cell.emit('pointerdown',ev);env.app.stage.emit('pointerup',ev)}else{h.targets()[100].emit('pointerdown',start);env.flush();if(operation==='tray-tap')env.app.stage.emit('pointerup',start);else {const lift=operation==='touch-drop'?Math.max(52,Math.min(92,c.board.cell*2.15)):0;const end=env.event(c.board.left+4.5*c.board.cell,c.board.top+4.5*c.board.cell+lift,{pointerType:start.pointerType});env.app.stage.emit('globalpointermove',end);env.flush();if(operation.endsWith('drop'))env.app.stage.emit('pointerup',end);else if(operation==='cancel')env.app.stage.emit('pointercancel',end);else if(operation==='blur')env.window.emit('blur');else if(operation==='hidden'){env.document.visibilityState='hidden';env.document.emit('visibilitychange')}else if(operation==='pause')h.scene.update({...h.data,blox:{...h.data.blox,gameActive:false}});else if(operation==='resize')h.scene.resize(h.data);else if(operation==='destroy')h.scene.destroy()}}await Promise.resolve();env.flush();results.push(clean({log:h.log,snapshot:env.snapshot()}));if(operation!=='destroy')h.scene.destroy();env.flush();assert.equal(env.window.listenerCount,0);assert.equal(env.document.listenerCount,0);assert.equal(env.tickers.size,0)}assert.deepEqual(results[1].log,results[0].log,operation+' input contract');assert.deepEqual(results[1].snapshot.stage.children.slice(0,2),results[0].snapshot.stage.children.slice(0,2),operation+' board/drag contract');if(['cancel','blur','hidden','pause','resize'].includes(operation))assert.equal(results[1].snapshot.stage.children[2].children.length,0,operation+' clears cosmetic feedback');if(['cancel','blur','hidden','pause','resize','destroy'].includes(operation))assert.ok(results[1].log.every(x=>x[0]!=='drop'),operation+' must not place');if(operation.endsWith('drop'))assert.deepEqual(results[1].log,[['drop',0,4,3]],operation);if(operation==='cell-tap')assert.deepEqual(results[1].log,[['cell',4,3]]);if(operation==='tray-tap')assert.deepEqual(results[1].log,[['tray',0]])}});

module.exports={harness};

// Exercise actual successful placement and synchronous authoritative redraws,
// rather than fabricating clear rows on an otherwise empty board.
async function clearHarness(reduced=false){
  const h=await harness('source',390,844,reduced);
  const engine=await import(pathToFileURL(root+'/game-logic/blox-engine.js').href);
  const board=engine.createEmptyBoard();
  for(let col=0;col<10;col++)if(col<3||col>5)board[4][col]='#f97316';
  for(let row=0;row<10;row++)if(row!==4)board[row][3]='#a78bfa';
  Object.assign(h.data,{selectedBloxPiece:0,onBloxCell:(row,col)=>{
    const result=engine.previewBloxPlacement(h.data.blox,{pieceIdx:0,row,col});
    assert.equal(result.valid,true);
    h.data.blox={...result.state,gameActive:true};
    h.scene.update(h.data);
    return result;
  }});
  h.data.blox.board=board;h.scene.update(h.data);h.env.flush();
  h.tick=(ms=16)=>{for(const tick of h.env.tickers)tick({deltaMS:ms});h.env.flush();};
  h.tap=async(row=4,col=3)=>{const target=h.targets()[row*10+col],ev=h.env.event(target.x,target.y);target.emit('pointerdown',ev);h.env.app.stage.emit('pointerup',ev);await Promise.resolve();h.env.flush();};
  h.clearTiles=()=>h.env.app.stage.children[2].children.filter(n=>n.alpha===1 && n.kind==='Sprite');
  return h;
}
test('real crossing-line clear keeps exactly 19 original tile views at their cells, then anticipates, pops and dissolves',async()=>{
  const h=await clearHarness(),board=clean(h.data.blox.board),cell=h.composition.board.cell;
  await h.tap();
  const tiles=h.clearTiles();
  assert.equal(tiles.length,19,'row/column intersection is never doubled');
  assert.ok(tiles.every(n=>!n.texture.url.includes('energy')));
  for(const [color,count] of [['orange',7],['violet',9],['blue',3]])assert.equal(tiles.filter(n=>n.texture.url.endsWith('/'+color+'.webp')).length,count,'actual pre-clear colors survive the authoritative redraw');
  assert.equal(new Set(tiles.map(n=>`${n.x}:${n.y}`)).size,19);
  assert.equal(h.data.blox.linesCleared,2,'scoring commits immediately, not on animation completion');
  assert.equal(h.data.blox.score,33);
  assert.ok(h.data.blox.board[4].every(v=>v===null));
  const placed=tiles.find(n=>Math.abs(n.x-(h.composition.board.left+3.5*cell))<.001 && Math.abs(n.y-(h.composition.board.top+4.5*cell))<.001);
  const initial=placed.scale.x;
  h.tick(40);assert.ok(placed.scale.x<initial);assert.equal(placed.alpha,1,'anticipation retains tile opacity');
  h.tick(45);h.tick(40);assert.ok(placed.scale.x>initial);assert.equal(placed.alpha,1);
  h.tick(50);assert.ok(placed.alpha<1 && placed.alpha>0);
  for(let i=0;i<10;i++)h.tick(40);
  assert.ok(tiles.every(n=>n.destroyed));
  assert.equal(h.env.app.stage.children[2].children.length,0);
  assert.ok(board[0][3],'pre-placement board fixture contains the actual old colors');
  h.scene.destroy();
});
test('reduced-motion clear only fades, while interruption removes all clear views and listeners',async()=>{
  for(const mode of ['reduced','pause','resize','hidden','blur','destroy']){
    const h=await clearHarness(mode==='reduced');await h.tap();const tiles=h.clearTiles();
    assert.equal(tiles.length,19);
    if(mode==='reduced'){
      const scales=tiles.map(n=>n.scale.x);h.tick(40);
      assert.deepEqual(tiles.map(n=>n.scale.x),scales);
      assert.ok(tiles.every(n=>n.alpha>0 && n.alpha<1));
      h.tick(40);h.tick(40);assert.ok(tiles.every(n=>n.destroyed));
    }else if(mode==='pause')h.scene.update({...h.data,blox:{...h.data.blox,gameActive:false}});
    else if(mode==='resize')h.scene.resize(h.data);
    else if(mode==='hidden'){h.env.document.visibilityState='hidden';h.env.document.emit('visibilitychange');}
    else if(mode==='blur')h.env.window.emit('blur');
    else h.scene.destroy();
    assert.ok(tiles.every(n=>n.destroyed),mode);
    if(mode!=='destroy')h.scene.destroy();h.env.flush();
    assert.equal(h.env.tickers.size,0);assert.equal(h.env.window.listenerCount,0);assert.equal(h.env.document.listenerCount,0);
  }
});
test('a new placement in a clearing cell removes the stale tile without delaying input',async()=>{
  const h=await clearHarness();await h.tap();const old=h.clearTiles();
  const {left,top,cell}=h.composition.board;
  const replaced=old.filter(n=>Math.abs(n.y-(top+4.5*cell))<.001 && n.x>=left+3*cell && n.x<left+6*cell);
  h.data.blox.tray[0].placed=false;h.scene.update(h.data);await h.tap();
  assert.ok(replaced.every(n=>n.destroyed));
  assert.equal(h.data.blox.board[4][3],h.data.blox.tray[0].piece.color);
  assert.equal(h.data.blox.linesCleared,2);
  assert.ok(h.env.app.stage.children[2].children.length<=100+48,'effects are bounded across repeated input');
  h.scene.destroy();
});
test('delayed placement results cannot resurrect cell effects after pause',async()=>{
  const h=await clearHarness();let resolve;
  h.data.onBloxCell=()=>new Promise(done=>{resolve=done;});h.scene.update(h.data);
  await h.tap();h.scene.update({...h.data,blox:{...h.data.blox,gameActive:false}});
  resolve({clear:{cleared:1,rows:[4],cols:[]}});await Promise.resolve();h.env.flush();
  assert.equal(h.env.app.stage.children[2].children.length,0);h.scene.destroy();
});
test('clear feedback starts before the server promise settles and acknowledgement never replays it',async()=>{
  const h=await clearHarness();let resolve;
  const immediate=h.data.onBloxCell;
  h.data.onBloxCell=(...args)=>{const result=immediate(...args);return new Promise(done=>{resolve=()=>done(result);});};
  h.scene.update(h.data);await h.tap();const tiles=h.clearTiles();
  assert.equal(tiles.length,19,'local preview supplies feedback while the request is pending');
  for(let i=0;i<12;i++)h.tick(40);
  assert.ok(tiles.every(n=>n.destroyed));resolve();await new Promise(done=>setImmediate(done));h.env.flush();
  assert.equal(h.env.app.stage.children[2].children.length,0,'acknowledgement must not repeat the clear');h.scene.destroy();
});
test('rejected optimistic placement cancels clear views and shows only local rejection feedback',async()=>{
  const h=await clearHarness();let reject;
  h.data.onBloxCell=()=>new Promise(done=>{reject=done;});h.scene.update(h.data);
  await h.tap();const tiles=h.clearTiles();assert.equal(tiles.length,19);
  reject({error:'rejected'});await new Promise(done=>setImmediate(done));h.env.flush();
  assert.ok(tiles.every(n=>n.destroyed));
  assert.equal(h.env.app.stage.children[2].children.length,3);
  assert.ok(h.env.app.stage.children[2].children.every(n=>n.kind==='Graphics'));
  h.scene.destroy();
});
test('drag preview highlights the same 19 completed cells without a spanning beam',async()=>{
  const h=await clearHarness(),{board,slots}=h.composition,slot=slots[0];
  const start=h.env.event(slot.left+slot.width/2,slot.top+slot.height/2);
  h.targets()[100].emit('pointerdown',start);h.env.flush();
  h.env.app.stage.emit('globalpointermove',h.env.event(board.left+4.5*board.cell,board.top+4.5*board.cell));h.env.flush();
  const marks=h.env.app.stage.children[1].children.filter(n=>n.kind==='Graphics');
  assert.equal(marks.length,22,'19 completed cells plus three precise placement outlines');
  assert.equal(new Set(marks.map(n=>`${n.shape[1]}:${n.shape[2]}`)).size,22,'clear outlines and placement outlines have distinct insets');
  assert.ok(h.env.app.stage.children[1].children.every(n=>!n.texture?.url.includes('energy')));
  h.scene.destroy();
});
test('late rejection or transport failure clears only its own attempt, preserving a newer clear',async()=>{
  for(const failure of ['rejection','throw']){
    const h=await clearHarness();let rejectOld,throwOld;
    const successful=h.data.onBloxCell;
    h.data.onBloxCell=()=>new Promise((resolve,reject)=>{rejectOld=resolve;throwOld=reject;});
    h.scene.update(h.data);await h.tap();const old=h.clearTiles();assert.equal(old.length,19);
    h.data.onBloxCell=successful;h.scene.update(h.data);await h.tap();const newer=h.clearTiles();
    assert.equal(newer.length,19);assert.ok(old.every(n=>n.destroyed));
    if(failure==='rejection')rejectOld({error:'late rejection'});else throwOld(new Error('late transport failure'));
    await new Promise(done=>setImmediate(done));h.env.flush();
    assert.ok(newer.every(n=>!n.destroyed),failure+' must not erase another placement’s clear');
    h.tick(40);assert.ok(newer.every(n=>!n.destroyed),'newer animation continues normally');
    h.scene.destroy();
  }
});
test('a later invalid attempt leaves an existing successful clear intact',async()=>{
  const h=await clearHarness();await h.tap();const successful=h.clearTiles();assert.equal(successful.length,19);
  h.data.blox.board[1][3]='#f97316';h.data.blox.tray[0].placed=false;
  h.data.onBloxCell=()=>Promise.resolve({error:'invalid placement'});h.scene.update(h.data);
  await h.tap(1,3);await new Promise(done=>setImmediate(done));h.env.flush();
  assert.ok(successful.every(n=>!n.destroyed));h.scene.destroy();
});
test('older non-clearing placement rejection preserves a subsequent successful row clear',async()=>{
 const h=await harness('source',390,844); const engine=await import(pathToFileURL(root+'/game-logic/blox-engine.js').href);
 const b=engine.createEmptyBoard(); for(let c=0;c<10;c++)if(c<3||c>5)b[4][c]='#f97316';
 h.data.blox.board=b;h.data.selectedBloxPiece=0;let rejectOld;let call=0;
 h.data.onBloxCell=(row,col)=>{if(!call++)return new Promise(done=>rejectOld=done);const result=engine.previewBloxPlacement(h.data.blox,{pieceIdx:0,row,col});h.data.blox={...result.state,gameActive:true};h.scene.update(h.data);return result;};h.scene.update(h.data);h.env.flush();
 async function tap(r,c){const n=h.targets()[r*10+c],e=h.env.event(n.x,n.y);n.emit('pointerdown',e);h.env.app.stage.emit('pointerup',e);await Promise.resolve();h.env.flush();}
 await tap(1,3);await tap(4,3);
 const tiles=h.env.app.stage.children[2].children.filter(n=>n.kind==='Sprite'&&n.alpha===1);assert.equal(tiles.length,10);
 rejectOld({error:'older request rejected'});await new Promise(setImmediate);h.env.flush();
 const alive=tiles.filter(n=>!n.destroyed).length;h.scene.destroy();assert.equal(alive,10,'newer clear must survive unrelated older rejection');
});
