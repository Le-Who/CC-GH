// QA-only import for an explicitly prepared local entry. Never imported by the
// production application, enabled by URL, or installed on a production window.
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {ENCODED_BACKGROUND_CPU_BYTES, LIMITS} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';
const WIDTH = 390, HEIGHT = 648, CHUNK_ROWS = 16, SCRATCH_BYTES = WIDTH * CHUNK_ROWS * 4 * 2;
const OPAQUE_ACTOR_ALPHA_BYTE = 230, MIN_OPAQUE_ACTOR_PIXELS = 64;

export function propsOnlyExpectedFrame(frame, props, selectedSlotId = null, math) {
  const {Matrix4, Vector3} = math ?? {};
  if (!Matrix4 || !Vector3) throw Error('Admitted renderer-provided Three math required');
  // Diagnostic visibility changes the anchor, never the actual actor pose,
  // garden camera or displayed surface extent. Predict only those anchor fields.
  const visible = props.filter(p => p.visible), selected = visible.find(p => p.ghost)
    ?? visible.find(p => p.slotId === selectedSlotId) ?? (selectedSlotId === null ? visible[0] : null);
  if (!selected || !Array.isArray(selected.position) || selected.position.length !== 3 || !selected.position.every(Number.isFinite)) throw Error('Held selected T2 anchor missing');
  for (const key of ['cameraWorld', 'cameraProjection']) if (!Array.isArray(frame[key]) || frame[key].length !== 16 || !frame[key].every(Number.isFinite)) throw Error('Held camera matrices required for prop mask');
  if (![frame.rect?.width, frame.rect?.height].every(v => Number.isFinite(v) && v > 0)) throw Error('Held raster extent required for prop mask');
  const projected = new Vector3(...selected.position)
    .applyMatrix4(new Matrix4().fromArray(frame.cameraWorld).invert())
    .applyMatrix4(new Matrix4().fromArray(frame.cameraProjection));
  const rootInSurface = {x: (projected.x + 1) * frame.rect.width / 2, y: (1 - projected.y) * frame.rect.height / 2};
  return {...structuredClone(frame), visibility: 'planter', presentationRoot: [...selected.position],
    rect: {...frame.rect, rootInSurface},
    cssRect: Object.hasOwn(frame.cssRect, 'rootInSurface') ? {...frame.cssRect, rootInSurface} : {...frame.cssRect}};
}
export function propsOnlyFrameMatches(actual, expected) {
  // Reconstructing the inverse from the reported matrix can differ by ~1e-13
  // from Three's cached inverse. Only the two diagnostic anchor coordinates
  // allow 1e-9 raster pixels of roundoff; every camera/root/extent stays exact.
  const normalized = structuredClone(actual);
  for (const key of ['rect', 'cssRect']) if (Object.hasOwn(expected[key], 'rootInSurface')) {
    if (!['x', 'y'].every(axis => Number.isFinite(actual[key]?.rootInSurface?.[axis]) && Math.abs(actual[key].rootInSurface[axis] - expected[key].rootInSurface[axis]) <= 1e-9)) return false;
    normalized[key].rootInSurface = {...expected[key].rootInSurface};
  }
  return JSON.stringify(normalized) === JSON.stringify(expected);
}

export function createPipQualityBrowserProbe({createRenderer = createOptionalPipRenderer} = {}) {
  let api, renderer, math, lastOptions, held, heldProps, heldFrame, actorOnlyFrame, propsOnlyFrame, lastMetrics, identity = null, identityAttempted = false, disposed = false;
  let baselineScratch = null, copiedScratch = null;
  let factoryCalled = false;
  const assertHeld = () => { if (disposed || !api || !held) throw Error('Hold one real rendered pose before the quality probe'); };
  function scratch() {
    const row = api.resources;
    const diagnosticKnownCPU = row.knownCPUBufferPeakBytes + ENCODED_BACKGROUND_CPU_BYTES + row.boneDataTextureCPUBytesEstimate + SCRATCH_BYTES;
    if (diagnosticKnownCPU > LIMITS.knownCPU) throw Error('Identity readback scratch exceeds known CPU cap');
    baselineScratch ??= new Uint8Array(WIDTH * CHUNK_ROWS * 4);
    copiedScratch ??= new Uint8Array(baselineScratch.length);
    return diagnosticKnownCPU;
  }
  function renderFrame(mode, actorOnly = false, propsOnly = false) {
    assertHeld();
    if (renderer.getClearAlpha() !== 0) throw Error('Alpha diagnostics require transparent GL clear; place black/white backgrounds behind the surface');
    if (JSON.stringify(api.diagnostics.propInstances) !== heldProps) throw Error('Prop state changed during the held quality probe');
    if (mode === 'exterior' && identity?.passed !== true) throw Error('Exact GPU identity must pass before exterior filtering');
    api.setQualityProbeMode(mode);
    if (!api.renderDirect({...held, ...(actorOnly ? {visibility: 'pet'} : propsOnly ? {visibility: 'planter'} : {}), forcePausedRedraw: true})) throw Error('Held native frame was not rendered');
    const frame = api.diagnostics.lastFrame;
    if (propsOnly ? !propsOnlyFrameMatches(frame, propsOnlyFrame) : JSON.stringify(frame) !== (actorOnly ? actorOnlyFrame : heldFrame)) throw Error('Camera, presentation or pose changed during the held quality probe');
    return {mode, metrics: {...lastMetrics}, rendererInfo: {...renderer.info.render}, diagnostics: api.diagnostics};
  }
  const render = mode => renderFrame(mode);
  function proveActorCoverage(gl) {
    let opaquePixels = 0;
    try {
      for (let y = 0; y < HEIGHT; y += CHUNK_ROWS) {
        const rows = Math.min(CHUNK_ROWS, HEIGHT - y), count = WIDTH * rows * 4;
        // The renderer's pet visibility hides all props, keeps the exact held
        // actor pose/camera, and retains only its low-alpha contact shadow.
        renderFrame('off', true);
        gl.readPixels(0, y, WIDTH, rows, gl.RGBA, gl.UNSIGNED_BYTE, baselineScratch);
        if (gl.getError() !== gl.NO_ERROR) throw Error('GL error during actor-only coverage readback');
        for (let i = 3; i < count; i += 4) if (baselineScratch[i] >= OPAQUE_ACTOR_ALPHA_BYTE) opaquePixels++;
      }
    } finally {
      // Even a failed proof leaves the original held visibility on screen.
      render('off');
    }
    return {passed: opaquePixels >= MIN_OPAQUE_ACTOR_PIXELS, visibility: 'pet', opaquePixels,
      minimumOpaquePixels: MIN_OPAQUE_ACTOR_PIXELS, minimumAlphaByte: OPAQUE_ACTOR_ALPHA_BYTE, transparentGLClear: true};
  }
  return {
    async rendererFactory(options) {
      if (factoryCalled) throw Error('The local quality probe owns one renderer lifetime');
      factoryCalled = true;
      api = await createRenderer({...options, qualityProbe: 'identity',
        rendererFactory({THREE, ...nativeOptions}) { math = THREE; renderer = new THREE.WebGLRenderer(nativeOptions); return renderer; },
        onFrameMetrics(row) { lastMetrics = row; options.onFrameMetrics?.(row); },
      });
      api.setQualityProbeMode('off');
      return {
        ...api,
        get resources() { return api.resources; }, get diagnostics() { return api.diagnostics; },
        renderDirect(options) {
          if (held) return false;
          const rendered = api.renderDirect(options);
          if (rendered) lastOptions = structuredClone(options);
          return rendered;
        },
        dispose() { disposed = true; held = lastOptions = baselineScratch = copiedScratch = null; api.dispose(); },
      };
    },
    hold({selectedSlotId = null} = {}) {
      if (disposed || !lastOptions || held) throw Error('Hold requires one live, previously rendered scene sample');
      if (!['both', 'pet'].includes(lastOptions.visibility ?? 'both') || !['both', 'pet'].includes(api.diagnostics.lastFrame?.visibility)) throw Error('Quality identity requires an actor-visible held frame');
      held = structuredClone(lastOptions);
      heldProps = JSON.stringify(api.diagnostics.propInstances); heldFrame = JSON.stringify(api.diagnostics.lastFrame);
      actorOnlyFrame = JSON.stringify({...api.diagnostics.lastFrame, visibility: 'pet'});
      propsOnlyFrame = propsOnlyExpectedFrame(api.diagnostics.lastFrame, api.diagnostics.propInstances, selectedSlotId, math);
      api.setPaused(true);
      return {sample: structuredClone(held.sample), diagnostics: api.diagnostics};
    },
    render,
    readHeldRows(mode, y, rows = CHUNK_ROWS, isolation = null) {
      assertHeld();
      if (!Number.isInteger(y) || !Number.isInteger(rows) || y < 0 || rows < 1 || rows > CHUNK_ROWS || y + rows > HEIGHT) throw Error('Readback requires at most 16 in-bounds rows');
      if (isolation !== null && (!['pet', 'planter'].includes(isolation) || mode !== 'off' || identity?.passed !== true)) throw Error('Isolation capture needs passed identity, baseline mode and pet/planter visibility');
      const diagnosticKnownCPUBytes = scratch(), gl = renderer.getContext();
      if (gl.getError() !== gl.NO_ERROR) throw Error('Existing GL error before native capture');
      try {
        renderFrame(mode, isolation === 'pet', isolation === 'planter');
        gl.readPixels(0, y, WIDTH, rows, gl.RGBA, gl.UNSIGNED_BYTE, baselineScratch);
      } finally { if (isolation !== null) render('off'); }
      if (gl.getError() !== gl.NO_ERROR) throw Error('GL error during native capture');
      let binary = '';
      for (let i = 0; i < WIDTH * rows * 4; i++) binary += String.fromCharCode(baselineScratch[i]);
      return {mode, isolation, y, rows, width: WIDTH, height: HEIGHT, rowOrder: 'bottom-up', encoding: 'output-encoded premultiplied RGBA8',
        dataBase64: btoa(binary), diagnosticScratchCPUBytes: SCRATCH_BYTES, diagnosticKnownCPUBytes, qualifiesPerformance: false};
    },
    compareIdentity() {
      assertHeld();
      if (identityAttempted) throw Error('One bounded identity attempt per probe owner');
      identityAttempted = true;
      const diagnosticKnownCPU = scratch();
      const gl = renderer.getContext();
      if (gl.getError() !== gl.NO_ERROR) throw Error('Existing GL error before identity gate');
      const actorCoverage = proveActorCoverage(gl);
      // Two 16-row arrays, never two whole-frame buffers. This synchronous
      // diagnostic readback is absent from runtime and cost measurements.
      const baseline = baselineScratch, copied = copiedScratch;
      let comparedBytes = 0, nonzeroAlphaPixels = 0, mismatches = 0, firstMismatch = null;
      for (let y = 0; actorCoverage.passed && y < HEIGHT; y += CHUNK_ROWS) {
        const rows = Math.min(CHUNK_ROWS, HEIGHT - y), count = WIDTH * rows * 4;
        render('off'); gl.readPixels(0, y, WIDTH, rows, gl.RGBA, gl.UNSIGNED_BYTE, baseline);
        if (gl.getError() !== gl.NO_ERROR) throw Error('GL error during baseline identity readback');
        render('identity'); gl.readPixels(0, y, WIDTH, rows, gl.RGBA, gl.UNSIGNED_BYTE, copied);
        if (gl.getError() !== gl.NO_ERROR) throw Error('GL error during copied identity readback');
        for (let i = 0; i < count; i++) {
          comparedBytes++;
          if (i % 4 === 3 && baseline[i] !== 0) nonzeroAlphaPixels++;
          if (baseline[i] !== copied[i]) { mismatches++; firstMismatch ??= {byte: y * WIDTH * 4 + i, expected: baseline[i], actual: copied[i]}; }
        }
        if (mismatches) break;
      }
      identity = {passed: actorCoverage.passed && mismatches === 0 && comparedBytes === WIDTH * HEIGHT * 4 && nonzeroAlphaPixels > 0,
        actorCoverage, failure: actorCoverage.passed ? (mismatches ? 'identity-mismatch' : null) : 'insufficient-opaque-actor-coverage',
        comparedBytes, mismatches, firstMismatch, nonzeroAlphaPixels, diagnosticScratchCPUBytes: SCRATCH_BYTES,
        diagnosticKnownCPUBytes: diagnosticKnownCPU, includesSynchronousReadback: true, qualifiesPerformance: false};
      return {...identity};
    },
    diagnostics() { return {held: Boolean(held), identity: identity ? {...identity} : null, resources: api?.resources, renderer: api?.diagnostics}; },
  };
}
