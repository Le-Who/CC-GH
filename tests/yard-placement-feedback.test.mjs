import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {selectPendingPlacementVisuals, mergePlacementVisuals} from '../src/game-state/yardPlacementFeedback.mjs';

const legacy = await readFile(process.env.YARD_FEEDBACK_LEGACY_SOURCE || new URL('../src/games/companion-yard/CompanionYardGame.jsx', import.meta.url), 'utf8');
const courtyard = await readFile(process.env.YARD_FEEDBACK_COURTYARD_SOURCE || new URL('../src/games/companion-yard-v2/CourtyardGame.jsx', import.meta.url), 'utf8');
const intent = (extra={}) => ({accountId:'A',clientActionId:'yard:test',action:'yard.placeGoodie',payload:{slotId:'free_test',goodieId:'leaf_pot',x:50,y:70},status:'pending',...extra});
const snapshot = () => ({player:{id:'A'},yard:{placedGoodies:[],goodieInventory:{leaf_pot:1},currencies:{treats:20}},yardRuntime:{visits:[]}});
const elements = node => !node || typeof node !== 'object' ? [] : [node,...(node.children||[]).flat(Infinity).flatMap(elements)];
function legacyRender(state,draft=null) {
  const start=legacy.indexOf('  const renderPlacedGoodies =');
  const end=legacy.indexOf('  const renderStarterGoodieHints =',start);
  const code=transformSync(legacy.slice(start,end)+'\nglobalThis.rendered=renderPlacedGoodies();',{loader:'jsx'}).code;
  const projected=mergePlacementVisuals(state.snapshot.yard.placedGoodies,selectPendingPlacementVisuals({accountId:state.snapshot.player.id,placements:state.snapshot.yard.placedGoodies,pendingActions:state.pendingActions}));
  const context={React:{createElement:(type,props,...children)=>({type,props,children})},yard:state.snapshot.yard,placedVisuals:projected,
    placementDraft:draft,goodies:{leaf_pot:{id:'leaf_pot',size:'small'}},slotMap:{},pendingByKey:new Map(),visitorsBySlot:new Map(),
    getPlacedPosition:row=>row,goodieStageStyle:row=>({left:row.x,top:row.y}),assetPath:()=>'/leaf.png',goodieName:()=> 'Leaf pot',text:(_key,fallback)=>fallback};
  vm.runInNewContext(code,context);
  return elements(context.rendered).filter(row=>row.props?.['data-slot-id']);
}
// Exercise the actual confirmation callback and the actual render-loop input.
// This is a controller/selection test, not a browser or pixel acceptance test.
test('legacy confirmation keeps the queued object visible before any server snapshot', async () => {
  const body = legacy.match(/const confirmPlacement = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[performAction, placementDraft\]\);/)[1];
  const input = legacy.match(/const renderPlacedGoodies = \(\) => \([\s\S]*?\{\(([^\n]+)\)\.map\(\(placed\)/)[1];
  const state = {snapshot:{player:{id:'A'},yard:{placedGoodies:[],goodieInventory:{leaf_pot:1},currencies:{treats:20}}},pendingActions:[]};
  let draft = {mode:'place',slotId:'free_test',goodieId:'leaf_pot',x:50,y:70};
  const context = {
    useGameHub:{getState:()=>state},
    get placementDraft(){return draft;},
    setPlacementDraft:value=>{draft=typeof value==='function'?value(draft):value;},
    setActiveScreen:()=>{},
    performAction:async(action,payload)=>{state.pendingActions.push({accountId:'A',clientActionId:'yard:test',action,payload,status:'pending'});return {success:true,pending:true,clientActionId:'yard:test'};},
  };
  vm.runInNewContext(`(function(){${body}})()`, context);
  await Promise.resolve();
  await Promise.resolve();
  let projected = state.snapshot.yard.placedGoodies;
  if (legacy.includes('selectPendingPlacementVisuals')) {
    const {selectPendingPlacementVisuals, mergePlacementVisuals} = await import('../src/game-state/yardPlacementFeedback.mjs');
    projected = mergePlacementVisuals(state.snapshot.yard.placedGoodies,selectPendingPlacementVisuals({accountId:'A',placements:[],pendingActions:state.pendingActions}));
  }
  const rows=vm.runInNewContext(`(${input})`,{yard:state.snapshot.yard,placedVisuals:projected});
  assert.ok(draft || rows.some(row=>row.slotId==='free_test'), 'the preview disappeared while the server result is still unresolved');
  assert.equal(state.snapshot.yard.placedGoodies.length,0,'server state must not be fabricated');
  assert.equal(state.snapshot.yard.goodieInventory.leaf_pot,1,'inventory stays authoritative');
  assert.equal(state.snapshot.yard.currencies.treats,20,'currency stays authoritative');
  assert.equal(state.pendingActions.length,1,'only one command is queued');
  const visible=legacyRender(state,draft);
  assert.equal(visible.length,1,'actual JSX has exactly one placed object after enqueue');
  assert.equal(visible[0].props.style.left,50);
  assert.equal(visible[0].props.disabled,true,'pending object cannot issue another command');
});

test('timeout, retry, reconnect and hydration preserve the same pending visual without economic changes',()=>{
  const base=snapshot(),frozen=JSON.stringify(base);
  for(const status of ['pending','sending','rollout-paused','canonical-blocked']) {
    const state={snapshot:base,pendingActions:[intent({status,attempts:4,nextAttemptAt:60000})]};
    assert.equal(legacyRender(state).length,1,status);
    assert.equal(JSON.stringify(base),frozen);
  }
});

test('realtime before HTTP is deduplicated; final rejection rolls back only the projection',()=>{
  const base=snapshot();base.yard.placedGoodies=[{slotId:'free_test',goodieId:'leaf_pot',x:10,y:20,condition:'worn'}];
  const move=intent({action:'yard.moveGoodie'});
  const state={snapshot:base,pendingActions:[move]};
  assert.equal(legacyRender(state)[0].props.style.left,50);
  state.snapshot.yard.placedGoodies[0]={...base.yard.placedGoodies[0],x:50,y:70};
  assert.equal(legacyRender(state).length,1,'server echo must not create a second item');
  state.pendingActions=[];
  assert.equal(legacyRender(state).length,1,'HTTP settlement keeps authoritative item');
  state.snapshot.yard.placedGoodies[0].x=10;
  state.pendingActions=[{...move,status:'failed',requiresUserDecision:true}];
  assert.equal(legacyRender(state)[0].props.style.left,10,'rejected move shows server position');
  state.snapshot.yard.placedGoodies=[];
  assert.equal(legacyRender(state).length,0,'rejected placement creates nothing');
});

test('foreign accounts, malformed commands, purchases and duplicate intents never project',()=>{
  const base=snapshot();base.player.id='B';
  assert.equal(legacyRender({snapshot:base,pendingActions:[intent()]}).length,0);
  const rows=selectPendingPlacementVisuals({accountId:'A',placements:[],pendingActions:[intent({action:'yard.buyGoodie'}),intent({payload:{goodieId:'leaf_pot',x:50,y:70}}),intent({payload:{slotId:'s',goodieId:'leaf_pot',x:Infinity,y:4}})]});
  assert.deepEqual(rows,[]);
  assert.equal(selectPendingPlacementVisuals({accountId:'A',pendingActions:[intent(),intent()]}).length,1);
});

test('editor and pending projection cannot draw the same slot twice',()=>{
  const base=snapshot();base.yard.placedGoodies=[{...intent().payload,condition:'new'}];
  assert.equal(legacyRender({snapshot:base,pendingActions:[intent()]},{...intent().payload,mode:'move'}).length,0,'editor owns the one preview');
});

test('Courtyard actual cancel handoff retains its pending ghost instead of clearing the scene',()=>{
  const source=courtyard.match(/const cancel=useCallback\(([\s\S]*?),\[\]\);/)[1];
  const helper=courtyard.match(/function pendingScenePlacement\([\s\S]*?\n\}/)?.[0]||'';
  const state={snapshot:snapshot(),pendingActions:[intent()]};
  let sceneGhost={...intent().payload};
  const context={useGameHub:{getState:()=>state},ghostRef:{current:sceneGhost},drag:{current:null},canvas:{current:null},
    scene:{current:{endPointer:()=>{},setGhost:row=>sceneGhost=row}},setGhost:()=>{},pendingPlacement:()=>state.pendingActions[0],
    placementMode:{current:{canonical:false,saved:false}},selectPendingPlacementVisuals,
    isCanonicalItemIntent:()=>false,canonicalPlacements:()=>[],canonicalCommandScope:()=>null};
  vm.runInNewContext(`${helper}\n(${source})(true)`,context);
  assert.ok(sceneGhost,'actual editor close must leave the journal-backed visual on screen');
  assert.equal(sceneGhost.pendingActionId,'yard:test');
  assert.equal(state.snapshot.yard.placedGoodies.length,0);
});

test('Courtyard journal refresh settles, rejects, switches accounts and leaves saved scenes unchanged',()=>{
  const helper=courtyard.match(/function pendingScenePlacement\([\s\S]*?\n\}/)?.[0];
  assert.ok(helper,'pending display selector must exist');
  const state={snapshot:snapshot(),pendingActions:[intent()]};
  const context={selectPendingPlacementVisuals,isCanonicalItemIntent:p=>!!p.locationId,canonicalPlacements:s=>s.yardRuntime.canonicalPlacements||[],canonicalCommandScope:()=>({locationId:'canonical',locationVersion:1,geometryRevision:'g1'})};
  vm.runInNewContext(`${helper}\nglobalThis.select=pendingScenePlacement`,context);
  assert.equal(context.select(state).pendingActionId,'yard:test');
  assert.equal(context.select(state,{saved:true}),null,'saved scene must not enable unfinished placement');
  state.pendingActions[0].status='failed';assert.equal(context.select(state),null);
  state.pendingActions[0].status='pending';state.snapshot.player.id='B';assert.equal(context.select(state),null);
  state.snapshot.player.id='A';state.pendingActions=[];assert.equal(context.select(state),null);
  state.pendingActions=[intent({payload:{...intent().payload,locationId:'canonical',locationVersion:1,geometryRevision:'g1'}})];
  assert.equal(context.select(state),null,'canonical coordinates cannot enter the legacy scene');
  assert.equal(context.select(state,{canonical:true}).slotId,'free_test');
  state.pendingActions[0].payload.geometryRevision='old';assert.equal(context.select(state,{canonical:true}),null,'old geometry cannot be drawn into a new location');
});

test('legacy old-session enqueue completion cannot close a new account editor (including A-B-A)',async()=>{
  const body=legacy.match(/const confirmPlacement = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[performAction, placementDraft\]\);/)[1];
  const original={snapshot:snapshot(),accountSession:{}};
  let current=original,resolve,draft={mode:'place',...intent().payload},screen='editor';
  const context={useGameHub:{getState:()=>current},placementDraft:draft,setPlacementDraft:value=>{draft=typeof value==='function'?value(draft):value;},setActiveScreen:value=>screen=value,performAction:()=>new Promise(r=>resolve=r)};
  vm.runInNewContext(`(function(){${body}})()`,context);
  current={snapshot:snapshot(),accountSession:{}};
  const newDraft=draft={mode:'place',slotId:'new-session',goodieId:'leaf_pot',x:5,y:6};
  resolve({success:true,pending:true});await Promise.resolve();await Promise.resolve();
  assert.equal(draft,newDraft);assert.equal(screen,'editor');
});

test('legacy starter hints cannot duplicate a pending placed visual',()=>{
  const body=legacy.match(/const starterGoodieHints = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[/)[1];
  const context={yard:{placedGoodies:[],goodieInventory:{leaf_pot:1}},placementDraft:null,placedVisuals:[{slotId:'free_pending',goodieId:'leaf_pot'}],goodies:{leaf_pot:{id:'leaf_pot'}},clampYardPointToPlayzone:(_r,p)=>p};
  vm.runInNewContext('result=(()=>{'+body+'})();',context);
  assert.equal(context.result.length,0,'the pending object already supplies the one visible goodie');
  context.placedVisuals=[];vm.runInNewContext('result=(()=>{'+body+'})();',context);
  assert.equal(context.result.length,1,'an actually empty yard retains its starter hint');
});
