import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as geometry from '../src/game-runtime/sceneGeometry.js';
import * as pointer from '../src/game-runtime/pointerSession.js';
import * as engine from '../src/game-core/match3/engine.js';
import * as animation from '../src/game-core/match3/animation.js';
const require=createRequire(import.meta.url),ast=require('../recovery-tools/ast-recovery.cjs'),{createPixiMock,loadClosure}=require('./fixtures/pixi-mock.cjs');
const root=fileURLToPath(new URL('../',import.meta.url));
const maps=JSON.parse(fs.readFileSync(root+'evidence/match3-symbol-mapping.json'));
const clean=x=>JSON.parse(JSON.stringify(x));
function harness(original,width,height){
 const env=createPixiMock({width,height,publicRoot:root+'public'});
 const art=loadClosure(root+'src/games/match3/match3Art.js',['MATCH3_NINE_SLICE','MATCH3_GEM_ART','match3ArtUrl'],{assetUrl:x=>x},ast);
 const layout=loadClosure(root+'src/games/match3/match3Composition.js',['composeMatch3'],{match3LayoutDefaults:JSON.parse(fs.readFileSync(root+'src/app/hud-layout/defaultLayouts/match3.json'))},ast);
 const source=fs.readFileSync(root+'src/game-runtime/scenes/match3Scene.js','utf8');
 const imports=ast.acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='ImportDeclaration');
 const runtimeNames=imports.find(n=>n.source.value==='./shared/runtime.js').specifiers.map(n=>n.imported.name);
 const runtime=loadClosure(root+'src/game-runtime/scenes/shared/runtime.js',runtimeNames,{...env.ctx,...geometry,...pointer,...engine,...animation,resolveAssetUrl:x=>x},ast);
 const ctx={...env.ctx,...runtime,...art,...layout};let code,name;
 if(original){code=fs.readFileSync(root+'tests/fixtures/match3-v2-scene-reference.txt','utf8');name='Us';for(const[old,next]of Object.entries(maps.sceneGlobals))if(next in ctx)ctx[old]=ctx[next]}
 else {code=ast.extract(root+'src/game-runtime/scenes/match3Scene.js',['match3GemAsset','createMatch3BoardFrame','buildMatch3Scene']);name='buildMatch3Scene'}
 const build=vm.runInNewContext(code+';'+name,ctx),log=[];
 const composition=layout.composeMatch3({width,height,safe:{}});
 const board=Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>['fire','water','earth','air','light','dark'][(x+y*2)%6]));
 const data={match3:{board,gameActive:true,inputLocked:false,score:0,movesLeft:30,combo:0},match3Composition:composition,onMatch3Cell:(...args)=>log.push(['cell',...args]),onMatch3Swap:(...args)=>log.push(['swap',...args])};
 const scene=build(env.app,data);env.flush();return{env,scene,data,composition,log,targets:()=>env.app.stage.children[0].children.filter(n=>n.eventMode==='static')};
}
test('Match3 scene and all 64 full-cell hit targets match frozen preview in 10 required/extended viewports',()=>{
 for(const[w,h]of[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]]){
  const pair=[harness(true,w,h),harness(false,w,h)];assert.deepEqual(pair[1].env.snapshot(),pair[0].env.snapshot());
  assert.equal(pair[1].targets().length,64);for(const target of pair[1].targets()){assert.equal(target.hitArea.width,pair[1].composition.board.cell);assert.equal(target.hitArea.height,pair[1].composition.board.cell)}
  for(const x of pair){x.scene.destroy();x.env.flush();assert.equal(x.env.tickers.size,0);assert.equal(x.env.window.listenerCount,0);assert.equal(x.env.document.listenerCount,0)}
 }
});
test('Match3 tap, long swipe, cancellation, blur, hidden, pause, resize and teardown match preview',()=>{
 for(const operation of['tap','swipe','cancel','blur','hidden','pause','resize','destroy']){
  const result=[];for(const original of[true,false]){
   const h=harness(original,390,844),{env,composition:{board}}=h;
   const start=env.event(board.left+3.5*board.cell,board.top+4.5*board.cell);
   h.targets()[35].emit('pointerdown',start);
   if(operation==='tap')env.app.stage.emit('pointerup',start);
   else {const end=env.event(start.global.x+board.cell*2.35,start.global.y);env.app.stage.emit('globalpointermove',end);env.flush();
    if(operation==='swipe')env.app.stage.emit('pointerup',end);
    else if(operation==='cancel')env.app.stage.emit('pointercancel',end);
    else if(operation==='blur')env.window.emit('blur');
    else if(operation==='hidden'){env.document.visibilityState='hidden';env.document.emit('visibilitychange')}
    else if(operation==='pause')h.scene.update({...h.data,match3:{...h.data.match3,gameActive:false}});
    else if(operation==='resize')h.scene.resize(h.data);
    else h.scene.destroy();
   }
   env.flush();result.push(clean({log:h.log,snapshot:env.snapshot()}));if(operation!=='destroy')h.scene.destroy();env.flush();assert.equal(env.tickers.size,0);assert.equal(env.window.listenerCount,0);assert.equal(env.document.listenerCount,0);
  }
  assert.deepEqual(result[1],result[0],operation);
  if(operation==='tap')assert.deepEqual(result[1].log,[['cell',3,4]]);
  else if(operation==='swipe')assert.deepEqual(result[1].log,[['swap',{x:3,y:4},{x:4,y:4}]]);
  else assert.deepEqual(result[1].log,[],operation+' cannot commit a swap');
 }
});

test('Match3 cascade, special-chain, drop and invalid feedback retain semantic effect assets and timing',()=>{
 const board=Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>['fire','water','earth','air','light','dark'][(x*2+y*3+y%2)%6]));
 board[0][0]='special_row';board[0][3]='special_column';board[5][0]='drop_gold';
 const from={x:0,y:0},to={x:1,y:0},result=engine.attemptMatch3Move(board,from,to,{collectDrops:true});
 assert.equal(result.valid,true);const swap=board.map(row=>[...row]);[swap[0][0],swap[0][1]]=[swap[0][1],swap[0][0]];
 for(const type of['cascade','invalid']){
  const pair=[harness(true,390,844),harness(false,390,844)];
  for(const h of pair){
   h.scene.update({...h.data,match3:{...h.data.match3,board:result.board,inputLocked:true},match3Animation:{id:type+'-1',type,from,to,fromGem:board[0][0],toGem:board[0][1],startBoard:board,swapBoard:swap,steps:type==='cascade'?result.steps:[]}});h.env.flush();
  }
  assert.deepEqual(pair[1].env.snapshot(),pair[0].env.snapshot(),type+' initial feedback');
  if(type==='cascade'){
   const effects=pair[1].env.app.stage.children[2].children;
   assert.ok(effects.some(node=>node.texture?.url==='match3.fx.clearBurst'),'clear effects resolve the semantic clear-burst key');
   assert.ok(effects.every(node=>!node.texture||typeof node.texture.url==='string'&&node.texture.url.length>0),'effect textures are never undefined');
  }
  for(let frame=0;frame<60;frame++)for(const h of pair){for(const tick of h.env.tickers)tick({deltaTime:1});h.env.flush()}
  assert.deepEqual(pair[1].env.snapshot(),pair[0].env.snapshot(),type+' animation tail');
  for(const h of pair){h.scene.destroy();h.env.flush();assert.equal(h.env.tickers.size,0)}
 }
});
