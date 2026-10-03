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
const corePromise=Promise.all([import(pathToFileURL(root+'/game-logic/blox-engine.js').href),import(pathToFileURL(root+'/game-logic/blox-pieces.js').href),import(pathToFileURL(root+'/game-logic/economy.js').href),import(pathToFileURL(root+'/game-logic/hud-bonuses.js').href),import(pathToFileURL(root+'/src/game-runtime/sceneGeometry.js').href)]);
const compiledPure=closure(host,['Nr','Bi','Ec','Kg','iA','tx','ex','S2']);
test('critical Blox engines, routes and geometry are byte-identical to production baseline',()=>{
 for(const f of ['game-logic/blox-engine.js','game-logic/blox-pieces.js','game-logic/economy.js','game-logic/hud-bonuses.js','routes/blox.js','src/game-core/blox/engine.js','src/game-core/blox/pieces.js','src/game-runtime/sceneGeometry.js','src/game-runtime/pointerSession.js'])assert.equal(sha(fs.readFileSync(root+'/'+f)),baselineHashes[f],f);
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
test('all recovered game-only declaration ASTs equal owned preview after disclosed semantic renaming, statement expansion and art-only PNG-to-WebP path migration',()=>{
 const groups=[['src/games/blox/BloxGame.jsx',host,['g2'],maps.globals,maps.locals],['src/games/blox/bloxInteraction.js',host,['ex','S2'],maps.globals,maps.locals],['src/games/blox/bloxComposition.js',host,['An','tx'],maps.globals,maps.locals],['src/games/blox/bloxArt.js',host,['na','yl','px','Tc','S0','Oi','E2','Di','vx'],maps.globals,maps.locals],['src/game-runtime/scenes/bloxScene.js',scene,['zt','jt','Ci'],maps.sceneGlobals,maps.sceneLocals]];
 for(const [file,input,names,g,l] of groups){let expected=expandStatements(rename(extract(input,names),g,l));if(file==='src/games/blox/bloxArt.js')expected=expected.replaceAll('.png','.webp');assert.deepEqual(normalizedAst(sourceDecl(root+'/'+file)),normalizedAst(expected),file);}
});
test('recovered local import paths exist and declarations have no leaked minified globals',()=>{
 for(const file of ['src/games/blox/BloxGame.jsx','src/games/blox/BloxPresentation.jsx','src/games/blox/bloxArt.js','src/games/blox/bloxComposition.js','src/games/blox/bloxInteraction.js','src/game-runtime/scenes/bloxScene.js']){
  const src=read(root+'/'+file),ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'});
  for(const n of ast.body)if(n.type==='ImportDeclaration'&&n.source.value.startsWith('.'))assert.ok(fs.existsSync(path.resolve(path.dirname(root+'/'+file),n.source.value)),file+' -> '+n.source.value);
  rename(src);const allowed=new Set(['Promise','Array','Object','Number','Math','String','Intl','window','navigator','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','console','BloxRuntimeBoundary','state','setTimeout','clearTimeout','Date','JSON','Set','type']);assert.deepEqual(rename.lastFree.filter(x=>!allowed.has(x)),[],file);
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
 const scenarios=[['start',fixture(),'onStart',[]],['finish',fixture(),'onFinish',[]],['pause',fixture(),'onPause',[]],['resume',{...fixture(),paused:true},'onResume',[]],['exit',fixture(),'onExit',[]],['rotate',fixture(),'onRotate',[]],['rotate-empty',fixture({rotateCharges:0}),'onRotate',[]],['rotate-inactive',fixture({gameActive:false}),'onRotate',[]],['rotate-invalid',fixture({tray:[]}),'onRotate',[]],['rotate-error',{...fixture(),result:{error:'stale'}},'onRotate',[]],['place',fixture(),'onBloxDrop',[0,4,4]],['place-invalid',fixture(),'onBloxDrop',[0,9,9]],['place-inactive',fixture({gameActive:false}),'onBloxDrop',[0,1,1]],['place-error',{...fixture(),result:{error:'stale'}},'onBloxDrop',[0,1,1]],['place-clear',{...fixture(),result:{clear:{cleared:2}}},'onBloxDrop',[0,1,1]],['selected-cell',{...fixture(),selected:0},'onBloxCell',[1,1]],['unselected-cell',fixture(),'onBloxCell',[1,1]]];
 for(const [label,context,action,args] of scenarios){const results=[];for(const kind of ['baseline','preview','source']){const h=controllerHarness(kind,context,core);const fn=h.props[action]||h.props.sceneState[action];const result=await fn(...args);await Promise.resolve();const initial=clean(h.props);delete initial.sceneState.bloxHudReserve;results.push(clean({initial,log:h.log,states:h.states,result}));}assert.deepEqual(results[1],results[0],label+' preview vs baseline');assert.deepEqual(results[2],results[1],label+' source vs preview')}
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
test('presentation and recovered error-boundary class match preview apart from explicit shell safe-area adapter',()=>{
 const names=['_n','pl','pr','Sx','_l','Ax','_x'];
 const expected=expandStatements(rename(extract(host,names),maps.globals,maps.locals));
 const actual=extract(root+'/src/games/blox/BloxPresentation.jsx',names.map(n=>maps.globals[n])).replace(/,\s*safe:remainingArcadeSafeInsets\(resolvedLayout\.viewport\?\.safeAreaInsets\)/,'');
 assert.deepEqual(normalizedAst(actual),normalizedAst(expected));
 const Boundary=vm.runInNewContext(extract(root+'/src/games/blox/BloxPresentation.jsx',['BloxRuntimeBoundary'])+';BloxRuntimeBoundary',{React:{Component:class{}},jsxRuntime:{jsx:(type,props)=>({type,props})},BloxRuntimeStatus:'runtime-status',console});
 const instance=new Boundary();instance.props={children:'scene'};assert.equal(instance.render(),'scene');instance.state=Boundary.getDerivedStateFromError();assert.deepEqual(clean(instance.render()),{type:'runtime-status',props:{error:true}});
});
