// Design budget, not a measured device-performance claim: keep DPR2 through
// 430×932 phones (1,603,040 pixels), bound large transparent WebGL backbuffers.
export const MATCH3_RENDER_PIXEL_BUDGET = 1_750_000;

export function match3RenderResolution(width, height, devicePixelRatio = 1) {
  const density = Math.min(Math.max(Number(devicePixelRatio) || 1, .1), 2);
  const area = Math.max(1, Math.round(width) || 1) * Math.max(1, Math.round(height) || 1);
  return Math.min(density, Math.sqrt(MATCH3_RENDER_PIXEL_BUDGET / area));
}

export function resizeMatch3Renderer(renderer, bounds, devicePixelRatio = 1) {
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const resolution = match3RenderResolution(width, height, devicePixelRatio);
  renderer.resize(width, height, resolution);
  return { width, height, resolution };
}
