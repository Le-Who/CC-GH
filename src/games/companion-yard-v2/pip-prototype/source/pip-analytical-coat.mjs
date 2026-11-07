// Optional, disabled-by-default material adapter. No engine import, network,
// renderer allocation, registration, or global mutation occurs on module load.
// Prepared for three@0.186.1; GPU compilation and final lighting are untested.
export const PIP_PRIVATE_GLB_SHA256 = '74edd9400bcb69266ce670c977f05bf3ae8c62b448877f4ee34967565815c45b';
export const PIP_COAT_MATERIAL_NAME = 'Pip approved coat - bounded linear vertex-color bake';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const palette = ['FFA42D', 'FFF0D4', 'F4A393'].map(hex => [0, 2, 4].map(i => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
}));

// CPU reference for numerical/accessor checks only; the material computes the
// coat per fragment to preserve smooth boundaries between vertices.
export function evaluatePipRestCoat([x, y, z]) {
  const ellipse = (cx, cz, rx, rz) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
  const d = Math.min(ellipse(0, .255, .351, .375), ellipse(0, .484, .26, .165),
    ellipse(-.147, .615, .181, .067), ellipse(.147, .615, .181, .067), ellipse(0, .651, .085, .044));
  const front = smooth(.02, -.095, y), ax = Math.abs(x);
  let coat = (1 - smooth(.955, 1.045, d)) * front;
  const arm = (((ax - .333) / .076) ** 2 + ((z - .455) / .111) ** 2);
  coat *= 1 - (1 - smooth(.6, 1.2, arm)) * smooth(-.065, -.16, y);
  const bd = ((ax - .199) / .05) ** 2 + ((z - .642) / .022) ** 2;
  const blush = (1 - smooth(.05, 1.35, bd)) * front * .57;
  return palette[0].map((v, i) => (v * (1 - coat) + palette[1][i] * coat) * (1 - blush) + palette[2][i] * blush);
}

// Explicit caller activation only. Caller has verified the GLB bytes and chosen
// its body material. A full Yard draw hook / WebGL owner is deliberately absent.
// The returned callback restores original material behavior. SSS is unresolved.
export function installPipAnalyticalCoat(material, { glbSha256, fragmentHelper } = {}) {
  if (glbSha256 !== PIP_PRIVATE_GLB_SHA256) throw Error('Pip coat adapter is pinned to a different GLB');
  if (!material?.isMeshStandardMaterial || material.name !== PIP_COAT_MATERIAL_NAME) throw Error('Expected the pinned Pip body PBR material');
  if (typeof fragmentHelper !== 'string' || !fragmentHelper.includes('vec3 pipApprovedCoat(vec3 p)')) throw Error('Missing analytical coat fragment helper');
  const before = { vertexColors: material.vertexColors, onBeforeCompile: material.onBeforeCompile, customProgramCacheKey: material.customProgramCacheKey };
  material.vertexColors = false;
  material.onBeforeCompile = function (shader, renderer) {
    before.onBeforeCompile?.call(this, shader, renderer);
    if (!shader.vertexShader.includes('#include <begin_vertex>') || !shader.fragmentShader.includes('#include <color_fragment>')) {
      throw Error('Unqualified Three shader layout; keep the fallback material');
    }
    shader.vertexShader = 'varying vec3 vPipRestPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPipRestPosition = vec3(position.x, -position.z, position.y);');
    shader.fragmentShader = 'varying vec3 vPipRestPosition;\n' + fragmentHelper + '\n' + shader.fragmentShader.replace('#include <color_fragment>',
      'diffuseColor.rgb = pipApprovedCoat(vPipRestPosition);');
  };
  material.customProgramCacheKey = function () {
    return `${before.customProgramCacheKey?.call(this) || ''}:pip-rest-coat-v1:${glbSha256}`;
  };
  material.needsUpdate = true;
  let restored = false;
  return function restore() {
    if (restored) return;
    restored = true;
    Object.assign(material, before);
    material.needsUpdate = true;
  };
}
