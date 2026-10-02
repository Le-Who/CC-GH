import {makeGrid,deformGrid,createPresentationClock,DAISY,MONSTERA,FERN} from './plant-motion.mjs';
const canvas=document.querySelector('canvas');
const status=document.querySelector('[role=status]');
const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});
const grid=makeGrid();
let disposed=false,frame=0,lastDraw=0,touchAt=-Infinity,waterAt=-Infinity;
const clock=createPresentationClock();
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const fail=message=>{status.textContent=message;canvas.hidden=true;document.querySelector('.fallback').hidden=false;};
const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
async function boot(){
 if(!gl){fail('Анимация недоступна: показываем статичный исходник.');return;}
 const vs=shader(gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 uv;varying vec2 vUv;void main(){vUv=uv;vec2 p=vec2(0.04)+position*0.92;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);}');
 const fs=shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D plant;varying vec2 vUv;void main(){vec4 c=texture2D(plant,vUv);gl_FragColor=vec4(c.rgb*c.a,c.a);}');
 const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 const pos=gl.createBuffer(),uv=gl.createBuffer(),index=gl.createBuffer();
 const attribute=(name,buffer,data)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);};
 attribute('position',pos,grid.uv);attribute('uv',uv,grid.uv);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,grid.indices,gl.STATIC_DRAW);
 const definitions=[['daisy','daisy-mature-r2.webp',DAISY],['monstera','monstera-mature-r1.webp',MONSTERA],['fern','fern-mature-r1.webp',FERN]];
 const textures=new Map();let current=DAISY;
 for(const [id,file,config] of definitions){
  const image=new Image();image.src='./assets/'+file;await image.decode();
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  textures.set(id,{texture,config,ratio:image.width/image.height,file});
 }
 const resize=()=>{const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));gl.viewport(0,0,canvas.width,canvas.height);};
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 function draw(now){if(disposed||document.hidden)return;if(!reduce.matches)frame=requestAnimationFrame(draw);const t=clock.step(now);if(!reduce.matches&&now-lastDraw<1000/30)return;lastDraw=now;const vertices=deformGrid(grid,t,current,{reduced:reduce.matches,impulseAge:t-touchAt,waterAge:t-waterAt});gl.bindBuffer(gl.ARRAY_BUFFER,pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,grid.indices.length,gl.UNSIGNED_SHORT,0);}
 const resume=()=>{cancelAnimationFrame(frame);clock.setVisible(!document.hidden);if(!document.hidden)frame=requestAnimationFrame(draw);};
 document.addEventListener('visibilitychange',resume);
 reduce.addEventListener('change',resume);
 const choose=id=>{const item=textures.get(id);if(!item)return;current=item.config;gl.bindTexture(gl.TEXTURE_2D,item.texture);canvas.style.aspectRatio=String(item.ratio);document.querySelector('.fallback').src='./assets/'+item.file;touchAt=-Infinity;waterAt=-Infinity;resize();resume();};
 document.querySelector('select').addEventListener('change',event=>choose(event.target.value));choose('daisy');
 document.querySelector('[data-touch]').addEventListener('click',()=>{touchAt=clock.elapsed;status.textContent='Проверка отклика листьев и цветов. Игровых наград здесь нет.';});
 document.querySelector('[data-water]').addEventListener('click',()=>{waterAt=clock.elapsed;status.textContent='Проверка мягкой реакции на полив. Это только движение.';});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();disposed=true;cancelAnimationFrame(frame);fail('Графический контекст потерян. Статичная картинка сохранена; перезагрузите пробу.');});
 window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',resume);reduce.removeEventListener('change',resume);for(const item of textures.values())gl.deleteTexture(item.texture);gl.deleteBuffer(pos);gl.deleteBuffer(uv);gl.deleteBuffer(index);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);},{once:true});
 window.__PLANT_PROOF__={ready:true,kind:'presentation-only',vertices:grid.uv.length/2,reduced:()=>reduce.matches};
 status.textContent='Проба движения ромашки. Корни и горшок зафиксированы.';resume();
}
boot().catch(error=>{console.error(error);fail('Не удалось включить анимацию. Показываем статичный исходник.');});
