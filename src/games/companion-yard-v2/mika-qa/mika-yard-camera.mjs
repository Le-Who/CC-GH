/** Match the released Canvas2D affine camera exactly. Never fit the actor. */
export function configureMikaYardCamera(THREE,camera,projection,direction) {
 if(!projection||![projection.width,projection.height,projection.ppu].every(v=>Number.isFinite(v)&&v>0)||!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite))throw Error('INVALID_NORMAL_YARD_CAMERA');
 const origin={x:50,y:66,z:0},at=projection.project(origin),target=new THREE.Vector3(origin.x/8,0,-origin.y/8),offset=new THREE.Vector3(direction[0],direction[2],-direction[1]);
 camera.position.copy(target).add(offset);camera.up.set(0,1,0);camera.lookAt(target);
 Object.assign(camera,{left:-at.x/projection.ppu,right:(projection.width-at.x)/projection.ppu,top:at.y/projection.ppu,bottom:(at.y-projection.height)/projection.ppu,near:.05,far:200});
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 return {kind:'released-normal-yard-affine',sourceToLogical:8,actorFit:false};
}
