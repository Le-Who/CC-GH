/** Bounded additive gesture in the unchanged calibrated source skeleton.
 * The adapter assigns measured feet after this hook; no sole can inherit a lean.
 * All operations are rigid bone transforms, with no vertex or bone scale edits.
 */
export function applyPlanterInspectionPose(THREE,pose,gesture){
  if(!gesture)return pose;
  if(gesture.version!=='pip-planter-inspection/experimental-v1')throw Error('Unknown Pip inspection gesture');
  for(const k of ['anticipate','lean','sniff','curiosity','earFollow','earSniff'])if(!Number.isFinite(gesture[k])||gesture[k]<0||gesture[k]>1+1e-9)throw Error('Out-of-range Pip inspection channel');
  if(![-1,1].includes(gesture.attentionSide))throw Error('Unknown attention side');
  if(['anticipate','lean','sniff','curiosity','earFollow','earSniff'].every(k=>gesture[k]===0))return pose;
  if(!Array.isArray(gesture.focusSource)||gesture.focusSource.length!==3||!gesture.focusSource.every(Number.isFinite))throw Error('Measured leaf focus required');
  const {Matrix4,Vector3}=THREE,{anticipate,lean,sniff,curiosity,earFollow,earSniff,attentionSide}=gesture;
  const T=(x,y,z)=>new Matrix4().makeTranslation(x,y,z);
  const apply=(names,m)=>names.forEach(n=>pose[n].premultiply(m));
  const pivot=(name,rx=0,ry=0,rz=0)=>{
    const p=new Vector3().setFromMatrixPosition(pose[name]);
    return T(p.x,p.y,p.z).multiply(new Matrix4().makeRotationZ(rz)).multiply(new Matrix4().makeRotationY(ry)).multiply(new Matrix4().makeRotationX(rx)).multiply(T(-p.x,-p.y,-p.z));
  };
  const body=['hips','torso','head','ear.L','ear.R','arm.L','arm.R','tail'];
  const upper=['torso','head','ear.L','ear.R','arm.L','arm.R'];
  // Source forward is -Y. Both support paws remain fixed in canonical space.
  apply(body,T(0,.014*anticipate-.032*lean-.004*sniff,-.01*lean+.003*sniff));
  apply(body,pivot('hips',.018*lean));
  apply(upper,pivot('torso',.055*lean+.009*sniff));
  // Align the inherited A2 head toward the real leaf in the source frame. The
  // tiny sniff nod remains additive. Large off-axis targets are not supported.
  const headPosition=new Vector3().setFromMatrixPosition(pose.head);
  const aim=new Vector3(...gesture.focusSource).sub(headPosition).normalize();
  const forward=new Vector3(0,-1,0).transformDirection(pose.head);
  const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const yaw=angle(Math.atan2(aim.x,-aim.y)-Math.atan2(forward.x,-forward.y));
  const pitch=Math.atan2(-aim.z,Math.hypot(aim.x,aim.y))-Math.atan2(-forward.z,Math.hypot(forward.x,forward.y));
  if(Math.abs(yaw)>.18||Math.abs(pitch)>.18)throw Error('Leaf focus exceeds admitted head attention range');
  apply(['head','ear.L','ear.R'],pivot('head',pitch*lean+.026*sniff,.035*curiosity*attentionSide,yaw*lean));
  apply(['ear.L'],pivot('ear.L',-.075*earFollow+.027*earSniff,0,.018*curiosity*attentionSide));
  apply(['ear.R'],pivot('ear.R',-.105*earFollow+.038*earSniff,0,.026*curiosity*attentionSide));
  // Forepaws stay tucked close; tiny counter-rotation avoids a rigid torso slab.
  apply(['arm.L'],pivot('arm.L',-.025*lean));
  apply(['arm.R'],pivot('arm.R',-.022*lean));
  return pose;
}
