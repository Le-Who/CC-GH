const {pathToFileURL}=require('node:url');
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('node:assert/strict');
const {test}=require('node:test');
const {readLosslessWebpMetadata}=require('../webp-metadata.cjs');
const root=process.env.CC_GH_SOURCE_ROOT||path.resolve(__dirname,'../../..');
const base=__dirname+'/fixtures/baseline';
const baselineHashes=JSON.parse(fs.readFileSync(__dirname+'/fixtures/baseline-hashes.json'));
const assetReference=JSON.parse(fs.readFileSync(__dirname+'/fixtures/asset-integrity.json'));
const preview=__dirname+'/fixtures/preview';
const {acorn,extract,rename,expandStatements}=require(root+'/recovery-tools/ast-recovery.cjs');
const maps=JSON.parse(fs.readFileSync(__dirname+'/fixtures/blox-symbol-mapping.json'));
const host=preview+'/assets/host-CwP89_oZ.js',scene=preview+'/assets/bloxScene-skG69G5D.js';
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const clean=x=>JSON.parse(JSON.stringify(x));
function closure(file,names,ctx={}){
 const src=read(file),ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'}),decls=new Map();
 for(const original of ast.body){const n=original.declaration||original;if(n.type==='VariableDeclaration')for(const d of n.declarations)decls.set(d.id.name,{pos:d.start,src:`${n.kind} ${src.slice(d.start,d.end)};`});else if(n.id?.name)decls.set(n.id.name,{pos:n.start,src:src.slice(n.start,n.end)});}
 const needed=new Set();function need(n){if(needed.has(n)||Object.hasOwn(ctx,n))return;const d=decls.get(n);if(!d)throw Error('Missing closure declaration '+n);needed.add(n);rename(d.src);for(const dep of rename.lastFree)if(decls.has(dep))need(dep)}names.forEach(need);
 const code=[...needed].map(n=>decls.get(n)).sort((a,b)=>a.pos-b.pos).map(d=>d.src).join('\n');
 return vm.runInNewContext(code+';({'+names.join(',')+'})',ctx);
}
function normalizedAst(src){return JSON.parse(JSON.stringify(acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'}),(k,v)=>['start','end','raw'].includes(k)?undefined:v));}
function sourceDecl(file){const src=read(file),ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'});return ast.body.filter(n=>!n.type.startsWith('Import')&&!n.type.startsWith('Export')).map(n=>src.slice(n.start,n.end)).join('\n');}
function sha(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
function findAstNodes(node,predicate){
 const found=[];function visit(value){if(!value||typeof value!=='object')return;if(predicate(value))found.push(value);for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else if(child&&typeof child==='object')visit(child)}visit(node);return found;
}
// The owned preview remains the gameplay oracle. Amend only the navigation
// shell object with its exact acknowledged-leave adapter and one memo dependency.
function expectedHomeShellAst(expected){
 const shells=findAstNodes(expected,node=>node.type==='VariableDeclarator'&&node.id?.name==='shellControls');
 assert.equal(shells.length,1,'exactly one shell adapter');
 const memo=shells[0].init,properties=memo.arguments[0].body.properties;
 assert.deepEqual(properties.map(property=>property.key.name),['activeRun','pauseRun','hudState'],'immutable preview shell shape');
 const adapter=normalizedAst("({safeLeave:async()=>{if(!state.gameActive)return true;const result=await performAction('blox.end',{score:state.score});return result?.success === true && !result.error;}})").body[0].expression.properties[0];
 properties.splice(2,0,adapter);
 assert.equal(memo.arguments[1].elements[1].name,'pauseRun');
 memo.arguments[1].elements.splice(2,0,{type:'Identifier',name:'performAction'});
 return expected;
}
// The selected-cell callback now exposes the exact placement promise to the
// presentation, without changing the conditions, arguments or dependencies.
function expectedCellFeedbackAst(expected){
 const cells=findAstNodes(expected,node=>node.type==='VariableDeclarator'&&node.id?.name==='selectCell');
 assert.equal(cells.length,1,'one selected-cell adapter');
 const callback=cells[0].init.arguments[0];
 assert.deepEqual(callback.params.map(param=>param.name),['V','X']);
 const before=normalizedAst('()=>{selectedPiece<0||!state.gameActive||placePiece(selectedPiece,V,X)}').body[0].expression.body;
 assert.deepEqual(callback.body,before,'immutable selected-cell guard and placement arguments');
 callback.body=normalizedAst('()=>{if(selectedPiece<0||!state.gameActive)return;return placePiece(selectedPiece,V,X)}').body[0].expression.body;
 return expected;
}
const motionAdapters=JSON.parse(read(__dirname+'/fixtures/casual-motion-ast-adapters.json'));
const astHash=node=>sha(JSON.stringify(node));
function sceneStatementKey(node){
 if(node.type==='FunctionDeclaration')return 'function:'+node.id.name;
 if(node.type==='VariableDeclaration')return 'declaration:'+node.declarations.map(declaration=>declaration.id.name).join(',');
 if(node.type==='ReturnStatement')return 'return';
 return 'expression:'+astHash(node);
}
// Normalize only statements pinned by the reviewed presentation rewrite. The
// exact source order and both old/new AST hashes are checked first. Every other
// statement and the complete surrounding AST still compare to the owned preview.
function normalizeMotionSceneAst(actual,expected){
 assert.equal(motionAdapters.schemaVersion,1);
 assert.equal(motionAdapters.baseCommit,'73582b7be248385d087e8640b1a548083f6579f6');
 const source=structuredClone(actual),nodes=findAstNodes(source,node=>node.type==='FunctionDeclaration'&&node.id?.name==='buildBloxScene');
 const oldNodes=findAstNodes(expected,node=>node.type==='FunctionDeclaration'&&node.id?.name==='buildBloxScene');
 assert.equal(nodes.length,1);assert.equal(oldNodes.length,1);
 const body=nodes[0].body.body,old=new Map(oldNodes[0].body.body.map(node=>[sceneStatementKey(node),node]));
 assert.deepEqual(body.map(sceneStatementKey),motionAdapters.sourceOrder,'only the reviewed scene statement order');
 const used=[];
 nodes[0].body.body=body.flatMap(node=>{
  const key=sceneStatementKey(node),adapter=motionAdapters.adapters[key];
  if(!adapter)return [node];
  used.push(key);assert.equal(astHash(node),adapter.sourceSha256,'exact motion adapter '+key);
  if(adapter.kind==='add'){assert.equal(old.has(key),false,'new presentation declaration '+key);assert.equal(adapter.previewSha256,null);return [];}
  assert.equal(adapter.kind,'replace');assert.ok(old.has(key));assert.equal(astHash(old.get(key)),adapter.previewSha256,'immutable preview adapter '+key);
  return [structuredClone(old.get(key))];
 });
 assert.deepEqual(used.sort(),Object.keys(motionAdapters.adapters).sort(),'every disclosed adapter is checked');
 return source;
}
const corePromise=Promise.all([import(pathToFileURL(root+'/game-logic/blox-engine.js').href),import(pathToFileURL(root+'/game-logic/blox-pieces.js').href),import(pathToFileURL(root+'/game-logic/economy.js').href),import(pathToFileURL(root+'/game-logic/hud-bonuses.js').href),import(pathToFileURL(root+'/src/game-runtime/sceneGeometry.js').href)]);
const compiledPure=closure(host,['Nr','Bi','Ec','Kg','iA','tx','ex','S2']);
test('critical Blox engines, routes and geometry match the immutable LF-normalized production baseline',()=>{
 for(const f of ['game-logic/blox-engine.js','game-logic/blox-pieces.js','game-logic/economy.js','game-logic/hud-bonuses.js','routes/blox.js','src/game-core/blox/engine.js','src/game-core/blox/pieces.js','src/game-runtime/sceneGeometry.js','src/game-runtime/pointerSession.js'])assert.equal(sha(read(root+'/'+f)),baselineHashes[f],f);
});

test('all retained runtime declarations preserve the immutable baseline AST after asset retirement',()=>{
 const proof=JSON.parse(read(__dirname+'/fixtures/retirement-baseline-ast.json'));
 assert.equal(proof.baseCommit,'1105f8a409fb31125efa8bd462443cdc4e1a204d');
 const allowedAssetMaps=new Set(['POTION_PIECE_ASSETS','MATCH3_ASSET_KEYS','LEGACY_ASSET_PATHS','GAME_ASSET_BUNDLES']);
 const retiredDeclarations={
  'src/game-runtime/scenes/shared/runtime.js':['BUBBO_ASSET_KEYS','BLOX_ASSET_KEYS','BLOX_TILE_ASSET_BY_COLOR','BLOX_PIECE_ASSET_BY_ID','FARM_CROP_SLUGS','FARM_ASSET_KEYS','BUBBO_BALL_SHEET_WIDTH','BUBBO_BALL_SHEET_HEIGHT','BUBBO_BALL_ROWS','BUBBO_BALL_FRAMES','BUBBO_BALL_DRAW_SCALE','bubboBallTextureCache','FARM_SOIL','BUBBO_NUMBERS','BUBBO_BACKGROUND_THEMES','bubboBallFrame','bubboBallTexture','cropProgress','drawBubboBackground'],
  'src/game-runtime/assetBundles.js':['legacyPngEntries','BLOX_ROOT_ASSET_IDS','BLOX_FX_ASSET_IDS','FARM_ROOT_ASSET_IDS','FARM_CROP_ASSET_IDS','FARM_FX_ASSET_IDS','FARM_HARVEST_ASSET_IDS','FARM_SEED_ASSET_IDS','FARM_UI_ASSET_IDS','FARM_RENDER_ROOT_ASSET_IDS','FARM_RENDER_FX_ASSET_IDS','BLOX_BUNDLE_KEYS','FARM_BUNDLE_KEYS'],
 };
 const normalized=node=>JSON.stringify(node,(key,value)=>['start','end','raw'].includes(key)?undefined:value);
 for(const [file,baseline]of Object.entries(proof.files)){
  assert.equal(baseline.sourceSha256,baselineHashes[file],file+' immutable baseline');
  const declarations=acorn.parse(read(root+'/'+file),{ecmaVersion:'latest',sourceType:'module'}).body;
  let checked=0;const retainedNames=[];
  for(const original of declarations){const node=original.declaration||original;
   const items=node.type==='FunctionDeclaration'?[node]:node.type==='VariableDeclaration'?node.declarations:[];
   for(const declaration of items){const name=declaration.id?.name;if(!name)continue;retainedNames.push(name);if(allowedAssetMaps.has(name))continue;assert.equal(sha(normalized(declaration)),baseline.declarations[name],file+': '+name);checked++;}
  }
  assert.ok(checked>=10,file+' retains meaningful behavior coverage');
  assert.deepEqual(retainedNames.sort(),Object.keys(baseline.declarations).filter(name=>!retiredDeclarations[file].includes(name)).sort(),file+' retires only the declared asset and dead renderer helpers');
 }
});
test('recovered ASTs equal preview after exact Home/promise adapters and hash-pinned presentation-only scene changes',()=>{
 const groups=[['src/games/blox/BloxGame.jsx',host,['g2'],maps.globals,maps.locals],['src/games/blox/bloxInteraction.js',host,['ex','S2'],maps.globals,maps.locals],['src/games/blox/bloxComposition.js',host,['An','tx'],maps.globals,maps.locals],['src/games/blox/bloxArt.js',host,['na','yl','px','Tc','S0','Oi','E2','Di','vx'],maps.globals,maps.locals],['src/game-runtime/scenes/bloxScene.js',scene,['zt','jt','Ci'],maps.sceneGlobals,maps.sceneLocals]];
 for(const [file,input,names,g,l] of groups){let expected=expandStatements(rename(extract(input,names),g,l));if(file==='src/games/blox/bloxArt.js')expected=expected.replaceAll('.png','.webp');let expectedAst=normalizedAst(expected),actualAst=normalizedAst(sourceDecl(root+'/'+file));if(file==='src/games/blox/BloxGame.jsx')expectedAst=expectedCellFeedbackAst(expectedHomeShellAst(expectedAst));if(file==='src/game-runtime/scenes/bloxScene.js')actualAst=normalizeMotionSceneAst(actualAst,expectedAst);assert.deepEqual(actualAst,expectedAst,file);}
});

test('motion AST normalization rejects extra globals, edited input, effects, ordering and lifecycle',()=>{
 const expected=normalizedAst(expandStatements(rename(extract(scene,['zt','jt','Ci']),maps.sceneGlobals,maps.sceneLocals)));
 const actual=normalizedAst(sourceDecl(root+'/src/game-runtime/scenes/bloxScene.js'));
 for(const key of ['function:drawPiece','function:F','function:placementFeedback','declaration:O','return']){
  const changed=structuredClone(actual),build=findAstNodes(changed,node=>node.type==='FunctionDeclaration'&&node.id?.name==='buildBloxScene')[0];
  const target=build.body.body.find(node=>sceneStatementKey(node)===key);assert.ok(target,key);
  const extra=normalizedAst('unapprovedGlobal()').body[0];
  if(target.type==='FunctionDeclaration')target.body.body.unshift(extra);
  else if(target.type==='VariableDeclaration')target.declarations[0].init.arguments[0].properties[0].value.body.body.unshift(extra);
  else target.argument.expressions.push(extra.expression);
  assert.throws(()=>assert.deepEqual(normalizeMotionSceneAst(changed,expected),expected),undefined,key+' must fail closed');
 }
 const changed=structuredClone(actual),build=findAstNodes(changed,node=>node.type==='FunctionDeclaration'&&node.id?.name==='buildBloxScene')[0];
 build.body.body.push(normalizedAst('unapprovedGlobal()').body[0]);
 assert.throws(()=>normalizeMotionSceneAst(changed,expected),/statement order/);
 build.body.body.pop();
 [build.body.body[0],build.body.body[1]]=[build.body.body[1],build.body.body[0]];
 assert.throws(()=>normalizeMotionSceneAst(changed,expected),/statement order/);
});
test('the actual Blox Home adapter awaits an acknowledged end and refuses failures',async()=>{
 const src=read(root+'/src/games/blox/BloxGame.jsx'),ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'});
 const shells=findAstNodes(ast,node=>node.type==='VariableDeclarator'&&node.id?.name==='shellControls');assert.equal(shells.length,1);
 const adapter=shells[0].init.arguments[0].body.properties.find(property=>property.key.name==='safeLeave');assert.ok(adapter);
 const evaluate=(state,performAction)=>vm.runInNewContext('('+src.slice(adapter.value.start,adapter.value.end)+')',{state,performAction});
 let calls=0;assert.equal(await evaluate({gameActive:false},()=>{calls++;})(),true);assert.equal(calls,0);
 let acknowledge,settled=false;const receipt=new Promise(resolve=>acknowledge=resolve);
 const pending=evaluate({gameActive:true,score:37},(action,payload)=>{calls++;assert.equal(action,'blox.end');assert.deepEqual(clean(payload),{score:37});return receipt;})().then(result=>{settled=true;return result;});
 await Promise.resolve();assert.equal(settled,false);acknowledge({success:true});assert.equal(await pending,true);assert.equal(calls,1);
 for(const result of [undefined,{success:false},{error:'SAVE_FAILED'},{success:true,error:'SAVE_FAILED'}])assert.equal(await evaluate({gameActive:true,score:37},async()=>result)(),false);
 await assert.rejects(evaluate({gameActive:true,score:37},async()=>{throw Error('NETWORK_FAILED')})(),/NETWORK_FAILED/);
});
test('recovered local import paths exist and declarations have no leaked minified globals',()=>{
 for(const file of ['src/games/blox/BloxGame.jsx','src/games/blox/BloxPresentation.jsx','src/games/blox/bloxArt.js','src/games/blox/bloxComposition.js','src/games/blox/bloxInteraction.js','src/game-runtime/scenes/bloxScene.js']){
  const src=read(root+'/'+file),ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'});
  for(const n of ast.body)if(n.type==='ImportDeclaration'&&n.source.value.startsWith('.'))assert.ok(fs.existsSync(path.resolve(path.dirname(root+'/'+file),n.source.value)),file+' -> '+n.source.value);
  rename(src);const allowed=new Set(['Promise','Array','Object','Number','Math','String','Intl','window','navigator','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','console','BloxRuntimeBoundary','state','setTimeout','clearTimeout','Date','JSON','Set','type']);if(file==='src/game-runtime/scenes/bloxScene.js')allowed.add('document');assert.deepEqual(rename.lastFree.filter(x=>!allowed.has(x)),[],file);
 }
});
test('compiled reward thresholds and rotations agree with baseline implementations',async()=>{
 const [engine,pieces,economy,bonus]=await corePromise;
 assert.equal(compiledPure.Nr,engine.DEFAULT_BLOX_ROTATE_CHARGES);
 for(const score of [-100,0,1,49,50,99,100,101,299,300,599,600,999,1000,5000,100000,NaN,'100',null]){
  assert.equal(compiledPure.Ec(score),economy.calcBloxReward(score),'reward '+score);
  assert.deepEqual(clean(compiledPure.Bi(score)),clean(bonus.getRewardChestProgress(score)),'chest '+score);
 }
 for(const piece of pieces.PIECES)assert.deepEqual(clean(compiledPure.Kg(piece)),clean(engine.rotateBloxPiece(piece)),piece.id);
});
test('compiled placement preview agrees with baseline for every piece at board edges and clearing intersections',async()=>{
 const [engine,pieces]=await corePromise;
 for(const piece of pieces.PIECES)for(const [row,col] of [[0,0],[9,9],[-1,0],[0,-1],[4,5],[0.5,0]]){
  const state={board:engine.createEmptyBoard(),tray:[{piece,placed:false}],score:90,linesCleared:2,rotateCharges:3};
  assert.deepEqual(clean(compiledPure.iA(state,{pieceIdx:0,row,col})),clean(engine.previewBloxPlacement(state,{pieceIdx:0,row,col})),piece.id+':'+row+','+col);
 }
 const board=engine.createEmptyBoard();for(let k=1;k<10;k++){board[0][k]='#60a5fa';board[k][0]='#60a5fa'}
 const state={board,tray:[{piece:{id:'single',cells:[[0,0]],color:'#60a5fa'},placed:false}],score:0,linesCleared:0,rotateCharges:3};
 assert.deepEqual(clean(compiledPure.iA(state,{pieceIdx:0,row:0,col:0})),clean(engine.previewBloxPlacement(state,{pieceIdx:0,row:0,col:0})));
});
function controllerHarness(kind,context,core){
 const [engine,,economy,bonus]=core;const log={actions:[],events:[],sounds:[],sets:[]};let cursor=0;const states=[context.selected??-1,context.paused??false,context.optimistic??null,[]];const effects=[];
 const React={useState(initial){const i=cursor++;return [states[i]??initial,v=>{states[i]=typeof v==='function'?v(states[i]):v;log.sets.push([i,clean(states[i])]);}]},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
 const action=(...a)=>{log.actions.push(clean(a));return Promise.resolve(context.result||{})};const semantic={React,jsxRuntime:{jsx:(type,props)=>props},useSnapshot:()=>context.snapshot,useAction:()=>action,useReliableAction:()=>action,useExitToHub:()=>()=>log.actions.push(['exit']),useGameEvents:sel=>sel({pushEvent:e=>log.events.push(clean(e))}),useAppI18n:()=>({t:(key,args)=>args?key+JSON.stringify(args):key}),useImmersiveGame:(...a)=>{log.immersive=clean(a)},api:()=>Promise.resolve([]),audioManager:{play:n=>log.sounds.push(n)},BloxPresentation:'presentation',...engine,...economy,...bonus};
 let code,name,ctx={...semantic,...React};
 if(kind==='preview'){code=extract(host,['g2']);name='g2';for(const [old,next]of Object.entries(maps.globals))if(Object.hasOwn(semantic,next))ctx[old]=semantic[next]}
 else if(kind==='source'){code=extract(root+'/src/games/blox/BloxGame.jsx',['BloxGame']);name='BloxGame'}
 else {let s=read(base+'/src/games/blox/BloxGame.jsx');code=s.slice(s.indexOf('function BloxGame()'),s.indexOf('\n  return (\n'))+'\nreturn {state,paused,selectedPiece,sceneState,currentReward,rewardProgress:rewardChest.progress,trayPieces,leaders,onRotate:rotateSelectedPiece,onPause:()=>setPaused(true),onResume:()=>setPaused(false),onStart:()=>performAction("blox.start").then(()=>setPaused(false)),onFinish:()=>performAction("blox.end",{score:state.score}),onExit:exitToHub};}';name='BloxGame'}
 const props=vm.runInNewContext(code+';'+name+'()',ctx);return {props,log,states,effects};
}
test('source controller preserves preview and baseline action/economy/optimistic behavior',async()=>{
 const core=await corePromise,[engine]=core;const piece={id:'h3',cells:[[0,0],[0,1],[0,2]],color:'#60a5fa'};
 const fixture=(extra={})=>({snapshot:{blox:{highScore:1000,savedState:{board:engine.createEmptyBoard(),tray:[{piece,placed:false},{piece,placed:true}],score:100,linesCleared:1,rotateCharges:3,gameActive:true,...extra}}}});
 const scenarios=[['start',fixture(),'onStart',[]],['finish',fixture(),'onFinish',[]],['pause',fixture(),'onPause',[]],['resume',{...fixture(),paused:true},'onResume',[]],['exit',fixture(),'onExit',[]],['rotate',fixture(),'onRotate',[]],['rotate-empty',fixture({rotateCharges:0}),'onRotate',[]],['rotate-inactive',fixture({gameActive:false}),'onRotate',[]],['rotate-invalid',fixture({tray:[]}),'onRotate',[]],['rotate-error',{...fixture(),result:{error:'stale'}},'onRotate',[]],['place',fixture(),'onBloxDrop',[0,4,4]],['place-invalid',fixture(),'onBloxDrop',[0,9,9]],['place-inactive',fixture({gameActive:false}),'onBloxDrop',[0,1,1]],['place-error',{...fixture(),result:{error:'stale'}},'onBloxDrop',[0,1,1]],['place-clear',{...fixture(),result:{clear:{cleared:2}}},'onBloxDrop',[0,1,1]],['selected-cell',{...fixture(),selected:0},'onBloxCell',[1,1]],['selected-cell-error',{...fixture(),selected:0,result:{error:'stale'}},'onBloxCell',[1,1]],['selected-cell-clear',{...fixture(),selected:0,result:{clear:{cleared:2}}},'onBloxCell',[1,1]],['selected-cell-inactive',{...fixture({gameActive:false}),selected:0},'onBloxCell',[1,1]],['unselected-cell',fixture(),'onBloxCell',[1,1]]];
 for(const [label,context,action,args] of scenarios){const results=[];for(const kind of ['baseline','preview','source']){const h=controllerHarness(kind,context,core);const fn=h.props[action]||h.props.sceneState[action];const returned=fn(...args);const result=await returned;await new Promise(setImmediate);
  if(action==='onBloxCell'){
   const active=kind==='source'&&(context.selected??-1)>=0&&context.snapshot.blox.savedState.gameActive;
   if(active){assert.equal(typeof returned?.then,'function',label+' exposes placement promise');assert.deepEqual(clean(result),context.result||{},label+' exposes unchanged server receipt');}
   else assert.equal(result,undefined,label+' retains the no-placement return');
  }
  const initial=clean(h.props);delete initial.sceneState.bloxHudReserve;
  // Only the explicitly checked promise return is presentation-only. All action,
  // reward, sound, optimistic state and server-call traces remain exact parity.
  results.push(clean({initial,log:h.log,states:h.states,result:action==='onBloxCell'?undefined:result}));}assert.deepEqual(results[1],results[0],label+' preview vs baseline');assert.deepEqual(results[2],results[1],label+' source vs preview')}
});
test('all 18 Blox lossless WebP exports retain verified bytes, dimensions and nine-slice bounds',()=>{
 const art=closure(root+'/src/games/blox/bloxArt.js',['BLOX_ART','BLOX_BLOCK_ART','BLOX_PIXI_ASSETS','BLOX_NINE_SLICE'],{assetUrl:x=>x});const files=[...Object.values(art.BLOX_ART),...Object.values(art.BLOX_BLOCK_ART)];assert.equal(files.length,18);const manifest=[];
 for(const f of files){const a=fs.readFileSync(root+'/public'+f),reference=assetReference.find(x=>x.path===f);assert.ok(reference,f);assert.equal(sha(a),reference.sha256,f);assert.equal(a.length,reference.bytes,f);const {width,height}=readLosslessWebpMetadata(a);assert.equal(width,reference.width);assert.equal(height,reference.height);assert.ok(width>0&&height>0);manifest.push({path:f,width,height,bytes:a.length,sha256:sha(a)})}
 for(const skin of ['frame','panel','button']){const item=manifest.find(m=>m.path===art.BLOX_ART[skin]),[left,top,right,bottom]=art.BLOX_NINE_SLICE[skin].source;assert.ok(left+right<item.width&&top+bottom<item.height,skin)}
 assert.equal(art.BLOX_PIXI_ASSETS.length,14);for(const url of art.BLOX_PIXI_ASSETS)assert.ok(files.includes(url));if(process.env.CC_GH_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.CC_GH_EVIDENCE_DIR,'blox-asset-integrity.json'),JSON.stringify(manifest,null,2)+'\n');
});
test('composition preserves owned geometry for full mobile/tablet/desktop matrix and nonzero insets',()=>{
 const {composeBlox}=closure(root+'/src/games/blox/bloxComposition.js',['composeBlox'],{bloxLayoutDefaults:JSON.parse(read(root+'/src/app/hud-layout/defaultLayouts/blox.json'))});
 for(const [width,height]of [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[375,812]])for(const safe of [{},{top:44,bottom:34,left:0,right:0},{top:0,bottom:21,left:44,right:44}]){
  const input={width,height,safe};const a=clean(composeBlox(input)),b=clean(compiledPure.tx(input));assert.deepEqual(a,b,width+'x'+height);for(const box of [a.frame,a.hud,a.tray,a.status,...a.slots]){assert.ok(box.left>=0&&box.top>=0);assert.ok(box.left+box.width<=width+0.001);assert.ok(box.top+box.height<=height+0.001);assert.ok(box.width>0&&box.height>0)}assert.ok(a.board.cell>0);
 }
});
test('scene geometry helper semantic mappings match baseline across touch lifting and drag grabs',async()=>{
 const core=await corePromise,geometry=core[4];const cp=closure(scene,['de','ue','vt','$e']);
 const piece={id:'L3',cells:[[0,0],[1,0],[1,1]],color:'#60a5fa'};
 for(const [x,y]of [[8,8],[45,55],[66,73],[200,400]]){const input={pieceIdx:1,piece,event:{pointerId:5,global:{x,y}},originX:40,originY:50,unit:18};const a=cp.$e(input),b=geometry.createBloxDragState(input);assert.deepEqual(clean(a),clean(b));for(const offset of [0,-52,-92]){a.visualOffsetY=b.visualOffsetY=offset;a.x=b.x=156;a.y=b.y=201;assert.deepEqual(clean(cp.de(a)),clean(geometry.bloxDragVisualPoint(b)));assert.deepEqual(clean(cp.ue(a,24)),clean(geometry.bloxGhostOrigin(b,24)));const layout={left:18,top:44,cell:24,rows:10,cols:10};assert.deepEqual(clean(cp.vt(layout,a)),clean(geometry.bloxAnchorCellFromDrag(layout,b)))}}
});
test('optional assetUrls keeps legacy warmup branch and preloads exact Blox texture URLs before build',()=>{
 const src=read(root+'/src/game-runtime/PixiGameHost.jsx');assert.match(src,/assetUrls\s*=\s*null/);assert.match(src,/if \(assetUrls\) await Assets\.load\(assetUrls\.map\(assetUrl\)\);\s*else await warmPixiAssetBundle\(sceneKey, \{ force: true \}\)/);assert.ok(src.indexOf('Assets.load(assetUrls.map(assetUrl))')<src.indexOf('sceneRef.current = buildScene'));assert.match(src,/\[[^\]\n]*sceneKey[^\]\n]*buildScene[^\]\n]*assetUrls[^\]\n]*\]/);assert.match(read(root+'/src/games/blox/BloxPresentation.jsx'),/assetUrls:BLOX_PIXI_ASSETS/);
});
test('safe-area adapter does not double-consume four-axis shell CSS safe padding',()=>{
 const src=read(root+'/src/games/blox/blox-presentation.css');assert.match(src,/data-active-tab=blox\]\{padding:var\(--safe-top\) var\(--safe-right\) var\(--safe-bottom\) var\(--safe-left\)\}/);
 const {remainingArcadeSafeInsets}=closure(root+'/src/app/arcadeBoundary.js',['remainingArcadeSafeInsets']);assert.deepEqual(clean(remainingArcadeSafeInsets({top:44,bottom:34,left:44,right:44})),{top:0,bottom:0,left:0,right:0});
});
test('presentation and error boundary match preview apart from safe-area adapter and the exact All games navigation label',()=>{
 const names=['_n','pl','pr','Sx','_l','Ax','_x'];
 const expected=expandStatements(rename(extract(host,names),maps.globals,maps.locals));
 const actual=extract(root+'/src/games/blox/BloxPresentation.jsx',names.map(n=>maps.globals[n])).replace(/,\s*safe:remainingArcadeSafeInsets\(resolvedLayout\.viewport\?\.safeAreaInsets\)/,'');
 const expectedAst=normalizedAst(expected);
 const labels=findAstNodes(expectedAst,node=>node.type==='CallExpression'&&node.callee?.name==='t'&&node.arguments[0]?.value==='common.exit');
 assert.equal(labels.length,1,'the shared menu has one navigation label');labels[0].arguments[0].value='nav.allGames';
 assert.deepEqual(normalizedAst(actual),expectedAst);
 const Boundary=vm.runInNewContext(extract(root+'/src/games/blox/BloxPresentation.jsx',['BloxRuntimeBoundary'])+';BloxRuntimeBoundary',{React:{Component:class{}},jsxRuntime:{jsx:(type,props)=>({type,props})},BloxRuntimeStatus:'runtime-status',console});
 const instance=new Boundary();instance.props={children:'scene'};assert.equal(instance.render(),'scene');instance.state=Boundary.getDerivedStateFromError();assert.deepEqual(clean(instance.render()),{type:'runtime-status',props:{error:true}});
});
