import test from 'node:test';import assert from 'node:assert/strict';
import {PlantSurface,makeLivingPlantArt,getLivingPlantMotionState,listenToMotionPreference} from '../src/games/garden-shelf/living/living-plant-art.mjs';
function environment(){
 const listeners=new Map(),deleted=[],draws=[],uniforms=[],vertices=[];let id=0;
 const events={addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
 const gl={};for(const name of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','DYNAMIC_DRAW','FLOAT','ELEMENT_ARRAY_BUFFER','STATIC_DRAW','BLEND','ONE','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','TEXTURE_2D','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','RGBA','UNSIGNED_BYTE','SCISSOR_TEST','COLOR_BUFFER_BIT','TEXTURE0','TEXTURE1','TRIANGLES','UNSIGNED_SHORT'])gl[name]=++id;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 for(const name of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','uniform1i','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','enable','blendFunc','bindTexture','texParameteri','texImage2D','disable','clearColor','clear','viewport','scissor','bufferSubData','activeTexture','deleteBuffer','deleteProgram','deleteShader'])gl[name]=()=>{};
 gl.bufferSubData=(_target,_offset,data)=>vertices.push(Float32Array.from(data));
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_p,n)=>n;gl.uniform1f=(key,value)=>uniforms.push([key,value]);gl.drawElements=()=>draws.push(1);gl.deleteTexture=t=>deleted.push(t);
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
test('context disposal restores fallback and releases textures',async()=>{
 const e=environment(),s=new PlantSurface(e.root);s.add(e.node,{id:'p',type:'daisy',phase:3});await s.load('daisy-mature-r2.webp');await Promise.all(s.pending.values());s.draw(100);assert.ok(e.draws.length);s.dispose();assert.equal(e.fallback.style.visibility,undefined);assert.equal(e.deleted.length,1);assert.equal(s.canvas.removed,true);s.dispose();assert.equal(e.deleted.length,1);
});
test('reduced motion skips growth blend without awarding anything',async()=>{
 const e=environment();e.media.matches=true;const s=new PlantSurface(e.root),item=s.add(e.node,{id:'p',type:'daisy',phase:0});
 await s.load('daisy-seedling-r1.webp');await s.load('daisy-young-r1.webp');await Promise.all(s.pending.values());s.draw(100);s.update(item,{id:'p',type:'daisy',phase:1});s.draw(150);assert.equal(e.uniforms.at(-1)[1],1);assert.equal(item.previousKey,null);s.dispose();
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
