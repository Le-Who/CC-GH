/** Dimensional depth proxy from the existing native clean-location blockout.
 * Source: build_native_blockout.py, cylinder48 + UV sphere24×12.
 * Canonical dimensions /12 produce Pip source units; glTF is +Y up.
 * This is unreviewed dimensional proxy art, not the generated prop silhouette.
 */
export function createCalibratedPlanter(THREE,{descriptor,placement=descriptor?.groundPivotCanonical}={}){
  if(descriptor?.id!=='planter'||descriptor.footprintDiameter!==8||descriptor.potHeight!==5.5||descriptor.foliageDiameter!==11||descriptor.height!==11)throw Error('Unqualified planter dimensions');
  const root=new THREE.Group();root.name='Private calibrated planter depth proxy';
  const potMaterial=new THREE.MeshStandardMaterial({roughness:.8,metalness:0});potMaterial.color.setRGB(.6,.32,.17,THREE.LinearSRGBColorSpace);
  const leavesMaterial=new THREE.MeshStandardMaterial({roughness:.8,metalness:0});leavesMaterial.color.setRGB(.31,.46,.2,THREE.LinearSRGBColorSpace);
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(4/12,4/12,5.5/12,48),potMaterial);pot.position.y=2.75/12;pot.name='Solid planter body';
  const leaves=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),leavesMaterial);leaves.scale.set(5.5/12,2.75/12,5.5/12);leaves.position.y=8.25/12;leaves.name='Planter foliage occlusion proxy';
  root.add(pot,leaves);
  function move(p){if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||p[2]!==0)throw Error('Expected a flat canonical ground placement');root.position.set(p[0]/12,p[2]/12,-p[1]/12);root.updateMatrixWorld(true);}
  move(placement);return{root,move,source:'Existing native dimensional blockout; shape dimensions retained, topology produced by Three primitives.',
    footprintDiameterCanonical:8,foliageDiameterCanonical:11,heightCanonical:11};
}
