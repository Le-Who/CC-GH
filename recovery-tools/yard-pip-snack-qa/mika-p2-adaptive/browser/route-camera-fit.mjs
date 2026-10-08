/** Diagnostic-only, once-per-route camera fit. It never changes root, gait,
 * camera direction or mesh visibility and is not a production Yard camera.
 * The finite pose envelope plus padding is checked again by actual pixels/QA.
 */
export function fitMikaRouteCamera(THREE,{camera,driver,sampleAt,duration=4,steps=48,padding=.2}) {
  if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(steps)||steps<1||steps>96||!Number.isFinite(padding)||padding<=0)throw Error('INVALID_MIKA_CAMERA_FIT');
  camera.updateMatrixWorld(true);
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity],v=new THREE.Vector3();let vertices=0;
  for(let i=0;i<=steps;i++) {
    driver.apply(sampleAt(duration*i/steps));
    driver.root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      for(let j=0;j<mesh.geometry.attributes.position.count;j++) {
        mesh.getVertexPosition(j,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);vertices++;
        min[0]=Math.min(min[0],v.x);max[0]=Math.max(max[0],v.x);min[1]=Math.min(min[1],v.y);max[1]=Math.max(max[1],v.y);
      }
    });
  }
  if(![...min,...max].every(Number.isFinite))throw Error('EMPTY_MIKA_CAMERA_ENVELOPE');
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(right,(min[0]+max[0])/2).addScaledVector(up,(min[1]+max[1])/2);camera.updateMatrixWorld(true);
  driver.apply(sampleAt(0));
  return Object.freeze({minimumWidth:max[0]-min[0]+2*padding,minimumHeight:max[1]-min[1]+2*padding,samples:steps+1,vertices,padding,scope:'diagnostic fixed full-route mesh envelope; not Yard camera qualification'});
}
