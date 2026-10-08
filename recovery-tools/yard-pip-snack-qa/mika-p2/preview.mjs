import * as THREE from 'three';
import {GLTFLoader} from './vendor/three/addons/loaders/GLTFLoader.js';
const spec=await(await fetch('./expected.json',{cache:'no-store'})).json();
const variant=new URL(location.href).searchParams.get('variant')||'p2';
if(!Object.hasOwn(spec.variants,variant))throw Error('Unknown diagnostic variant');
const expected=spec.variants[variant],canvas=document.querySelector('canvas'),status=document.querySelector('[role=status]');
const errors=[],warnings=[];let playing=false,at=0,playStart=0,playBase=0,disposed=false,lastPose=null;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xdce3d5);
const camera=new THREE.OrthographicCamera(-3.15,3.15,2.3625,-2.3625,.05,100);
const target=new THREE.Vector3(...expected.camera.target),direction=new THREE.Vector3(...expected.camera.direction);
camera.position.copy(target).add(direction);camera.lookAt(target);
scene.add(new THREE.HemisphereLight(0xdce5ff,0x829071,1.15));
const key=new THREE.DirectionalLight(0xffffff,2.6);key.position.set(4,6,4);key.castShadow=true;
key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});key.shadow.bias=-.00015;scene.add(key);
const fill=new THREE.DirectionalLight(0xd9e5ff,.8);fill.position.set(-3,4,-3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshStandardMaterial({color:0x8f9c84,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
const requestStart=performance.now(),response=await fetch(expected.file,{cache:'no-store'});
if(!response.ok)throw Error(`GLB request ${response.status}`);
const buffer=await response.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
if(digest!==expected.sha256||buffer.byteLength!==expected.bytes)throw Error('Pinned GLB identity mismatch');
const gltf=await new GLTFLoader().parseAsync(buffer,new URL('./',location.href).href);const model=gltf.scene;scene.add(model);
const skinned=[],materials=new Set(),geometries=new Set();let vertices=0;
model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;geometries.add(o.geometry);vertices+=o.geometry.attributes.position.count;for(const m of(Array.isArray(o.material)?o.material:[o.material]))materials.add(m);}if(o.isSkinnedMesh)skinned.push(o);});
const body=skinned.find(o=>o.geometry.attributes.position.count===expected.mainSkinVertices);
if(!body)throw Error('Unique main skin missing');
const owner=model.getObjectByName(expected.rootMotionOwner)||model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(expected.rootMotionOwner));
if(!owner)throw Error('Root motion owner missing');
if(gltf.animations.length!==1)throw Error('One source animation required');
const clip=gltf.animations[0];if(Math.abs(clip.duration-expected.duration)>1e-5)throw Error('Animation duration mismatch');
const loadMilliseconds=performance.now()-requestStart;
const mixer=new THREE.AnimationMixer(model),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
function resize(){const r=canvas.getBoundingClientRect(),aspect=r.width/r.height;renderer.setSize(r.width,r.height,false);const height=Math.max(4.725,6.3/aspect),width=height*aspect;Object.assign(camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});camera.updateProjectionMatrix();}
const resizeObserver=new ResizeObserver(()=>{resize();renderAt(at);});resizeObserver.observe(canvas);resize();
function renderAt(time){if(disposed)return;at=Math.max(0,Math.min(expected.duration,time));action.reset().play();mixer.setTime(at);scene.updateMatrixWorld(true);for(const mesh of skinned)mesh.skeleton.update();renderer.render(scene,camera);status.textContent=`${variant} · ${at.toFixed(3)}s / ${expected.duration.toFixed(1)}s · pinned GLB ready`;}
function seek(time){playing=false;renderAt(time);return snapshot();}
function snapshot(){const ref=expected.poses.find(p=>Math.abs(p.time-at)<1e-5),points=[],v=new THREE.Vector3(),bounds={min:[Infinity,Infinity],max:[-Infinity,-Infinity]};let maxError=0;
 for(let i=0;i<expected.vertexIndices.length;i++){body.getVertexPosition(expected.vertexIndices[i],v);v.applyMatrix4(body.matrixWorld);points.push(v.toArray());if(ref)maxError=Math.max(maxError,v.distanceTo(new THREE.Vector3(...ref.points[i])));v.project(camera);bounds.min[0]=Math.min(bounds.min[0],v.x);bounds.min[1]=Math.min(bounds.min[1],v.y);bounds.max[0]=Math.max(bounds.max[0],v.x);bounds.max[1]=Math.max(bounds.max[1],v.y);}
 const root=owner.getWorldPosition(new THREE.Vector3()).toArray(),rootError=ref?new THREE.Vector3(...root).distanceTo(new THREE.Vector3(...ref.root)):null;
 lastPose={at,points,root,maxError:ref?maxError:null,rootError,bounds};
 return {ready:true,variant,at,playing,duration:clip.duration,sha256:digest,glbBytes:buffer.byteLength,loadMilliseconds,threeRevision:THREE.REVISION,skinMeshes:skinned.length,bones:body.skeleton.bones.length,vertices,materials:materials.size,geometries:geometries.size,bodyHasVertexColor:!!body.geometry.attributes.color,bodyUsesVertexColor:!!body.material.vertexColors,rootMotionOwner:owner.name,animationTracks:clip.tracks.length,customCoatOrPoseDriver:false,pose:lastPose,renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory}},errors:[...errors],warnings:[...warnings],horizontalOverflow:document.documentElement.scrollWidth>innerWidth};}
function play(){playBase=at;playStart=performance.now();playing=true;}
function tick(now){if(disposed)return;if(playing){renderAt(playBase+(now-playStart)/1000);if(at>=expected.duration)playing=false;}requestAnimationFrame(tick);}
function dispose(){if(disposed)return;disposed=true;playing=false;resizeObserver.disconnect();mixer.stopAllAction();mixer.uncacheRoot(model);const skeletons=new Set(skinned.map(m=>m.skeleton));for(const s of skeletons)s.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();floor.geometry.dispose();floor.material.dispose();renderer.dispose();}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();errors.push('WebGL context lost');playing=false;});
document.querySelector('#play').onclick=play;document.querySelector('#pause').onclick=()=>{playing=false;};document.querySelector('#restart').onclick=()=>seek(0);
const select=document.querySelector('#variant');select.value=variant;select.onchange=()=>{location.href=`?variant=${encodeURIComponent(select.value)}`;};addEventListener('pagehide',dispose);
renderAt(0);window.mikaQA={ready:true,seek,play,pause:()=>{playing=false;},diagnostics:snapshot,dispose};requestAnimationFrame(tick);
