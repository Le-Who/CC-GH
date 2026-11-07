/** Texture-free authored succulent T2, reconstructed source after workspace reset.
 * Asset is already canonical /12,+Y up. Its GLB was recovered byte-identically.
 */
export const PLANTER_ASSET=Object.freeze({
 id:'yard-succulent-T2',sha256:'c2f7c317511cfd84605bde3f6e32ffd24d35ee66a3d8bc365ae8d0742557f3fd',
 glbBytes:120776,binaryBufferBytes:115224,bufferViewCopiesBytes:115224,
 knownCPUBufferPeakBytes:351224,geometryGPUBufferBytes:115224,
 imageTextureBytes:0,materials:5,drawPrimitives:5,triangles:6244,
 groundPivotLocalCanonical:[0,0,0],navigationRadiusCanonical:4.65,
 fullBoundsCanonicalXYZ:{min:[-4.0000001192092896,-4.184766411781311,0],max:[4.289892196655273,4.0000001192092896,10.996111392974854]},
 foliageRadiusCanonical:4.607670313204411,potRimRadiusCanonical:4,potHeightCanonical:5.5,
 contactRadiusCanonical:2.45,shadowGeometryBytes:140,shadowTriangles:2,shadowDrawPrimitives:1
});
export async function createCalibratedPlanter(THREE,{descriptor,placement=descriptor?.groundPivotCanonical,loader,loadAssetBytes,signal}={}){
 if(descriptor?.id!=='planter'||descriptor.geometryRevision!==PLANTER_ASSET.id||descriptor.footprintDiameter!==8||descriptor.potHeight!==5.5||descriptor.foliageDiameter!==9.3||descriptor.height!==11||descriptor.navigationRadiusCanonical!==4.65)throw Error('Unqualified succulent descriptor');
 if(!loader?.parseAsync||typeof loadAssetBytes!=='function')throw Error('Explicit admitted planter loader and bytes owner required');
 signal?.throwIfAborted();
 const bytes=await loadAssetBytes();signal?.throwIfAborted();if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==PLANTER_ASSET.glbBytes)throw Error('Planter asset byte identity mismatch');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==PLANTER_ASSET.sha256)throw Error('Planter asset hash mismatch');
 signal?.throwIfAborted();
 const gltf=await loader.parseAsync(bytes,''),json=gltf.parser.json;
 try {
 signal?.throwIfAborted();
 if((json.images?.length??0)||(json.animations?.length??0)||(json.skins?.length??0)||json.materials.length!==5||json.buffers.length!==1||json.buffers[0].byteLength!==115224)throw Error('Unexpected planter payload');
 const root=gltf.scene;root.name='Authored terracotta succulent T2';const box=new THREE.Box3().setFromObject(root);
 const expectedMin=[-4.0000001192092896/12,0,-4.0000001192092896/12],expectedMax=[4.289892196655273/12,10.996111392974854/12,4.184766411781311/12];
 for(let i=0;i<3;i++)if(Math.abs(box.min.getComponent(i)-expectedMin[i])>1e-6||Math.abs(box.max.getComponent(i)-expectedMax[i])>1e-6)throw Error('Planter bounds changed');
 root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
 const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:'varying vec2 vUv; void main(){float r=length(vUv*2.0-1.0);float a=.24*(1.0-smoothstep(.35,1.0,r));gl_FragColor=vec4(.16,.11,.055,a);\n#include <colorspace_fragment>\n}'});
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(6.7/12,6.7/12),shadowMaterial);shadow.name='T2 bounded contact lobe';shadow.rotation.x=-Math.PI/2;shadow.position.y=.015/12;shadow.renderOrder=-1;root.add(shadow);
 function move(p){if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||p[2]!==0)throw Error('Expected flat canonical ground placement');root.position.set(p[0]/12,p[2]/12,-p[1]/12);root.updateMatrixWorld(true);}
 move(placement);return{root,move,source:'Original authored terracotta succulent mesh, candidate T2; no textures or third-party assets.',footprintDiameterCanonical:8,foliageDiameterCanonical:9.3,heightCanonical:11,navigationRadiusCanonical:4.65,asset:PLANTER_ASSET,qualityStatus:'native-views-reviewed before workspace replacement; integrated browser appearance/contact unreviewed'};
 } catch(error) {
  // Parsing may finish after cancellation; this function owns that late result.
  const geometries=new Set(),materials=new Set();
  gltf.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
  gltf.scene.clear();throw error;
 }
}
