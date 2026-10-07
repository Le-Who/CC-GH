import {LIMITS} from '../resources.mjs';
import {CANONICAL_FOOD_CONTRACT,selectCanonicalFoodState} from '../../../../../game-logic/yard-v2/canonical-food-contract.mjs';

/** Explicit isolated painted art preview. No app import, server write or economic descriptor change.
 * The R2 state selector remains authoritative for bowl-1; this art descriptor
 * changes only this opt-in owner's asset and uses an explicitly measured 3.14 height while retaining the XY footprint.
 */
export const PAINTED_FOOD_ASSET=Object.freeze({
 id:'yard-food-painted-reference/20261007',sha256:'122b502fba1bd9e34db0921713bcf9c2e05077fd48472ca52e3dd3204078823f',file:'yard-food-painted-reference.glb',glbBytes:324808,
 binaryBufferBytes:317132,bufferViewCopiesBytes:317130,validationScratchBytes:68,
 encodedImageBlobCopyBytes:10946,decodedImageBytes:65536,decodeStagingBytes:65536,
 knownCPUBufferPeakBytes:1101156,geometryGPUBufferBytes:306184,textureMipGPUBytes:87380,
 contextRestoreGPUBufferPeakBytes:787128,rgbaImagePeakBytes:131072,
 sourceMeshes:6,drawPrimitives:6,geometries:6,materials:4,attributes:29,triangles:9424,
 imageTextureBytes:65536,imageWidth:128,imageHeight:128,imageSHA256:'85c1d151920038af82a20ea16d99d602ee5355c941b6db3650414e0dd85ccdd1',
 sourceBlendSha256:'a88b83274e2f5551462c2246be991ba8fe78cd99b364e206cc218642ec6330c0',
 qualification:'Source-review candidate; user art acceptance and actual phone/runtime qualification remain pending.'
});
export const PAINTED_FOOD_DESCRIPTOR=Object.freeze({...CANONICAL_FOOD_CONTRACT,
 id:'canonical-food-painted-reference-preview/20261007',economicDescriptorId:CANONICAL_FOOD_CONTRACT.id,
 assetGeometryRevision:PAINTED_FOOD_ASSET.id,assetSha256:PAINTED_FOOD_ASSET.sha256,glbBytes:PAINTED_FOOD_ASSET.glbBytes,unionHeightCanonical:3.14});
const validatePaintedDescriptor=value=>value&&Object.keys(value).length===Object.keys(PAINTED_FOOD_DESCRIPTOR).length&&
 Object.entries(PAINTED_FOOD_DESCRIPTOR).every(([k,v])=>Array.isArray(v)?Array.isArray(value[k])&&value[k].length===v.length&&v.every((n,i)=>value[k][i]===n):value[k]===v);
const stateGroups=Object.freeze({empty:['BowlVessel'],kibble:['BowlVessel','KibbleContents'],
  berry_plate:['BowlVessel','BerryContents'],bonito_bowl:['BowlVessel','BonitoContents']});
const rootNames=['BowlVessel','KibbleContents','BerryContents','BonitoContents'];
const resourceOwners=new WeakSet(),loadingLoaders=new WeakSet();
const quantity=n=>Number.isSafeInteger(n)&&n>=0;

/** Bundled only through this optional module; never copied from public/.
 * The host can instead supply its own byte loader, with the same identity gate.
 */
export function paintedFoodAssetURL(assetId=PAINTED_FOOD_ASSET.id) {
  if(assetId!==PAINTED_FOOD_ASSET.id)throw Error('Unknown canonical food asset identity');
  return new URL('../assets/food-painted-reference/yard-food-painted-reference.glb',import.meta.url);
}

/** One shared ledger per host renderer, including its existing owned resources.
 * Reserve before loading. Retired GPU estimates remain charged until the host
 * confirms renderer disposal; dispose events alone do not prove driver release.
 */
export function createPaintedFoodResourceOwner({getBaseUsage,resourceProfile="production"}={}) {
  if(typeof getBaseUsage!=='function')throw Error('Explicit current host resource usage required');
  if(!['production','isolated-native-sampling-1.5'].includes(resourceProfile))throw Error('Unknown resource profile');
  const limits=resourceProfile==='production'?LIMITS:{...LIMITS,estimatedGPU:20*1024*1024};
  const reservations=new Map();let nextId=0,visibleOwner=null;
  const peak={rgba:0,knownCPU:0,estimatedGPU:0};
  function usage(extra=null) {
    const base=getBaseUsage();
    if(!base||!['rgba','knownCPU','estimatedGPU'].every(k=>quantity(base[k])))throw Error('Invalid host resource usage');
    const total={...base};
    for(const row of [...reservations.values(),...(extra?[extra]:[])]){
      total.rgba+=row.rgba;total.knownCPU+=row.knownCPU;total.estimatedGPU+=row.estimatedGPU;
    }
    return {base:{rgba:base.rgba,knownCPU:base.knownCPU,estimatedGPU:base.estimatedGPU},total};
  }
  function admit(extra) {
    const u=usage(extra);
    if(!['rgba','knownCPU','estimatedGPU'].every(k=>quantity(u.total[k])&&u.total[k]<=limits[k]))throw Error('Canonical food resource cap exceeded');
    for(const k of Object.keys(peak))peak[k]=Math.max(peak[k],u.total[k]);
    return u;
  }
  const owner={
    reserve() {
      const row={id:++nextId,rgba:PAINTED_FOOD_ASSET.rgbaImagePeakBytes,knownCPU:PAINTED_FOOD_ASSET.knownCPUBufferPeakBytes,
        estimatedGPU:PAINTED_FOOD_ASSET.contextRestoreGPUBufferPeakBytes,retired:false};
      admit(row);reservations.set(row.id,row);let released=false;
      return {
        assertFits(){if(released)throw Error('Food reservation retired');admit();},
        claimVisible(){if(released||visibleOwner!==null&&visibleOwner!==row.id)return false;admit();visibleOwner=row.id;return true;},
        hide(){if(visibleOwner===row.id)visibleOwner=null;},
        retire({possiblyUploaded=false}={}) {
          if(released)return;released=true;if(visibleOwner===row.id)visibleOwner=null;
          if(possiblyUploaded){row.knownCPU=0;row.rgba=0;row.retired=true;}
          else reservations.delete(row.id);
        }
      };
    },
    releaseRetiredAfterRendererDisposal() {
      // Call only after the owning renderer is disposed / its context retired.
      for(const [id,row] of reservations)if(row.retired)reservations.delete(id);
    },
    snapshot(){return {...usage(),peak:{...peak},resourceProfile,limits:{rgba:limits.rgba,knownCPU:limits.knownCPU,estimatedGPU:limits.estimatedGPU},
      loadingOrLiveOwners:[...reservations.values()].filter(r=>!r.retired).length,
      retiredOwners:[...reservations.values()].filter(r=>r.retired).length,visibleOwners:visibleOwner===null?0:1,
      rgbaAdded:[...reservations.values()].reduce((n,r)=>n+r.rgba,0),driverAllocationKnown:false,physicalGPUReleaseKnown:false};}
  };
  resourceOwners.add(owner);return owner;
}

function inventory(root) {
 const geometries=new Set(),materials=new Set(),attributes=new Set(),cpuBuffers=new Set(),textures=new Set(),images=new Set();let triangles=0,drawPrimitives=0;
 root?.traverse(o=>{
  if(o.geometry){geometries.add(o.geometry);for(const a of [...Object.values(o.geometry.attributes),o.geometry.index].filter(Boolean)){attributes.add(a);cpuBuffers.add(a.array.buffer);}}
  for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture){textures.add(v);if(v.source?.data)images.add(v.source.data);}}
  if(o.isMesh){drawPrimitives++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}
 });return {geometries,materials,attributes,cpuBuffers,textures,images,triangles,drawPrimitives};
}
/** Track texture results even if a later parser dependency rejects before a root exists. */
function trackTextureLoads(loader){
 if(typeof loader.register!=='function'||typeof loader.unregister!=='function')throw Error('Qualified texture-tracking loader required');
 const textures=new Set(),images=new Set(),pending=new Set();let disposed=false;
 const release=t=>{if(!t)return;t.dispose();const image=t.source?.data;if(image?.close)image.close();};
 const plugin=parser=>{const load=parser.loadTexture.bind(parser);parser.loadTexture=(...args)=>{
  const p=Promise.resolve().then(()=>load(...args)).then(texture=>{if(texture){if(disposed)release(texture);else{textures.add(texture);if(texture.source?.data)images.add(texture.source.data);}}return texture;});
  pending.add(p);p.then(()=>pending.delete(p),()=>pending.delete(p));return p;
 };return{name:'YARD_FOOD_TEXTURE_OWNERSHIP'};};loader.register(plugin);
 return{textures,images,unregister(){loader.unregister(plugin);},async settle(){while(pending.size)await Promise.allSettled([...pending]);},markDisposed(){disposed=true;}};
}
function releaseScene(root,tracked) {
 if(root){root.visible=false;root.removeFromParent();}
 const owned=inventory(root),textures=new Set([...owned.textures,...(tracked?.textures??[])]),images=new Set([...owned.images,...(tracked?.images??[])]);
 tracked?.markDisposed();for(const g of owned.geometries)g.dispose();for(const m of owned.materials)m.dispose();
 for(const texture of textures)texture.dispose();for(const image of images)image.close?.();
 tracked?.textures.clear();tracked?.images.clear();root?.clear();
}
const sumBytes=values=>[...values].reduce((n,v)=>n+v.byteLength,0);
async function validateLoaded(THREE,gltf,bytes) {
 const json=gltf.parser.json,root=gltf.scene,owned=inventory(root),a=PAINTED_FOOD_ASSET;
 if(json.meshes?.length!==6||json.materials?.length!==4||json.buffers?.length!==1||json.buffers[0].uri||json.buffers[0].byteLength!==317132
  ||json.bufferViews?.length!==30||(json.animations?.length??0)||(json.skins?.length??0)||root.children.length!==4||root.children.some((o,i)=>o.name!==rootNames[i]))throw Error('Unexpected food source structure');
 if(json.images?.length!==1||json.textures?.length!==1||json.images[0].uri||json.images[0].mimeType!=='image/png'||json.textures[0].source!==0
  ||json.samplers?.length!==1||json.textures[0].sampler!==0)throw Error('Unexpected food image structure');
 if(owned.geometries.size!==6||owned.materials.size!==4||owned.attributes.size!==29||owned.drawPrimitives!==6||owned.triangles!==9424)throw Error('Unexpected loaded food geometry');
 const contact=root.getObjectByName('FoodContactLobe');if(!contact?.isMesh)throw Error('Missing food contact lobe');
 for(const g of owned.geometries){const keys=Object.keys(g.attributes).sort().join(',');if(keys!==(g===contact.geometry?'color,normal,position':'color,normal,position,uv')||!g.index||Object.keys(g.morphAttributes).length||g.attributes.color.itemSize!==4)throw Error('Unexpected food buffers');}
 if(owned.textures.size!==1||owned.images.size!==1)throw Error('Expected one shared food texture');
 const texture=[...owned.textures][0],image=[...owned.images][0];
 if(image.width!==128||image.height!==128||texture.flipY!==false||texture.colorSpace!==THREE.SRGBColorSpace||texture.generateMipmaps!==true
  ||texture.type!==THREE.UnsignedByteType||texture.format!==THREE.RGBAFormat)throw Error('Unexpected decoded food texture');
 if(contact.material.map||contact.material.transparent!==true||contact.material.vertexColors!==true)throw Error('Unexpected contact alpha');
 for(const m of owned.materials)if(m!==contact.material&&(m.map!==texture||m.transparent||!m.vertexColors||Object.entries(m).some(([k,v])=>v?.isTexture&&k!=='map')))throw Error('Unexpected food material map');
 const binary=await gltf.parser.getDependency('buffer',0),views=await gltf.parser.getDependencies('bufferView'),distinctViews=new Set(views),allCPU=new Set([bytes,binary,...distinctViews,...owned.cpuBuffers]);
 const imageBytes=await gltf.parser.getDependency('bufferView',json.images[0].bufferView),dv=new DataView(imageBytes);
 if(imageBytes.byteLength!==10946||dv.getUint32(0)!==0x89504e47||dv.getUint32(4)!==0x0d0a1a0a||dv.getUint32(16)!==128||dv.getUint32(20)!==128)throw Error('Unexpected embedded food PNG');
 const imageHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',imageBytes)),n=>n.toString(16).padStart(2,'0')).join('');if(imageHash!==a.imageSHA256)throw Error('Food image hash mismatch');
 const gpu=sumBytes([...owned.attributes].map(a=>a.array)),cpu=sumBytes(allCPU)+a.validationScratchBytes+a.encodedImageBlobCopyBytes+a.decodedImageBytes+a.decodeStagingBytes;
 if(binary.byteLength!==317132||distinctViews.size!==30||owned.cpuBuffers.size!==29||[...owned.cpuBuffers].some(b=>!distinctViews.has(b))||cpu!==a.knownCPUBufferPeakBytes||gpu!==a.geometryGPUBufferBytes)throw Error('Unexpected food allocation layout');
 const box=new THREE.Box3().setFromObject(root),min=[-0.31333333253860474,0,-0.31333333253860474],max=[0.31333333253860474,0.2608333230018616,0.31336963176727295];
 for(let i=0;i<3;i++)if(Math.abs(box.min.getComponent(i)-min[i])>1e-7||Math.abs(box.max.getComponent(i)-max[i])>1e-7)throw Error('Food source axes or bounds changed');
 contact.material.depthWrite=false;contact.material.depthTest=true;contact.renderOrder=-1;
 return Object.freeze({cpuGLBBytes:bytes.byteLength,cpuParsedBinaryBufferBytes:binary.byteLength,cpuBufferViewCopiesBytes:sumBytes(distinctViews),
  validationScratchBytes:a.validationScratchBytes,encodedImageBlobCopyBytes:a.encodedImageBlobCopyBytes,knownCPUBufferPeakBytes:cpu,geometryGPUBufferBytes:gpu,
  textureMipGPUBytes:a.textureMipGPUBytes,contextRestoreGPUBufferPeakBytes:a.contextRestoreGPUBufferPeakBytes,uniqueCPUBufferCount:allCPU.size,
  uniqueGeometryAttributes:owned.attributes.size,drawPrimitives:owned.drawPrimitives,triangles:owned.triangles,materials:owned.materials.size,geometries:owned.geometries.size,
  imageTextureBytes:a.imageTextureBytes,rgbaSurfaceBytes:a.rgbaImagePeakBytes,textureCount:1,renderTargets:0,canvasCopies:0,filters:0,shadowMaps:0,
  engineObjectAndHashImplementationOverheadKnown:false,decoderInternalOverheadKnown:false,driverAllocationKnown:false,physicalGPUReleaseKnown:false});
}

export async function createPaintedFoodPreview(THREE,{enabled=false,descriptor,loader,loadAssetBytes,resourceOwner,signal}={}) {
  if(enabled!==true)return null;
  if(THREE?.REVISION!=='186'||!validatePaintedDescriptor(descriptor))throw Error('Unqualified canonical food descriptor');
  if(!loader?.parseAsync||typeof loadAssetBytes!=='function'||!resourceOwners.has(resourceOwner))throw Error('Explicit food loader, bytes and shared resource owner required');
  signal?.throwIfAborted();
  if(loadingLoaders.has(loader))throw Error('Food loader is already loading');
  const reservation=resourceOwner.reserve();loadingLoaders.add(loader);
  let bytes=null,gltf=null,root=null,resources=null,selection=null,disposed=false,contextLost=false,possiblyUploaded=false,tracked=null;
  const counts={loads:0,selections:0,contextLosses:0,contextRestorations:0,disposals:0};
  function hide() {
    if(root){root.visible=false;for(const group of root.children)group.visible=false;}
    reservation.hide();
  }
  function dispose() {
    if(disposed)return;disposed=true;counts.disposals++;signal?.removeEventListener('abort',dispose);hide();releaseScene(root,tracked);tracked=null;
    reservation.retire({possiblyUploaded});bytes=null;gltf=null;root=null;selection=null;
  }
  try {
    bytes=await loadAssetBytes();signal?.throwIfAborted();
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==PAINTED_FOOD_ASSET.glbBytes)throw Error('Food asset byte identity mismatch');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==PAINTED_FOOD_ASSET.sha256)throw Error('Food asset hash mismatch');
    signal?.throwIfAborted();
    tracked=trackTextureLoads(loader);try{gltf=await loader.parseAsync(bytes,'');root=gltf.scene;}finally{tracked.unregister();await tracked.settle();}
    // Nothing sees the parsed scene until its root and all variant roots hide.
    hide();signal?.throwIfAborted();counts.loads++;
    resources=await validateLoaded(THREE,gltf,bytes);signal?.throwIfAborted();reservation.assertFits();
    root.name='Inactive painted food source preview (one shared bowl-1)';
    root.position.set(descriptor.anchorCanonicalXYZ[0]/12,descriptor.anchorCanonicalXYZ[2]/12,-descriptor.anchorCanonicalXYZ[1]/12);
    root.updateMatrixWorld(true);
    root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
    // During construction the reservation stays live until the asynchronous
    // load/parse result is cleaned up. Once ready, abort also closes the gap
    // between promise resolution and host attachment or snapshot selection.
    signal?.addEventListener('abort',dispose,{once:true});signal?.throwIfAborted();
  } catch(error){dispose();throw error;}finally{loadingLoaders.delete(loader);}
  function select(snapshot) {
    if(disposed)return {available:false,state:null,reason:'FOOD_OWNER_DISPOSED'};
    hide();selection=selectCanonicalFoodState(snapshot);counts.selections++;
    if(!selection.available||!Object.hasOwn(stateGroups,selection.state)){
      selection={...selection,available:false,state:null};return {...selection};
    }
    if(contextLost)return {...selection,available:false,reason:'FOOD_CONTEXT_LOST'};
    try {
      if(!reservation.claimVisible())return {...selection,available:false,reason:'FOOD_OWNER_ALREADY_VISIBLE'};
      const visible=new Set(stateGroups[selection.state]);
      for(const group of root.children)group.visible=visible.has(group.name);
      root.visible=true;possiblyUploaded=true;
    } catch(error){hide();throw error;}
    return {...selection};
  }
  return {
    root,asset:PAINTED_FOOD_ASSET,resources,descriptor:PAINTED_FOOD_DESCRIPTOR,selectSnapshot:select,
    hide(){if(!disposed){hide();selection=null;}},dispose,
    contextLost(){if(disposed||contextLost)return false;contextLost=true;counts.contextLosses++;hide();return true;},
    contextRestored(snapshot){
      if(disposed||!contextLost)return false;
      // Reuse all CPU objects. A fresh authoritative snapshot must qualify the
      // state again; no stale automatic visibility and no second parse/copy.
      reservation.assertFits();contextLost=false;counts.contextRestorations++;return select(snapshot);
    },
    get diagnostics(){return {disposed,contextLost,...counts,state:selection?.state??null,
      visible:root?.visible??false,visibleGroups:root?.children.filter(g=>g.visible).map(g=>g.name)??[],
      position:root?.position.toArray()??null,scale:root?.scale.toArray()??null,
      runtimeActivated:false,presentationReady:false,visitAdmission:false};}
  };
}
