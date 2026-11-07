import {PIP_GROUNDING_PREVIEW_RECIPE} from '../pip-preview-gate.mjs';

const freeze = value => { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; };
const recipes = freeze({
  baseline: {
    id: 'baseline', ambient: {color: [.78,.83,.93], intensity: .55},
    directional: [{color: [1,1,1], intensity: 1.8}, {color: [1,1,1], intensity: .76}, {color: [1,1,1], intensity: 1.2}],
    contact: {body: [.34,.44,.21], foot: [.13,.105,.29]},
  },
  [PIP_GROUNDING_PREVIEW_RECIPE]: {
    id: PIP_GROUNDING_PREVIEW_RECIPE, ambient: {color: [.86,.87,.82], intensity: .55},
    directional: [{color: [.99,.96,.88], intensity: 2.15}, {color: [.93,.96,1], intensity: .44}, {color: [1,.98,.94], intensity: .42}],
    contact: {body: [.39,.49,.29], foot: [.15,.12,.37]},
  },
});
export function pipGroundingRecipe(id = 'baseline') {
  if (typeof id !== 'string' || !Object.hasOwn(recipes, id)) throw Error('Unknown Pip grounding recipe');
  return recipes[id];
}

// Same four light objects, positions and tone mapping as the original owner.
// The qualified optional recipe changes only their linear colors/intensities.
export function createPipGardenLighting({THREE, scene, renderer, target, recipe = 'baseline'}) {
  let current = pipGroundingRecipe(recipe), disposed = false;
  renderer.toneMapping = THREE.NoToneMapping;
  const ambient = new THREE.AmbientLight(new THREE.Color().setRGB(...current.ambient.color, THREE.LinearSRGBColorSpace), current.ambient.intensity);
  const lights = [ambient], owned = [ambient]; scene.add(ambient);
  for (const [i, position] of [[-2.4,4,3],[2.5,2.4,1.7],[0,2.8,-2]].entries()) {
    const profile = current.directional[i], light = new THREE.DirectionalLight(0xffffff, profile.intensity);
    light.color.setRGB(...profile.color, THREE.LinearSRGBColorSpace);
    light.position.copy(target).add(new THREE.Vector3(...position)); light.target.position.copy(target);
    scene.add(light, light.target); lights.push(light); owned.push(light, light.target);
  }
  return {
    setRecipe(id) {
      if (disposed) return false;
      const next = pipGroundingRecipe(id), profiles = [next.ambient, ...next.directional];
      lights.forEach((light, i) => { light.color.setRGB(...profiles[i].color, THREE.LinearSRGBColorSpace); light.intensity = profiles[i].intensity; });
      current = next; return true;
    },
    get diagnostics() { return {recipe: current.id, disposed, lights: lights.map(light => ({color: light.color.toArray(), intensity: light.intensity, position: light.position.toArray(), target: light.target?.position.toArray() ?? null}))}; },
    dispose() { if (disposed) return; disposed = true; owned.forEach(light => scene.remove(light)); },
  };
}
