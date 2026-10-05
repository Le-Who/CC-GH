import {freeze, requireThat as check} from './util.mjs';

/** Storage bridge to unmodified R5 AtlasCache. Individual calibration crops use
 * plain pages; temporal packed media must pass the real R5 runtime-cell validator
 * against explicit source crop evidence and shared physical-page rectangles. */
export function createR5AtlasBridge({atlas, assetBaseURL, validateRuntimeCells} = {}) {
  check(typeof atlas?.prepare === 'function' && typeof atlas.frame === 'function'
    && typeof atlas.draw === 'function', 'R5_ATLAS_CACHE_REQUIRED');
  const base = new URL(assetBaseURL).href, clips = new Map(), physicalPages = new Map();
  function translate(request) {
    if (clips.has(request.key)) return {clip: clips.get(request.key), index: 0};
    const {rect, page} = request;
    const packed = !!request.runtimeCellEvidence;
    check(packed || rect.x === 0 && rect.y === 0 && rect.width === page.width && rect.height === page.height,
      'PACKED_PAGE_REQUIRES_EXPLICIT_RUNTIME_CELL_EVIDENCE');
    const clip = {id: request.imageId, assetBaseURL: base,
      assetRevision: request.mediaReference.manifestDigest, verifySourceBytes: true,
      frameCount: 1, pixelsPerWorld: request.pixelsPerSourceWorld,
      canvas: packed ? [...request.canvas] : [rect.width, rect.height],
      pivotPx: packed ? [...request.untrimmedPivotPx] : [...request.pivotPx],
      sourceCanvas: [...request.canvas], sourceUntrimmedPivotPx: [...request.untrimmedPivotPx],
      pages: [{...page, first: 0, count: 1, cols: 1, tileWidth: rect.width, tileHeight: rect.height}]};
    if (packed) {
      const e = request.runtimeCellEvidence;
      check(typeof validateRuntimeCells === 'function', 'REAL_R5_RUNTIME_CELL_VALIDATOR_REQUIRED');
      clip.runtimeCells = {format: 'yard-runtime-cells/v1', safeEdgePx: e.safeEdgePx,
        atlasGutterPx: e.atlasGutterPx, imageSmoothingQuality: 'low', frames: [{
          index: 0, pageIndex: 0, atlasRect: [rect.x, rect.y, rect.width, rect.height],
          cropOriginPx: [request.trim.x, request.trim.y], cropSize: [rect.width, rect.height],
          runtimePivotPx: [...request.pivotPx], alphaBounds: [...e.alphaBounds],
          nativeRgbaSha256: e.nativeRgbaSha256, croppedRgbaSha256: e.croppedRgbaSha256,
          reembeddedRgbaSha256: e.reembeddedRgbaSha256,
          safeEdgeRgbaZero: e.safeEdgeRgbaZero, discardedRgbaZero: e.discardedRgbaZero,
        }]};
      validateRuntimeCells(clip, {physicalPages, baseURL: base});
    }
    freeze(clip); clips.set(request.key, clip);
    return {clip, index: 0};
  }
  return Object.freeze({
    prepare(required, lookahead = []) { atlas.prepare(required.map(translate), lookahead.map(translate)); },
    translate,
    getFrame(request) {
      const {clip, index} = translate(request), frame = atlas.frame(clip, index);
      return frame ? {ready: true, texture: frame.image, key: request.key,
        imageId: request.imageId, mediaReference: request.mediaReference} : null;
    },
    draw(ctx, view, anchor, pixelsPerSourceWorld) {
      if (!view.pose || view.texture == null) return false;
      const {clip, index} = translate(view.request);
      return atlas.draw(ctx, clip, index, anchor, pixelsPerSourceWorld);
    },
  });
}
