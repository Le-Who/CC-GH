import {applyPlanterInspectionPose} from './planter-inspection-pose.mjs';

/** Port of the existing native A2 continuous-location matrix adapter.
 * Inputs are the existing sampleMotion request plus style/anticipation/settle.
 * No route generation, authoritative clock, saved visit, or game mutation.
 */
export function createAdaptivePoseDriver(THREE, gltf, calibration, {unitsPerSource=12,sourceFrame=null}={}) {
  if (!Number.isFinite(unitsPerSource) || unitsPerSource <= 0) throw Error('Invalid actor world scale');
  if (calibration.sourceSha256 !== 'e9954b2edb59a8b6fb047a169bbf6791eb96546f3cc1e55058da69722c815539') throw Error('Unqualified Pip calibration');
  if (gltf.animations.length !== 1) throw Error('Expected one pinned A2 animation');
  const {Matrix4, Vector3, Quaternion, Euler, AnimationMixer, LoopOnce} = THREE;
  const matrix = rows => new Matrix4().set(...rows.flat());
  const rest = Object.fromEntries(Object.entries(calibration.restMatrices).map(([n, m]) => [n, matrix(m)]));
  const pivot = Object.fromEntries(Object.entries(rest).map(([n, m]) => [n, new Vector3().setFromMatrixPosition(m)]));
  const inverseRest = Object.fromEntries(Object.entries(rest).map(([n, m]) => [n, m.clone().invert()]));
  const C = new Matrix4().makeRotationX(-Math.PI / 2), inverseC = C.clone().invert();
  const bones = new Map(), meshSkeletons = new Set();
  gltf.scene.traverse(o => {
    if (o.isBone) {const i = gltf.parser.associations.get(o)?.nodes; if (i !== undefined) bones.set(gltf.parser.json.nodes[i].name, o);}
    if (o.isSkinnedMesh) meshSkeletons.add(o.skeleton);
  });
  if (bones.size !== 11 || Object.keys(rest).some(n => !bones.has(n))) throw Error('Pinned eleven-bone identity mismatch');
  const nameOf = new Map([...bones].map(([n, b]) => [b, n]));
  const underTorso = [...bones].filter(([, b]) => {for(let p=b;p;p=p.parent) if(nameOf.get(p)==='torso')return true; return false;}).map(([n])=>n);
  const mixer = new AnimationMixer(gltf.scene), action = mixer.clipAction(gltf.animations[0]);
  action.setLoop(LoopOnce, 1);action.clampWhenFinished = true;action.play();
  const T = v => new Matrix4().makeTranslation(v.x,v.y,v.z), Rz = a => new Matrix4().makeRotationZ(a);
  const c2 = u => {u=Math.max(0,Math.min(1,u));return u*u*u*(10+u*(-15+6*u));};
  function style(frame, removeDrift = true) {
    // Sampling the cached settle at4s clamps LoopOnce and pauses the action.
    // Re-arm it before every explicit sample, or later style reads stay frozen.
    action.paused=false;action.enabled=true;mixer.setTime(frame / 24);gltf.scene.updateMatrixWorld(true);
    // Recover the unchanged authored source frame before reading A2 style.
    const sourceFromWorld=sourceFrame?sourceFrame.matrixWorld.clone().invert():new Matrix4();
    const m=Object.fromEntries([...bones].map(([n,b])=>[n,inverseC.clone().multiply(sourceFromWorld).multiply(b.matrixWorld)]));
    const oldRoot=m.root.clone().multiply(inverseRest.root);
    if(removeDrift){
      const mh=m.hips.clone().multiply(inverseRest.hips),mt=m.torso.clone().multiply(inverseRest.torso);
      // Blender's XYZ Euler convention corresponds to Three's intrinsic ZYX.
      const q=mh.clone().invert().multiply(mt),e=new Euler().setFromRotationMatrix(q,'ZYX');e.z=0;
      const desired=mh.clone().multiply(T(pivot.torso)).multiply(new Matrix4().makeRotationFromEuler(e)).multiply(T(pivot.torso.clone().negate()));
      const fix=desired.multiply(mt.clone().invert());for(const n of underTorso)m[n].premultiply(fix);
    }
    const inv=oldRoot.invert();return Object.fromEntries(Object.entries(m).map(([n,v])=>[n,v.premultiply(inv)]));
  }
  const neutral=style(1,false),settled=style(96,false);
  let lastSourcePose=null,recoveryId=null,recoveryPose=null;
  function blend(a,b,u){const p=new Vector3(),q=new Quaternion(),s=new Vector3(),bp=new Vector3(),bq=new Quaternion(),bs=new Vector3();a.decompose(p,q,s);b.decompose(bp,bq,bs);return new Matrix4().compose(p.lerp(bp,u),q.slerp(bq,u),s.lerp(bs,u));}
  function apply(sample) {
    if (!Number.isFinite(sample?.styleFrame) || sample.styleFrame<1 || sample.styleFrame>96 || !sample.world?.feet) throw Error('Expected an existing calibrated motion sample');
    const {world}=sample,local=style(sample.styleFrame),root=new Vector3(world.root.x,world.root.y,world.root.z??0).divideScalar(unitsPerSource);
    const newRoot=T(root).multiply(Rz(world.heading+Math.PI/2)),a=c2(sample.anticipationU??1),u=c2(sample.settleU??0);
    const initial=sample.startsFromSettled===true?settled:neutral;
    let sourcePose=Object.fromEntries(Object.keys(rest).map(n=>[n,blend(blend(initial[n],local[n],a),settled[n],u)]));
    applyPlanterInspectionPose(THREE,sourcePose,sample.inspection);
    // A layout change preserves the displayed upper-body pose, then returns it
    // smoothly to settle. World sole targets below retain exact support.
    if(sample.poseRecovery){
      if(!Number.isFinite(sample.poseRecovery.u)||sample.poseRecovery.u<0||sample.poseRecovery.u>1)throw Error('Invalid pose recovery progress');
      if(recoveryId!==sample.poseRecovery.id){recoveryId=sample.poseRecovery.id;recoveryPose=lastSourcePose??sourcePose;}
      sourcePose=Object.fromEntries(Object.keys(rest).map(n=>[n,blend(recoveryPose[n],settled[n],c2(sample.poseRecovery.u))]));
    }else {recoveryId=null;recoveryPose=null;}
    lastSourcePose=sourcePose;
    const desired=Object.fromEntries(Object.entries(sourcePose).map(([n,m])=>[n,newRoot.clone().multiply(m)]));
    for(const[contract,native]of Object.entries(calibration.boneSideMap.contractToNative)){
      const foot=world.feet[contract],n='foot.'+native,target=new Vector3(foot.position.x,foot.position.y,foot.position.z).divideScalar(unitsPerSource);
      const sole=new Vector3(...calibration.feet[native].soleCenterSource);
      desired[n]=T(target).multiply(Rz(foot.heading+Math.PI/2)).multiply(T(sole.negate())).multiply(rest[n]);
    }
    const worldFromSource=sourceFrame?sourceFrame.matrixWorld.clone():new Matrix4();
    const targetWorld=Object.fromEntries(Object.entries(desired).map(([n,m])=>[n,worldFromSource.clone().multiply(C).multiply(m)]));
    // Tree traversal order guarantees parent assignment before child assignment.
    for(const[n,bone]of bones){
      const parentName=nameOf.get(bone.parent),parent=parentName?targetWorld[parentName]:bone.parent.matrixWorld;
      const localMatrix=parent.clone().invert().multiply(targetWorld[n]);localMatrix.decompose(bone.position,bone.quaternion,bone.scale);
    }
    gltf.scene.updateMatrixWorld(true);for(const skeleton of meshSkeletons)skeleton.update();
    return {rootSource:root,rootGLTF:root.clone().applyMatrix4(C).applyMatrix4(worldFromSource)};
  }
  function compareStyleSeam(){const left=style(29),right=style(44);return Math.max(...Object.keys(rest).filter(n=>!n.startsWith('foot.')).flatMap(n=>left[n].elements.map((v,i)=>Math.abs(v-right[n].elements[i]))));}
  function dispose(){mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);}
  return {apply,compareStyleSeam,dispose};
}
