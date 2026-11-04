import test from 'node:test';import assert from 'node:assert/strict';
import {PlantSurface,makeLivingPlantArt,getLivingPlantMotionState,listenToMotionPreference,requestPlantArtNearShelf} from '../src/games/garden-shelf/living/living-plant-art.mjs';
import { plantGeometry, artworkForNode, unionArtwork } from '../src/games/garden-shelf/living/plant-art-placement.mjs';
function environment(){
 const listeners=new Map(),deleted=[],draws=[],uniforms=[],vertices=[];let id=0;
 const events={addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
 const gl={};for(const name of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','DYNAMIC_DRAW','FLOAT','ELEMENT_ARRAY_BUFFER','STATIC_DRAW','BLEND','ONE','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','TEXTURE_2D','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','RGBA','UNSIGNED_BYTE','SCISSOR_TEST','COLOR_BUFFER_BIT','TEXTURE0','TEXTURE1','TRIANGLES','UNSIGNED_SHORT'])gl[name]=++id;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 for(const name of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','uniform1i','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','enable','blendFunc','bindTexture','texParameteri','texImage2D','disable','clearColor','clear','viewport','scissor','bufferSubData','activeTexture','deleteBuffer','deleteProgram','deleteShader'])gl[name]=()=>{};
 gl.bufferSubData=(_target,_offset,data)=>vertices.push(Float32Array.from(data));
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_p,n)=>n;gl.uniform1f=(key,value)=>uniforms.push([key,value]);gl.uniform4f=(key,...value)=>uniforms.push([key,value]);gl.drawElements=()=>draws.push(1);gl.deleteTexture=t=>deleted.push(t);
 const media={matches:false,...events};
 globalThis.document={hidden:false,...events,createElement(){return {style:{},setAttribute(){},remove(){this.removed=true;},getContext(){return gl;},...events};}};
 globalThis.window={...events};globalThis.matchMedia=()=>media;globalThis.devicePixelRatio=2;globalThis.requestAnimationFrame=()=>++id;globalThis.cancelAnimationFrame=()=>{};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.getComputedStyle=()=>({overflow:'visible',overflowX:'visible',overflowY:'visible'});
 globalThis.Image=class{width=512;height=768;async decode(){}};
 const root={children:[],append(node){this.children.push(node);},getBoundingClientRect(){return {left:0,top:0,right:320,bottom:480,width:320,height:480};}};
 const fallback={style:{removeProperty(key){delete this[key];}}};
 const node={dataset:{},parentElement:root,getBoundingClientRect(){return {left:20,top:20,right:120,bottom:120,width:100,height:100};},querySelector(){return fallback;}};
 root.querySelectorAll=()=>[node];
 return {root,node,fallback,gl,draws,uniforms,deleted,media,vertices};
}
test('pending growth image never overwrites the new cache key with old texture',async()=>{
 const e=environment(),s=new PlantSurface(e.root);const item=s.add(e.node,{id:'p',type:'daisy',phase:0,lastWatered:0});
 await s.load('daisy-seedling-r1.webp');await Promise.all(s.pending.values());s.draw(100);
 const old=s.ledger.entries.get('daisy-seedling-r1.webp');assert.ok(old);assert.equal(e.fallback.style.visibility,'hidden');
 s.update(item,{id:'p',type:'daisy',phase:1,lastWatered:0});s.draw(150);
 assert.equal(s.ledger.entries.has('daisy-young-r1.webp'),false);assert.equal(e.uniforms.at(-1)[1],0);
 await Promise.all(s.pending.values());const fresh=s.ledger.entries.get('daisy-young-r1.webp');assert.notEqual(fresh.texture,old.texture);
 for(let n=0;n<50;n++)s.draw(200+n*40);
 assert.equal(e.uniforms.at(-1)[1],1);assert.equal(item.previousKey,null);s.dispose();
});
test('the exact first growth frame keeps the previous pot on its support point',async()=>{
 const e=environment();e.node.closest=selector=>selector==='.gs2-plant-target'?{}:null;
 const surface=new PlantSurface(e.root),item=surface.add(e.node,{id:'basil',type:'basil',phase:2});
 const oldKey='basil-developing-r1.webp',newKey='basil-mature-r1.webp';
 await surface.load(oldKey);await Promise.all(surface.pending.values());surface.draw(100);
 surface.update(item,{id:'basil',type:'basil',phase:3});
 await surface.load(newKey);await Promise.all(surface.pending.values());surface.draw(200);
 assert.equal(item.growthMix,0,'the texture-ready first frame begins with the previous art');
 const previous=e.uniforms.findLast(([key])=>key==='previousFrame')[1];
 const bounds=unionArtwork(artworkForNode(e.node,oldKey),artworkForNode(e.node,newKey));
 const pot=plantGeometry[oldKey].pot;
 const x=bounds.left+(previous[0]+pot.centerX*previous[2])*bounds.width;
 const y=bounds.top+(previous[1]+pot.baseY*previous[3])*bounds.height;
 assert.ok(Math.abs(x-70)<1e-9,'previous pot stays centered in the100px slot');
 assert.ok(Math.abs(y-120)<1e-9,'previous pot remains on the120px standing plane');
 surface.draw(600);assert.ok(item.growthMix>0&&item.growthMix<1);
 surface.dispose();
});

test('context disposal restores fallback and releases textures',async()=>{
 const e=environment(),s=new PlantSurface(e.root);s.add(e.node,{id:'p',type:'daisy',phase:3});await s.load('daisy-mature-r2.webp');await Promise.all(s.pending.values());s.draw(100);assert.ok(e.draws.length);s.dispose();assert.equal(e.fallback.style.visibility,undefined);assert.equal(e.deleted.length,1);assert.equal(s.canvas.removed,true);s.dispose();assert.equal(e.deleted.length,1);
});
test('reduced motion skips growth blend without awarding anything',async()=>{
 const e=environment();e.media.matches=true;const s=new PlantSurface(e.root),item=s.add(e.node,{id:'p',type:'daisy',phase:0});
 await s.load('daisy-seedling-r1.webp');await s.load('daisy-young-r1.webp');await Promise.all(s.pending.values());s.draw(100);s.update(item,{id:'p',type:'daisy',phase:1});s.draw(150);assert.equal(e.uniforms.at(-1)[1],1);assert.equal(item.previousKey,null);s.dispose();
});

test('reduced motion redraws a moved plant after its scrollport changes without a root resize',async()=>{
 const e=environment();e.media.matches=true;
 let callback,queued,top=20,disconnected=false;
 const observed=new Set(),scrollport={};
 globalThis.ResizeObserver=class{constructor(fn){callback=fn;}observe(node){observed.add(node);}unobserve(node){observed.delete(node);}disconnect(){disconnected=true;observed.clear();}};
 globalThis.requestAnimationFrame=fn=>{queued=fn;return 1;};
 e.root.querySelector=()=>scrollport;
 e.node.getBoundingClientRect=()=>({left:20,top,right:120,bottom:top+100,width:100,height:100});
 const surface=new PlantSurface(e.root),item=surface.add(e.node,{id:'resized',type:'daisy',phase:3});
 await surface.load('daisy-mature-r2.webp');await Promise.all(surface.pending.values());
 surface.draw(100);queued=null;
 assert.equal(item.slot.top,20);
 top=48;
 // A browser ResizeObserver only calls its callback for observed elements.
 if(observed.has(scrollport))callback([{target:scrollport}]);
 assert.equal(typeof queued,'function');queued(150);
 assert.equal(item.slot.top,48);
 assert.equal(item.drawRect.top>=48,true);
 surface.remove(item);assert.equal(disconnected,true);assert.equal(observed.size,0);
});
test('changing plant identity cannot inherit another plant visual events',()=>{
 const e=environment(),s=new PlantSurface(e.root),item=s.add(e.node,{id:'a',type:'daisy',phase:0,lastWatered:0});
 item.touch=1;item.water=2;item.previousKey='daisy-seedling-r1.webp';item.growStarted=3;
 s.update(item,{id:'b',type:'daisy',phase:3,lastWatered:100});
 assert.equal(item.touch,-Infinity);assert.equal(item.water,-Infinity);assert.equal(item.previousKey,null);assert.equal(item.growStarted,null);assert.equal(s.metrics.growths,0);assert.equal(s.metrics.waterings,0);s.dispose();
});

test('shader compilation failure removes the half-created canvas',()=>{
 const e=environment();e.gl.getShaderParameter=()=>false;e.gl.getShaderInfoLog=()=> 'intentional unit compile failure';
 assert.throws(()=>new PlantSurface(e.root),/intentional unit compile failure/);assert.equal(e.root.children.length,1);assert.equal(e.root.children[0].removed,true);
});

test('normal rendering uploads changing foliage vertices and touch response; reduced mode remains pinned',async()=>{
 const e=environment(),s=new PlantSurface(e.root),item=s.add(e.node,{id:'motion',type:'daisy',phase:3});
 await s.load('daisy-mature-r2.webp');await Promise.all(s.pending.values());
 s.draw(100);const before=e.vertices.at(-1);
 for(let n=0;n<15;n++)s.draw(150+n*50);
 const idle=e.vertices.at(-1);assert.notDeepEqual(idle,before);assert.equal(e.node.dataset.livingMode,'animated');
 s.touch({detail:{id:'motion'}});s.draw(1000);s.draw(1050);assert.equal(item.touches,1);assert.notDeepEqual(e.vertices.at(-1),idle);
 e.media.matches=true;s.preferenceChanged();s.draw(1100);const reduced=e.vertices.at(-1);assert.deepEqual(reduced,item.skin.grid.uv);assert.equal(getLivingPlantMotionState(e.root),'reduced');
 s.touch({detail:{id:'motion'}});s.draw(1150);assert.deepEqual(e.vertices.at(-1),reduced);s.dispose();
});
test('context loss restores visible static art and reports fallback, with no game-state mutation',async()=>{
 const e=environment(),s=new PlantSurface(e.root),state={id:'lost',type:'daisy',phase:3,lastTapped:0};s.add(e.node,state);
 await s.load('daisy-mature-r2.webp');await Promise.all(s.pending.values());s.draw(100);assert.equal(e.fallback.style.visibility,'hidden');
 let prevented=false;s.lost({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(e.fallback.style.visibility,undefined);assert.equal(e.node.dataset.livingMode,'static-fallback');assert.equal(e.node.dataset.livingReason,'context-lost');assert.equal(getLivingPlantMotionState(e.root),'fallback');assert.equal(state.lastTapped,0);
});
test('failed WebGL initialization reports static fallback instead of animated',()=>{
 const e=environment(),create=document.createElement;document.createElement=()=>({...create(),getContext:()=>null});
 e.node.closest=selector=>selector.includes('modal-layer')?e.root:null;
 const effects=[];let refs=0;
 const React={useRef:()=>({current:refs++===0?e.node:null}),useState:value=>[value,()=>{}],useEffect:effect=>effects.push(effect),createElement:(type,props,...children)=>({type,props,children})};
 const before={id:'no-gl',type:'daisy',phase:3};makeLivingPlantArt(React)({plant:before});
 const warn=console.warn;console.warn=()=>{};try{for(const effect of effects)effect();}finally{console.warn=warn;}
 assert.equal(e.node.dataset.livingMode,'static-fallback');assert.equal(getLivingPlantMotionState(e.root),'fallback');assert.notEqual(e.fallback.style.visibility,'hidden');assert.ok(e.root.children.every(canvas=>canvas.removed));assert.deepEqual(before,{id:'no-gl',type:'daisy',phase:3});
});
test('failed texture decode reports static fallback and keeps the normal image visible',async()=>{
 const e=environment(),s=new PlantSurface(e.root);s.add(e.node,{id:'bad-decode',type:'daisy',phase:3});
 globalThis.Image=class{async decode(){throw Error('intentional decode failure');}};
 const warn=console.warn;console.warn=()=>{};try{await s.load('daisy-mature-r2.webp');await Promise.all(s.pending.values());s.draw(100);}finally{console.warn=warn;}
 assert.equal(e.node.dataset.livingMode,'static-fallback');assert.equal(e.node.dataset.livingReason,'image-unavailable');assert.notEqual(e.fallback.style.visibility,'hidden');s.dispose();
});

test('legacy embedded-browser media listeners preserve the same reduced-motion preference and cleanup',()=>{
 const calls=[],listener=()=>{};const media={matches:true,addListener(fn){calls.push(['add',fn]);},removeListener(fn){calls.push(['remove',fn]);}};
 const cleanup=listenToMotionPreference(media,listener);assert.equal(media.matches,true);cleanup();assert.deepEqual(calls,[['add',listener],['remove',listener]]);
});


test('later-shelf image waits for its scrollport, preloads nearby, and requests only once',()=>{
 const root={getBoundingClientRect:()=>({left:0,top:100,right:320,bottom:400})};
 let top=700,loaded=0,disconnected=0,observed=null,options=null,notify=null;
 const node={closest:()=>root,getBoundingClientRect:()=>({left:20,top,right:120,bottom:top+100})};
 class Observer{constructor(callback,value){notify=callback;options=value;}observe(value){observed=value;}disconnect(){disconnected++;}}
 const cleanup=requestPlantArtNearShelf(node,()=>loaded++,Observer);
 assert.equal(loaded,0);assert.equal(observed,node);assert.equal(options.root,root);assert.equal(options.rootMargin,'96px 0px');
 notify([{target:node,isIntersecting:false}]);assert.equal(loaded,0);
 notify([{target:node,isIntersecting:true}]);assert.equal(loaded,1);assert.equal(disconnected,1);
 notify([{target:node,isIntersecting:true}]);assert.equal(loaded,1);cleanup();
 top=420;let constructions=0;
 requestPlantArtNearShelf(node,()=>loaded++,class{constructor(){constructions++;}});
 assert.equal(loaded,2,'nearby lower shelves start immediately');assert.equal(constructions,0);
});
test('deferred image cleanup prevents a late visibility callback from requesting art',()=>{
 let notify,loaded=0;
 const root={getBoundingClientRect:()=>({left:0,top:0,right:320,bottom:400})},node={closest:()=>root,getBoundingClientRect:()=>({left:20,top:900,right:120,bottom:1000})};
 class Observer{constructor(callback){notify=callback;}observe(){}disconnect(){}}
 const cleanup=requestPlantArtNearShelf(node,()=>loaded++,Observer);cleanup();notify([{target:node,isIntersecting:true}]);assert.equal(loaded,0);
});
test('missing or broken IntersectionObserver preserves eager fallback art',()=>{
 const root={getBoundingClientRect:()=>({left:0,top:0,right:320,bottom:400})},node={closest:()=>root,getBoundingClientRect:()=>({left:20,top:900,right:120,bottom:1000})};let loaded=0;
 requestPlantArtNearShelf(node,()=>loaded++,null);assert.equal(loaded,1);
 requestPlantArtNearShelf(node,()=>loaded++,class{constructor(){throw Error('unsupported');}});assert.equal(loaded,2);
 requestPlantArtNearShelf({closest:()=>null},()=>loaded++,class{});assert.equal(loaded,3,'care/catalog outside the shelf are not deferred');
});
test('first shelf and detail art have an immediate src; deferred shelf art keeps dimensions',()=>{
 const React={useRef:()=>({current:null}),useState:value=>[value,()=>{}],useEffect(){},createElement:(type,props,...children)=>({type,props,children})};
 const Art=makeLivingPlantArt(React),plant={id:'fixture',type:'daisy',phase:3};
 const first=Art({plant,size:112}),later=Art({plant,size:112,deferOffscreen:true});
 assert.equal(first.children[0].props.src,'/games/garden-living/daisy-mature-r2.webp');assert.equal(first.props['data-art-requested'],'true');
 assert.equal(later.children[0].props.src,undefined);assert.equal(later.props['data-art-requested'],'false');assert.deepEqual(first.props.style,later.props.style);
});

test('a revealed plant uses the current phase and retains legacy image-error fallback',()=>{
 const state=[];let cursor=0;const effects=[];
 const node={closest:()=>null};
 const React={useRef:()=>({current:node}),useState:value=>{const index=cursor++;if(!(index in state))state[index]=value;return [state[index],next=>{state[index]=next;}];},useEffect:effect=>effects.push(effect),createElement:(type,props,...children)=>({type,props,children})};
 const Legacy=()=>{},Art=makeLivingPlantArt(React,Legacy);
 const render=phase=>{cursor=0;effects.length=0;return Art({plant:{id:'phase-change',type:'daisy',phase},deferOffscreen:true});};
 assert.equal(render(0).children[0].props.src,undefined);
 render(2);effects[0](); // Outside a shelf / no observer: eagerly reveal with compatibility fallback.
 const visible=render(2);assert.equal(visible.children[0].props.src,'/games/garden-living/daisy-budding-r1.webp');
 visible.children[0].props.onError();const failed=render(2);
 assert.equal(failed.type,'span');assert.equal(failed.children[0].type,Legacy);assert.equal(failed.children[0].props.plant.phase,2);
});
