/** Executable canvas-renderer boundary, loaded with the lazy Yard route.
 * This code is never data-only and retains the normal game chunk budget. */
import path from 'node:path';
export const YARD_RENDERER_MODULES = new Set([
  'actor-media.mjs', 'atlas-policy.mjs', 'atlas.mjs', 'edge-opacity.mjs',
  'pose-selection.mjs', 'presentation-clock.mjs', 'presentation.mjs',
  'projection.mjs', 'scene.mjs', 'telemetry.mjs', 'scene-layout.mjs', 'legacy-m2-background.mjs',
].map(name => `src/games/companion-yard-v2/${name}`));
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
  'game-logic/yard-v2/mika-media.mjs',
  'game-logic/yard-v2/mochi-actor-profile.mjs',
  'game-logic/yard-v2/motion-ground-guard.mjs',
  'game-logic/yard-v2/pebble-actor-profile.mjs',
  'game-logic/yard-v2/pip-actor-profile.mjs',
  'game-logic/yard-v2/pip-prop-profile.mjs',
  'game-logic/yard-v2/prop-obstacles.mjs',
  'game-logic/yard-v2/released-actor-profiles.mjs',
  'game-logic/yard-v2/released-prop-profiles.mjs',
  'game-logic/yard-v2/sha256.mjs',
  'game-logic/yard-v2/util.mjs',
  'game-logic/yard-v2/visit-reservations.mjs',
]);
export function yardRendererChunk(id, root) {
  const source = path.relative(root, id.split('?')[0]).replaceAll('\\', '/');
  if (['ui-image-inventory.json', 'ui-image-reserve.mjs', 'decoded-capacity.mjs', 'runtime-cells.mjs']
    .some(name => source === `src/games/companion-yard-v2/${name}`)) return 'yard-scene-resources';
  if (YARD_RENDERER_MODULES.has(source)) return 'yard-renderer';
  return YARD_RUNTIME_CORE_MODULES.has(source) ? 'yard-runtime-core' : undefined;
}
