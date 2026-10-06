import {RENDER_UNITS_TO_CANONICAL} from '../world-scale.mjs';

// One immutable XZ quad, three analytical lobes, no image, render target or
// shadow map. The existing resource owner admits it before allocating it.
export const PIP_CONTACT_SHADOW = Object.freeze({
  version: 'pip-flat-ground-contact-v1', geometryCPUBytes: 60,
  geometryGPUBytes: 60, pendingCPUBytes: 0, imageTextureBytes: 0,
  drawPrimitives: 1, triangles: 2, groundY: .015 / RENDER_UNITS_TO_CANONICAL,
});

export function createPipContactShadow(THREE, {actorUnitsPerSource} = {}) {
  if (![12, 16].includes(actorUnitsPerSource)) throw Error('Unqualified contact shadow scale');
  const scale = actorUnitsPerSource / RENDER_UNITS_TO_CANONICAL;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, 0, -1, -1, 0, 1, 1, 0, 1, 1, 0, -1,
  ]), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  // Individual vectors avoid typed uniform-array copies on each submission.
  const uniforms = {
    body: {value: new THREE.Vector4()}, left: {value: new THREE.Vector4()}, right: {value: new THREE.Vector4()},
    bodyAxis: {value: new THREE.Vector2()}, leftAxis: {value: new THREE.Vector2()}, rightAxis: {value: new THREE.Vector2()},
    strength: {value: new THREE.Vector3()},
  };
  const material = new THREE.ShaderMaterial({transparent: true, depthWrite: false, depthTest: true, toneMapped: false, uniforms,
    vertexShader: 'varying vec2 groundXZ; void main(){vec4 world=modelMatrix*vec4(position,1.0);groundXZ=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}',
    fragmentShader: `varying vec2 groundXZ;
      uniform vec4 body,left,right;
      uniform vec2 bodyAxis,leftAxis,rightAxis;
      uniform vec3 strength;
      float lobe(vec4 oval,vec2 axis){
        vec2 delta=groundXZ-oval.xy;
        vec2 local=vec2(dot(delta,axis),dot(delta,vec2(-axis.y,axis.x)))/oval.zw;
        return 1.0-smoothstep(.12,1.0,length(local));
      }
      void main(){
        float a=1.0-(1.0-strength.x*lobe(body,bodyAxis))*(1.0-strength.y*lobe(left,leftAxis))*(1.0-strength.z*lobe(right,rightAxis));
        gl_FragColor=vec4(.16,.11,.055,a);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Pip bounded flat-ground contact';
  mesh.position.y = PIP_CONTACT_SHADOW.groundY;
  mesh.renderOrder = -1;
  mesh.visible = false;
  let state = null, recipe = 'baseline';
  const profiles = Object.freeze({
    baseline: Object.freeze({bodyX: .34, bodyZ: .44, bodyStrength: .21, footX: .13, footZ: .105, footStrength: .29}),
    'pip-garden-grounding-v1': Object.freeze({bodyX: .39, bodyZ: .49, bodyStrength: .29, footX: .15, footZ: .12, footStrength: .37}),
  });
  function setRecipe(value) {
    if (!Object.hasOwn(profiles, value)) throw Error('Unknown bounded grounding recipe');
    recipe = value;
  }
  function update(sample) {
    const profile = profiles[recipe];
    const world = sample.world, feet = [world.feet.L, world.feet.R];
    // This owner is qualified only for the current flat-ground toddle. Do not
    // leave a false floor contact under any future raised support or cushion.
    const flatSupport = feet.some(f => f.planted && Math.abs(f.position.z) <= 1e-6)
      && feet.every(f => !f.planted || Math.abs(f.position.z) <= 1e-6);
    mesh.visible = flatSupport;
    const rootX = world.root.x / RENDER_UNITS_TO_CANONICAL, rootZ = -world.root.y / RENDER_UNITS_TO_CANONICAL;
    const axis = (target, heading) => target.set(Math.cos(heading), -Math.sin(heading));
    // Small diffuse body offset goes away from the existing upper-left key.
    // The paw lobes remain centred on the actual sole goals, with no screen-Y offset.
    uniforms.body.value.set(rootX + .02 * scale, rootZ - .025 * scale, profile.bodyX * scale, profile.bodyZ * scale);
    axis(uniforms.bodyAxis.value, world.heading);
    uniforms.strength.value.x = profile.bodyStrength / (1 + Math.max(0, world.root.z ?? 0) / actorUnitsPerSource * 4);
    for (let i = 0; i < feet.length; i++) {
      const foot = feet[i], height = Math.max(0, foot.position.z / RENDER_UNITS_TO_CANONICAL);
      const oval = uniforms[i === 0 ? 'left' : 'right'].value;
      oval.set(foot.position.x / RENDER_UNITS_TO_CANONICAL, -foot.position.y / RENDER_UNITS_TO_CANONICAL,
        profile.footX * scale + height * .7, profile.footZ * scale + height * .7);
      axis(uniforms[i === 0 ? 'leftAxis' : 'rightAxis'].value, foot.heading);
      uniforms.strength.value.setComponent(i + 1, profile.footStrength * Math.exp(-height / (.025 * scale)));
    }
    // A conservative axis-aligned quad bounds all lobes. Its buffers are never
    // replaced as the actor moves, turns, or switches support feet.
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const oval of [uniforms.body.value, uniforms.left.value, uniforms.right.value]) {
      const radius = Math.max(oval.z, oval.w);
      minX = Math.min(minX, oval.x - radius); minZ = Math.min(minZ, oval.y - radius);
      maxX = Math.max(maxX, oval.x + radius); maxZ = Math.max(maxZ, oval.y + radius);
    }
    mesh.position.set((minX + maxX) / 2, PIP_CONTACT_SHADOW.groundY, (minZ + maxZ) / 2);
    mesh.scale.set((maxX - minX) / 2, 1, (maxZ - minZ) / 2);
    mesh.updateMatrixWorld(true);
    state = {flatSupport, groundY: PIP_CONTACT_SHADOW.groundY};
  }
  return {mesh, update, setRecipe, get diagnostics() {
    return {...state, recipe, version: PIP_CONTACT_SHADOW.version,
      body: uniforms.body.value.toArray(), left: uniforms.left.value.toArray(), right: uniforms.right.value.toArray(),
      bodyAxis: uniforms.bodyAxis.value.toArray(), leftAxis: uniforms.leftAxis.value.toArray(), rightAxis: uniforms.rightAxis.value.toArray(),
      strength: uniforms.strength.value.toArray(), pixelAppearanceQualified: false};
  }};
}
