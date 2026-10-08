/** Ordinary Three/glTF skinning for the exact P2 rig. No AnimationMixer runs
 * alongside this driver. Navigation owns the single outer scene transform;
 * skeleton poses beneath it are root-relative and converted to parent-local.
 */
export function createMikaNativePoseDriver(THREE,gltf,calibration) {
  if(calibration?.sourceSha256?.['export-check/Mika-N1-continuous-bend-P2.glb']!=='2249774f8ced124451d3c46a8a69bc06a9889c7d9cc31c836a6dd868fd96f084')throw Error('UNQUALIFIED_MIKA_SKIN');
  const {Matrix4,Vector3,Group}=THREE,root=new Group();root.name='Mika navigation root';
  const model=gltf.scene,skinned=[],bones=new Map(),names=new Map();
  model.traverse(object=>{
    if(object.isBone){const node=gltf.parser.associations.get(object)?.nodes,name=gltf.parser.json.nodes[node]?.name;if(name){bones.set(name,object);names.set(object,name);}}
    if(object.isSkinnedMesh){skinned.push(object);object.frustumCulled=false;}
  });
  if(bones.size!==22||Object.keys(calibration.bones).some(name=>!bones.has(name))||!skinned.length)throw Error('MIKA_NATIVE_BONE_IDENTITY_MISMATCH');
  const owner=model.getObjectByName('Mika N1 continuous bend rig')||model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('Mika N1 continuous bend rig'));
  if(!owner||owner.isBone)throw Error('MIKA_NATIVE_ARMATURE_MISSING');
  for(const [name,bone]of bones)if((names.get(bone.parent)??null)!==calibration.parents[name])throw Error('MIKA_NATIVE_PARENT_MISMATCH');
  root.add(model);
  const C=new Matrix4().makeRotationX(-Math.PI/2),Y=new Vector3(0,1,0),skeletons=new Set(skinned.map(mesh=>mesh.skeleton));
  let disposed=false;
  function apply(sample) {
    if(disposed)throw Error('MIKA_NATIVE_DRIVER_DISPOSED');
    if(sample?.format!=='mika-locomotion-sample/v1'||sample.rootOwner!=='navigation'||sample.reachFailures?.length||Object.keys(sample.boneMatrices??{}).length!==22)throw Error('INVALID_MIKA_NATIVE_SAMPLE');
    const p=sample.root?.position;
    if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||!Number.isFinite(sample.root.heading))throw Error('INVALID_MIKA_NATIVE_ROOT');
    const converted={};
    // Validate the full pose before mutating the visible model.
    for(const name of bones.keys()) {
      const rows=sample.boneMatrices[name];
      if(!Array.isArray(rows)||rows.length!==4||!rows.every(row=>Array.isArray(row)&&row.length===4&&row.every(Number.isFinite)))throw Error('INVALID_MIKA_NATIVE_MATRIX');
      converted[name]=C.clone().multiply(new Matrix4().set(...rows.flat()));
    }
    root.position.set(p[0],p[2],-p[1]);root.quaternion.setFromAxisAngle(Y,sample.root.heading);root.scale.setScalar(1);
    // The GLB's baked translation track is intentionally not played. Keeping
    // its armature at identity prevents a second translation or heading owner.
    owner.position.set(0,0,0);owner.quaternion.identity();owner.scale.setScalar(1);
    root.updateMatrixWorld(true);
    const desired=Object.fromEntries(Object.entries(converted).map(([name,m])=>[name,root.matrixWorld.clone().multiply(m)]));
    for(const [name,bone]of bones) {
      const parentName=names.get(bone.parent),parent=parentName?desired[parentName]:bone.parent.matrixWorld;
      parent.clone().invert().multiply(desired[name]).decompose(bone.position,bone.quaternion,bone.scale);
    }
    root.updateMatrixWorld(true);for(const skeleton of skeletons)skeleton.update();
    return {rootGLTF:root.getWorldPosition(new Vector3()),boneCount:bones.size,rootOwner:'navigation'};
  }
  return {root,skinned,apply,dispose(){disposed=true;}};
}
