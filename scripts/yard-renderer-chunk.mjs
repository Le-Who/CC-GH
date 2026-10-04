/** Executable canvas-renderer boundary, loaded with the lazy Yard route.
 * This code is never data-only and retains the normal game chunk budget. */
import path from 'node:path';
export const YARD_RENDERER_MODULES = new Set([
  'actor-media.mjs', 'atlas-policy.mjs', 'atlas.mjs', 'edge-opacity.mjs',
  'pose-selection.mjs', 'presentation-clock.mjs', 'presentation.mjs',
  'projection.mjs', 'scene.mjs', 'telemetry.mjs',
].map(name => `src/games/companion-yard-v2/${name}`));
export function yardRendererChunk(id, root) {
  const source = path.relative(root, id.split('?')[0]).replaceAll('\\', '/');
  return YARD_RENDERER_MODULES.has(source) ? 'yard-renderer' : undefined;
}
