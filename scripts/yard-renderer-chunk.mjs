/** Clean scene owner/data boundary, loaded with the lazy Yard route.
 * This code is never data-only and retains the normal game chunk budget. */
import path from 'node:path';
export const YARD_RENDERER_MODULES = new Set([
  'presentation-clock.mjs', 'canonical-presentation.mjs', 'scene-owner.mjs',
].map(name => `src/games/companion-yard-v2/${name}`));
// Pure canonical geometry, capability projection and render settings are shared
// by the React controls and clean scene. Their previous automatic ownership in
// CourtyardGame formed clean-core -> React -> clean-core and scene -> React.
// Startup-safe wire protocols remain in their existing small shared owners.
export const YARD_CLEAN_DEPENDENCY_MODULES = new Set([
  'game-logic/yard-catalog.js',
  'game-logic/yard-v2/canonical-location-geometry.json',
  'game-logic/yard-v2/canonical-locations.mjs',
  'game-logic/yard-v2/canonical-visit-placement-contract.mjs',
  'game-logic/yard-v2/canonical-food-contract.mjs',
  'src/game-state/canonicalYardItems.mjs',
  'src/games/companion-yard-v2/pip-prototype/render-quality-profile.mjs',
  'src/games/companion-yard-v2/pip-preview-gate.mjs',
]);
// Shared static runtime/calibration dependencies must not be owned by the
// React entry: the renderer imports them too. Keep this executable closure
// separate to prevent renderer -> React entry -> renderer initialization cycles.
export const YARD_RUNTIME_CORE_MODULES = new Set([
  'game-logic/yard-v2/actor-profiles.mjs',
  'game-logic/yard-v2/catalog.mjs',
  'game-logic/yard-v2/family-actor-profile.mjs',
  'game-logic/yard-v2/food-media.mjs',
  'game-logic/yard-v2/geometry.mjs',
  'game-logic/yard-v2/ground-coverage.mjs',
  'game-logic/yard-v2/intrinsic-props.mjs',
  'game-logic/yard-v2/media/ground-rest.mjs',
  'game-logic/yard-v2/media/mika-actor-assets.mjs',
  'game-logic/yard-v2/media/mika-clips.mjs',
  'game-logic/yard-v2/media/runtime-version.mjs',
  'game-logic/yard-v2/media/settled-mouse.mjs',
  'game-logic/yard-v2/media/stay-schedule.mjs',
  'game-logic/yard-v2/media/stride-routes.mjs',
  'game-logic/yard-v2/media/walk-phase-lookup.mjs',
  'game-logic/yard-v2/mika-item-geometry.mjs',
  'game-logic/yard-v2/mika-media.mjs',
  'game-logic/yard-v2/mochi-actor-profile.mjs',
  'game-logic/yard-v2/motion-ground-guard.mjs',
  'game-logic/yard-v2/pebble-actor-profile.mjs',
  'game-logic/yard-v2/pip-actor-profile.mjs',
  'game-logic/yard-v2/pip-prop-profile.mjs',
  'game-logic/yard-v2/prop-obstacles.mjs',
  'game-logic/yard-v2/released-actor-profiles.mjs',
  'game-logic/yard-v2/released-prop-profiles.mjs',
  'game-logic/yard-v2/util.mjs',
  'game-logic/yard-v2/visit-reservations.mjs',
]);
// Pure optional motion is executable game code in its own bounded chunk.
// Sharing it avoids a scene/controller initialization cycle and retains all budgets.
export const YARD_CANONICAL_MOTION_MODULES = new Set([
  'dynamic-navigation.mjs','dynamic-trajectory.mjs','dynamic-prop-planner.mjs',
  'dynamic-prop-controller.mjs','dynamic-prop-worker-client.mjs',
  'data/interaction-leaf-anchors.json','world-scale.mjs',
  'motion/math.mjs','motion/trajectory.mjs','motion/kinematics.mjs','motion/polygon-domain.mjs',
  'prototype/planter-inspection-pose.mjs',
].map(name=>`src/games/companion-yard-v2/pip-prototype/${name}`));
export function yardRendererChunk(id, root) {
  const source = path.relative(root, id.split('?')[0]).replaceAll('\\', '/');
  // Receipt validation needs only this small pure hash implementation at boot.
  // Keep it shared without making the whole lazy Yard runtime an eager import.
  if (source === 'game-logic/yard-v2/sha256.mjs') return 'yard-wire-hash';
  // Pure camera/raster math stays lazy executable game code, never data/vendor.
  // Its leaf raster import avoids a projection -> scene resource-owner cycle.
  if (['projection.mjs', 'garden-raster.mjs'].some(name =>
    source === `src/games/companion-yard-v2/pip-prototype/${name}`)) return 'yard-pip-projection';
  if (YARD_CANONICAL_MOTION_MODULES.has(source)) return 'yard-canonical-motion';
  if (['ui-image-inventory.json', 'ui-image-reserve.mjs', 'decoded-capacity.mjs', 'runtime-cells.mjs']
    .some(name => source === `src/games/companion-yard-v2/${name}`)) return 'yard-scene-resources';
  if (YARD_RENDERER_MODULES.has(source)) return 'yard-clean-core';
  if (YARD_CLEAN_DEPENDENCY_MODULES.has(source)) return 'yard-clean-domain';
  return YARD_RUNTIME_CORE_MODULES.has(source) ? 'yard-runtime-core' : undefined;
}
