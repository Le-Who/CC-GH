import {PIP_QUALITY_COPY, pipQualityResourceFields, validPipQualityResourceFields} from './pip-quality-resources.mjs';

// The source is the already output-encoded, premultiplied default framebuffer.
// Raw GLSL3 + texelFetch avoids interpolation and a second color conversion.
export const PIP_QUALITY_VERTEX = `precision highp float;
in vec3 position;
void main(){gl_Position=vec4(position,1.0);}`;
export const PIP_QUALITY_FRAGMENT = `precision highp float;
precision highp int;
uniform highp sampler2D sourceColor;
uniform int exterior;
out vec4 result;
vec4 at(ivec2 p){return texelFetch(sourceColor,clamp(p,ivec2(0),ivec2(389,647)),0);}
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  vec4 c=at(p);
  result=c;
  if(exterior==0||c.a==0.0)return;
  vec4 n=at(p+ivec2(0,1)),s=at(p-ivec2(0,1));
  vec4 e=at(p+ivec2(1,0)),w=at(p-ivec2(1,0));
  // Only existing coverage next to a zero-alpha texel is eligible. Opaque
  // interiors (eyes/fur) and zero-alpha exteriors are exactly copied. No new
  // supported pixel, borrowed color, outward fringe, or silhouette expansion.
  if(min(min(n.a,s.a),min(e.a,w.a))>0.0)return;
  float bounded=min(c.a,(4.0*c.a+n.a+s.a+e.a+w.a)/8.0);
  float alpha=mix(c.a,bounded,0.35);
  // Adjust existing premultiplied coverage only; never multiply RGB by alpha
  // a second time. Visual benefit still requires the real GPU A/B gate.
  result=vec4(c.rgb*(alpha/c.a),alpha);
}`;

export function createPipQualityCopy(THREE, {renderer, canvas, admittedResources} = {}) {
  if (!validPipQualityResourceFields(admittedResources ?? {}) ||
      admittedResources?.qualityProbeVersion !== PIP_QUALITY_COPY.version ||
      Object.entries(pipQualityResourceFields('identity')).some(([k, v]) => admittedResources[k] !== v)) {
    throw Error('Quality copy requires an admitted resource row');
  }
  if (typeof renderer?.copyFramebufferToTexture !== 'function' || !renderer.info?.render) throw Error('Quality copy requires actual renderer counters and framebuffer copy');
  let texture, geometry, material, scene, camera, disposed = false, copies = 0, draws = 0;
  const checkRaster = () => {
    if (canvas?.width !== PIP_QUALITY_COPY.width || canvas?.height !== PIP_QUALITY_COPY.height || renderer.getRenderTarget() !== null) throw Error('Quality copy requires the fixed default framebuffer');
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    texture?.dispose(); geometry?.dispose(); material?.dispose(); scene?.clear();
    texture = geometry = material = scene = camera = null;
    renderer = canvas = null;
  }
  try {
    checkRaster();
    texture = new THREE.FramebufferTexture(PIP_QUALITY_COPY.width, PIP_QUALITY_COPY.height);
    texture.name = 'Pip admitted quality framebuffer copy';
    texture.format = THREE.RGBAFormat; texture.type = THREE.UnsignedByteType;
    texture.internalFormat = 'RGBA8'; texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false; texture.flipY = false; texture.premultiplyAlpha = false;
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: PIP_QUALITY_VERTEX, fragmentShader: PIP_QUALITY_FRAGMENT,
      uniforms: {sourceColor: {value: texture}, exterior: {value: 0}},
      blending: THREE.NoBlending, transparent: false, depthTest: false, depthWrite: false,
      toneMapped: false, dithering: false, premultipliedAlpha: false,
    });
    const triangle = new THREE.Mesh(geometry, material); triangle.frustumCulled = false;
    scene = new THREE.Scene(); scene.add(triangle); camera = new THREE.Camera();
  } catch (error) { dispose(); throw error; }
  return {
    render(mode) {
      if (disposed) return false;
      if (!['identity', 'exterior'].includes(mode)) throw Error('Unknown quality copy mode');
      checkRaster();
      material.uniforms.exterior.value = mode === 'exterior' ? 1 : 0;
      const autoClear = renderer.autoClear, autoReset = renderer.info.autoReset;
      try {
        // GL command order completes the original render before this copy.
        // No CPU readback, fence wait, extra target, depth, or new canvas.
        renderer.copyFramebufferToTexture(texture); copies++;
        renderer.autoClear = false; renderer.info.autoReset = false;
        renderer.render(scene, camera); draws++;
      } finally {
        renderer.autoClear = autoClear; renderer.info.autoReset = autoReset;
      }
      return true;
    },
    dispose,
    get diagnostics() { return {version: PIP_QUALITY_COPY.version, disposed, copies, draws,
      fixedRaster: [PIP_QUALITY_COPY.width, PIP_QUALITY_COPY.height],
      textureAllocations: 1, colorBytes: PIP_QUALITY_COPY.colorBytes, colorPeakBytes: PIP_QUALITY_COPY.colorPeakBytes,
      GPUIdentityQualified: false, pixelAppearanceQualified: false, driverAndProgramOverheadKnown: false}; },
  };
}
