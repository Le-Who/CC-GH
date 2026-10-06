/** Optional one-pet + calibrated-proxy consumer. Disabled by default.
 * No Yard hook, saved visit, authoritative clock or server mutation.
 * Browser/GPU appearance, occlusion, lifecycle and timing remain unqualified.
 */
import {installPipAnalyticalCoat,PIP_PRIVATE_GLB_SHA256,PIP_COAT_MATERIAL_NAME} from '../source/pip-analytical-coat.mjs';
import {createAdaptivePoseDriver} from './adaptive-pose-driver.mjs';
import {createCalibratedPlanter} from './calibrated-planter.mjs';

export async function createOptionalPipRenderer({enabled=false,loadAssetBytes,calibration,fragmentHelper,
  setupLighting,admitResources,onResources=()=>{},onFrameMetrics=()=>{},planter=null,
  canvasFactory=()=>document.createElement('canvas'),widthCss=64,heightCss=76,dpr=1,sourcePixelsPerCss=43.98087}={}) {
  if(enabled!==true)return null;
  if(typeof loadAssetBytes!=='function'||typeof setupLighting!=='function'||typeof admitResources!=='function')throw Error('Explicit asset, lighting and separate resource owners required');
  const owner='private-one-pet-WebGL-prototype',geometries=new Set(),materials=new Set(),skeletons=new Set(),attributes=new Set();
  let THREE,bytes,gltf,proxy,scene,camera,direction,pose,restoreMaterial,canvas,renderer,cleanupLighting;
  let disposed=false,paused=false,contextLost=false,size=null;
  function inventory(o){if(o.geometry){geometries.add(o.geometry);for(const a of Object.values(o.geometry.attributes))attributes.add(a);if(o.geometry.index)attributes.add(o.geometry.index);}
    if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.skeleton)skeletons.add(o.skeleton);}
  function dispose(){
    if(disposed)return;disposed=true;scene?.traverse(inventory);gltf?.scene.traverse(inventory);proxy?.root.traverse(inventory);
    pose?.dispose();restoreMaterial?.();cleanupLighting?.();
    for(const s of skeletons)s.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
    canvas?.removeEventListener('webglcontextlost',lose);canvas?.removeEventListener('webglcontextrestored',restore);
    renderer?.dispose();renderer?.forceContextLoss();if(canvas)canvas.width=canvas.height=0;
    scene?.clear();geometries.clear();materials.clear();skeletons.clear();attributes.clear();
    bytes=null;gltf=null;proxy=null;pose=null;renderer=null;restoreMaterial=null;cleanupLighting=null;onResources({event:'disposed',owner});
  }
  function lose(event){event.preventDefault();contextLost=true;onResources({event:'context-lost',owner});}
  function restore(){contextLost=false;onResources({event:'context-restored',owner,requiresBrowserAcceptance:true});}
  function requestSize(w,h,ratio,ppu){
    if(![w,h,ratio,ppu].every(Number.isFinite)||w<=0||h<=0||ratio<1||ratio>2||ppu<=0)throw Error('Invalid bounded dimensions');
    const bw=Math.ceil(w*ratio),bh=Math.ceil(h*ratio),pixels=bw*bh;if(bw>256||bh>256||pixels>65536)throw Error('Backing exceeds256×256 bound');
    const geometryBytes=[...attributes].reduce((n,a)=>n+a.array.byteLength,0);
    // Three0.186.1 Skeleton.computeBoneTexture: padded square RGBA32F texture.
    const boneTextureBytes=[...skeletons].reduce((n,s)=>{const side=Math.max(4,Math.ceil(Math.sqrt(s.bones.length*4)/4)*4);return n+side*side*16;},0);
    const estimate={stage:'before-drawing-buffer-allocation',owner,separateFromYard64MiBRGBALedger:true,
      cpuGLBBytes:3972384,cpuParsedBinaryBufferBytes:3937068,geometryGPUBufferBytes:geometryBytes,
      assetImageTextureBytes:0,uniqueSkeletons:skeletons.size,boneDataTextureGPUBytesEstimate:boneTextureBytes,boneDataTextureCPUBytesEstimate:boneTextureBytes,
      drawingBufferColorBytes:pixels*4,depthStencilEstimatedBytes:pixels*4,resizeDrawingBufferPeakEstimatedBytes:(pixels+(size?.pixels??0))*8,
      antialias:false,shadowMaps:false,driverOverheadKnown:false,exactGPUAllocationKnown:false,
      propMode:proxy?'same-depth-space calibrated planter':'pet only',poseAllocations:'Temporary matrices/vectors per pose; not pooled.'};
    if(geometryBytes>8*1024*1024||estimate.resizeDrawingBufferPeakEstimatedBytes>2*1024*1024||admitResources(estimate)!==true)throw Error('Separate prototype resource admission rejected');
    return{widthCss:w,heightCss:h,dpr:ratio,ppu,bw,bh,pixels,estimate};
  }
  function resize({widthCss:w=size?.widthCss??widthCss,heightCss:h=size?.heightCss??heightCss,dpr:ratio=size?.dpr??dpr,sourcePixelsPerCss:ppu=size?.ppu??sourcePixelsPerCss}={}){
    if(disposed)return false;const next=requestSize(w,h,ratio,ppu);renderer.setPixelRatio(1);renderer.setSize(next.bw,next.bh,false);size=next;
    camera.left=-w/(2*ppu);camera.right=w/(2*ppu);camera.top=h/(2*ppu);camera.bottom=-h/(2*ppu);camera.near=.01;camera.far=100;camera.updateProjectionMatrix();onResources(next.estimate);return true;
  }
  try{
    if(admitResources({stage:'before-import-and-load',owner,separateFromYard64MiBRGBALedger:true,cpuGLBBytes:3972384,
      cpuParsedBinaryBufferBytes:3937068,knownCPUBufferPeakBytes:7909452,engineAndLoaderObjectOverheadKnown:false})!==true)throw Error('Prototype preload admission rejected');
    let module;[THREE,module]=await Promise.all([import('three'),import('three/addons/loaders/GLTFLoader.js')]);
    if(THREE.REVISION!=='186')throw Error('Unqualified Three revision');
    bytes=await loadAssetBytes();if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==3972384)throw Error('Expected pinned GLB ArrayBuffer');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==PIP_PRIVATE_GLB_SHA256)throw Error('Private Pip asset identity mismatch');
    gltf=await new module.GLTFLoader().parseAsync(bytes,'');if((gltf.parser.json.images?.length??0)!==0)throw Error('Asset image decoder not admitted');
    gltf.scene.traverse(inventory);proxy=planter?createCalibratedPlanter(THREE,planter):null;proxy?.root.traverse(inventory);
    const material=[...materials].find(m=>m.name===PIP_COAT_MATERIAL_NAME);if(!material)throw Error('Pinned coat material missing');
    restoreMaterial=installPipAnalyticalCoat(material,{glbSha256:hash,fragmentHelper});pose=createAdaptivePoseDriver(THREE,gltf,calibration);
    scene=new THREE.Scene();scene.add(gltf.scene);if(proxy)scene.add(proxy.root);camera=new THREE.OrthographicCamera();direction=new THREE.Vector3(5.66,9.799775507632814,8);
    requestSize(widthCss,heightCss,dpr,sourcePixelsPerCss);canvas=canvasFactory();renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:false});
    renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    cleanupLighting=setupLighting({THREE,scene,renderer});renderer.shadowMap.enabled=false;if(scene.environment||scene.background)throw Error('Unqualified environment/background resource');
    scene.traverse(inventory);canvas.addEventListener('webglcontextlost',lose);canvas.addEventListener('webglcontextrestored',restore);resize();
  }catch(error){dispose();throw error;}
  function renderAndCopy(ctx,{sample,point,alpha=1}={}){
    if(disposed||paused||contextLost)return false;if(!ctx?.drawImage||!Number.isFinite(point?.x)||!Number.isFinite(point?.y))throw Error('Canvas2D context and projected root required');
    const t0=performance.now(),{rootGLTF}=pose.apply(sample),target=rootGLTF.clone();if(proxy)target.lerp(proxy.root.position,.5);target.add(new THREE.Vector3(0,.5,0));
    camera.position.copy(target).add(direction);camera.lookAt(target);camera.updateMatrixWorld(true);
    const projected=rootGLTF.clone().project(camera),px=(projected.x+1)*size.widthCss/2,py=(1-projected.y)*size.heightCss/2;
    const t1=performance.now();renderer.render(scene,camera);const t2=performance.now();
    // Same-callback drawImage of one reused transparent canvas. No readPixels,
    // toDataURL, ImageBitmap conversion, or per-frame DOM canvas allocation.
    ctx.save();try{ctx.globalAlpha*=Math.max(0,Math.min(1,alpha));ctx.drawImage(canvas,point.x-px,point.y-py,size.widthCss,size.heightCss);}finally{ctx.restore();}
    const t3=performance.now();onFrameMetrics({poseAndCameraMs:t1-t0,renderSubmitMs:t2-t1,drawImageCallMs:t3-t2,totalCallMs:t3-t0,GPUCompletionMeasured:false,backing:[size.bw,size.bh]});return true;
  }
  return{renderAndCopy,resize,dispose,setPaused(v){paused=Boolean(v);},setPlanterPlacement(p){if(disposed)return;if(!proxy)throw Error('No calibrated planter admitted');proxy.move(p);},get resources(){return size?.estimate;},
    qualification:'Disabled; browser GPU appearance, lifecycle, occlusion and timing not accepted.'};
}
