import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Actor} from '../garden/qa/actor.mjs';
import {casesFor} from '../garden/qa/profiles.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const text=p=>readFile(path.join(root,p),'utf8');

test('Enter and Space use one text-bearing keyDown and one keyUp, never DOM click',async()=>{
 const events=[],a=new Actor({send:async(m,p)=>{events.push([m,p]);return{};}},'fixture','http://127.0.0.1', {actions:[]},'.');
 await a.key('Enter');await a.key(' ');
 assert.equal(events.length,4);
 for(const [i,k,t] of [[0,'Enter','\r'],[2,' ',' ']]){
  assert.deepEqual(events[i],['Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k==='Enter'?'Enter':'Space',windowsVirtualKeyCode:k==='Enter'?13:32,text:t,unmodifiedText:t}]);
  assert.equal(events[i+1][1].type,'keyUp');assert.ok(!('text'in events[i+1][1]));
 }
});
test('Escape, Tab and Ctrl+A remain raw keys, preserving command behavior',async()=>{
 const events=[],a=new Actor({send:async(m,p)=>{events.push(p);return{};}},'fixture','http://127.0.0.1',{actions:[]},'.');
 await a.key('Escape');await a.key('Tab');await a.key('a',{modifiers:2,commands:['selectAll']});
 for(const i of [0,2,4]){assert.equal(events[i].type,'rawKeyDown');assert.ok(!('text'in events[i]));}
 assert.deepEqual(events[4].commands,['selectAll']);
});
test('Garden QA close locator targets dialog control rather than its same-label scrim',async()=>{
 const scenario=casesFor('garden',{quick:true}).find(x=>x.id==='garden-poor-shop-focus'),clicks=[];
 await scenario.run({click:async x=>clicks.push(x),checkDialog:async()=>{},check:async()=>{},screenshot:async()=>{},key:async()=>{},waitFor:async()=>{}});
 assert.equal(clicks.at(-1),'[role=dialog] .gs2-close');
});
test('QA records hit-test target/occluder; keyboard and quote focus assertions are present',async()=>{
 const actor=await text('garden/qa/actor.mjs'),qa=await text('garden/qa/profiles.mjs');
 assert.match(actor,/Click target obscured: /);assert.match(actor,/hit:hit\?\.outerHTML/);assert.match(actor,/locator:\$\{json\(locator\)\}/);
 assert.match(qa,/Keyboard target is the real focused plant button/);assert.match(qa,/Quote transition restores focus into the current dialog/);
});
test('Safe-inset QA explicitly covers inner scroll reachability and outer bounds',async()=>{
 const qa=await text('garden/qa/profiles.mjs');
 for(const needle of ['Shelf scroll reaches a real care button','Only the workspace scrolls','Dialog body scroll reaches its lower content','safe-inset-dialog-bottom'])assert.ok(qa.includes(needle));
 assert.ok(casesFor('garden',{quick:true}).some(c=>c.id==='garden-568x320-simulated-insets'));
});

async function composition(source){
 const bundle=await text('garden/dist-garden-preview/assets/host-BacBU0WN.js');
 const spec=vm.runInNewContext('({'+bundle.match(/gardenComposition:\{([^}]*)\}/)[1]+'})');
 if(source){let s=await text('garden/source-excerpt/src/games/garden-shelf/gardenComposition.js');s=s.replace(/^import .*\n/,'').replace('export function','function');return vm.runInNewContext(s+';resolveGardenComposition',{repoLayout:{base:{regions:{gardenComposition:spec}}}});}
 const s=bundle.slice(bundle.indexOf('function H_'),bundle.indexOf('function ',bundle.indexOf('function H_')+12));return vm.runInNewContext(s+';H_',{Gy:{base:{regions:{gardenComposition:spec}}}});
}
test('Garden source and compiled composition agree across the full viewport matrix',async()=>{
 const a=await composition(true),b=await composition(false);
 const dims=[[320,568],[360,800],[375,812],[384,832],[390,844],[393,873],[412,915],[414,896],[430,932],[568,320],[844,390],[896,414],[768,1024],[1024,768],[1280,720],[627,810],[1352,836],[520,216],[390,740]];
 for(const [width,height] of dims){assert.deepEqual(JSON.parse(JSON.stringify(a({width,height}))),JSON.parse(JSON.stringify(b({width,height}))));assert.ok(a({width,height}).spotWidth>=44);}
 assert.equal(a({width:520,height:216}).landscape,true);assert.equal(a({width:390,height:844}).landscape,false);assert.equal(a({width:568,height:320}).landscape,true);
 assert.equal(a({width:568,height:320,safe:{left:24,right:24,top:84,bottom:20}}).landscape,true);
});
test('Merge scroll containment changes only outer scroll ownership, not body/workspace overflow',async()=>{
 const css=await text('merge/dist-merge-preview/assets/host-Bh9Bo-RB.css');
 assert.match(css,/\.ml-safe\{[^}]*overflow:clip/);assert.ok(!css.includes('min-height:314px'));assert.ok(!css.includes('min-height:304px'));
 assert.match(css,/\.ml-workspace\{[^}]*height:100%[^}]*overflow-y:auto/);assert.match(css,/\.ml-dialog-scroll\{[^}]*overflow-y:auto/);
 assert.match(css,/grid-template-rows:44px 44px minmax\(148px,1fr\)/);
});
function fakeDialog(){
 const button={hidden:false,isConnected:true,closest:()=>null,focus:()=>{doc.activeElement=button;}},dialog={querySelectorAll:()=>[button],contains:x=>x===button,focus:()=>{doc.activeElement=dialog;}};
 const doc={activeElement:{isConnected:false},listeners:new Map(),querySelectorAll:()=>[dialog],addEventListener:(k,f,c)=>doc.listeners.set(k,{f,c}),removeEventListener:k=>doc.listeners.delete(k)};
 return {doc,dialog,button};
}
test('Merge lifecycle receives title as dependency and catches Escape from body exactly once',async()=>{
 const code=await text('merge/dist-merge-preview/assets/host-BCxrcnPt.js'),start=code.indexOf('function Hp('),end=code.indexOf('function wp(',start),fn=code.slice(start,end);
 const {doc,dialog}=fakeDialog();let callback,deps,calls=0;
 const P={useId:()=> 'test-dialog',useRef:()=>({current:dialog}),useEffect:(f,d)=>{callback=f;deps=d;}},d={jsx:()=>null,jsxs:()=>null};
 const Hp=vm.runInNewContext(fn+';Hp',{P,d,document:doc,oe:()=>{},Zy:()=>{},Fm:()=>{}}),close=()=>calls++;
 Hp({title:'Quote',onClose:close,t:x=>x});assert.equal(deps[1],'Quote');const cleanup=callback();
 assert.equal(doc.listeners.get('keydown').c,true);doc.activeElement={};let prevented=0,stopped=0;
 doc.listeners.get('keydown').f({key:'Escape',preventDefault:()=>prevented++,stopPropagation:()=>stopped++});
 assert.equal(calls,1);assert.equal(prevented,1);assert.equal(stopped,1);
 doc.listeners.get('keydown').f({key:'Escape',defaultPrevented:true});assert.equal(calls,1);
 doc.querySelectorAll=()=>[dialog,{}];doc.listeners.get('keydown').f({key:'Escape'});assert.equal(calls,1);
 cleanup();assert.equal(doc.listeners.size,0);
});
test('Garden native button handler was not duplicated and hotfix markers are honest',async()=>{
 const jsx=await text('garden/source-excerpt/src/games/garden-shelf/GardenPresentation.tsx');
 assert.match(jsx,/if \(e.detail === 0\) tapRef.current\(\)/);assert.ok(!/gs2-plant-target[^\n]*onKeyDown/.test(jsx));
 for(const game of ['garden','merge']){const m=JSON.parse(await text(`${game}/dist-${game}-preview/${game}-preview.json`));assert.equal(m.artifactType,'recovered-bundle-hotfix-not-source-rebuild');assert.match(m.browserQa,/NOT RUN/);}
});
