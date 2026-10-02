import test from 'node:test';import assert from 'node:assert/strict';
import {PlantSurface} from '../src/games/garden-shelf/living/living-plant-art.mjs';
function environment(){
 const listeners=new Map(),deleted=[],draws=[],uniforms=[];let id=0;
 const events={addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
 const gl={};for(const name of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','DYNAMIC_DRAW','FLOAT','ELEMENT_ARRAY_BUFFER','STATIC_DRAW','BLEND','ONE','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','TEXTURE_2D','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','RGBA','UNSIGNED_BYTE','SCISSOR_TEST','COLOR_BUFFER_BIT','TEXTURE0','TEXTURE1','TRIANGLES','UNSIGNED_SHORT'])gl[name]=++id;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 for(const name of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','uniform1i','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','enable','blendFunc','bindTexture','texParameteri','texImage2D','disable','clearColor','clear','viewport','scissor','bufferSubData','activeTexture','deleteBuffer','deleteProgram','deleteShader'])gl[name]=()=>{};
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_p,n)=>n;gl.uniform1f=(key,value)=>uniforms.push([key,value]);gl.drawElements=()=>draws.push(1);gl.deleteTexture=t=>deleted.push(t);
 const media={matches:false,...events};
 globalThis.document={hidden:false,...events,createElement(){return {style:{},setAttribute(){},remove(){this.removed=true;},getContext(){return gl;},...events};}};
 globalThis.window={...events};globalThis.matchMedia=()=>media;globalThis.devicePixelRatio=2;globalThis.requestAnimationFrame=()=>++id;globalThis.cancelAnimationFrame=()=>{};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.getComputedStyle=()=>({overflow:'visible',overflowX:'visible',overflowY:'visible'});
 globalThis.Image=class{width=512;height=768;async decode(){}};
 const root={children:[],append(node){this.children.push(node);},getBoundingClientRect(){return {left:0,top:0,right:320,bottom:480,width:320,height:480};}};
 const fallback={style:{removeProperty(key){delete this[key];}}};
 const node={parentElement:root,getBoundingClientRect(){return {left:20,top:20,right:120,bottom:120,width:100,height:100};},querySelector(){return fallback;}};
 return {root,node,fallback,gl,draws,uniforms,deleted,media};
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
