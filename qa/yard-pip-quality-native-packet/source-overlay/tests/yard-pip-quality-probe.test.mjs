import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {createPipQualityCopy, PIP_QUALITY_FRAGMENT} from '../src/games/companion-yard-v2/pip-prototype/prototype/pip-quality-copy.mjs';
import {PIP_QUALITY_COPY, pipQualityResourceFields} from '../src/games/companion-yard-v2/pip-prototype/prototype/pip-quality-resources.mjs';
import {admitPipResources, rgbaAdmission, LIMITS, ENCODED_BACKGROUND_CPU_BYTES} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import {createCleanProjection} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import {makePlanterInspection, samplePlanterInspection} from '../src/games/companion-yard-v2/pip-prototype/planter-interaction.mjs';
import {uiImageLifetimeLedger} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {canonicalItemCatalog} from '../src/games/companion-yard-v2/pip-prototype/item-catalog.mjs';
import {createPipQualityBrowserProbe, propsOnlyExpectedFrame, propsOnlyFrameMatches} from './yard-pip-quality-browser-probe.mjs';

const base = new URL('../src/games/companion-yard-v2/pip-prototype/', import.meta.url);
const [setup, descriptor, calibration] = await Promise.all(['fixture', 'location', 'calibration'].map(async name => JSON.parse(await fs.readFile(new URL(`data/${name}.json`, base)))));
const [pip, pot, fragmentHelper] = await Promise.all([fs.readFile(new URL('assets/pip.glb', base)), fs.readFile(new URL('assets/planter-t2.glb', base)), fs.readFile(new URL('source/pip-rest-coat.glsl', base), 'utf8')]);
const sample = samplePlanterInspection(setup, makePlanterInspection(setup), 0);
const bytes = buffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

async function harness(qualityProbe = 'off', {rejectStage = null} = {}) {
  const canvas = new EventTarget(); canvas.style = {}; canvas.dataset = {}; canvas.remove = () => { canvas.parentNode = null; };
  const host = {appendChild(c) { c.parentNode = host; }};
  const rows = [], calls = [], retired = [], metrics = [];
  const owned = new Set(); let allocations = 0, gl;
  const observe = resource => { if (!owned.has(resource)) { owned.add(resource); resource.addEventListener('dispose', () => retired.push(resource)); } };
  const pending = createOptionalPipRenderer({enabled: true, qualityProbe, actorUnitsPerSource: 16,
    calibration, fragmentHelper, planter: {descriptor: setup.planter, placement: setup.placements[0]},
    presentationMode: 'direct', directHost: host, canvasFactory: () => { calls.push('canvas'); return canvas; },
    viewport: createCleanProjection(descriptor, 390, 592).renderViewport,
    loadAssetBytes: async () => bytes(pip), loadPlanterAssetBytes: async () => bytes(pot),
    admitResources(row) { rows.push(row); calls.push('admit:' + row.stage); return row.stage !== rejectStage && admitPipResources({...row, encodedBackgroundCPUBytes: ENCODED_BACKGROUND_CPU_BYTES}); },
    setupLighting: () => () => {}, onFrameMetrics: row => metrics.push(row),
    rendererFactory() {
      gl = {shadowMap: {}, autoClear: true, info: {autoReset: true, render: {frame: 0, calls: 0, triangles: 0, points: 0, lines: 0}},
        setClearColor() {}, setPixelRatio() {}, setSize(w, h) { allocations++; canvas.width = w; canvas.height = h; calls.push('size'); },
        getRenderTarget: () => null, dispose() { calls.push('dispose-renderer'); }, forceContextLoss() {},
        copyFramebufferToTexture(texture) { observe(texture); calls.push('copy'); assert.equal(texture.image.width, 390); assert.equal(texture.image.height, 648); },
        render(scene, camera) {
          const pass = scene.children.length === 1 && scene.children[0].material?.isRawShaderMaterial;
          if (this.info.autoReset) for (const key of ['calls', 'triangles', 'points', 'lines']) this.info.render[key] = 0;
          this.info.render.frame++; this.info.render.calls += pass ? 1 : 7; this.info.render.triangles += pass ? 1 : 123;
          calls.push(pass ? 'quality' : 'main'); scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
          if (pass) {
            const mesh = scene.children[0], material = mesh.material, texture = material.uniforms.sourceColor.value;
            observe(mesh.geometry); observe(material); observe(texture);
            assert.equal(this.autoClear, false); assert.equal(this.info.autoReset, false);
            assert.equal(mesh.geometry.attributes.position.array.byteLength, 36); assert.equal(mesh.geometry.index, null);
            assert.equal(material.blending, THREE.NoBlending); assert.equal(material.depthTest, false); assert.equal(material.depthWrite, false);
            assert.equal(material.glslVersion, THREE.GLSL3); assert.equal(material.toneMapped, false);
            assert.equal(texture.colorSpace, THREE.NoColorSpace); assert.equal(texture.premultiplyAlpha, false); assert.equal(texture.internalFormat, 'RGBA8');
          }
        },
      }; return gl;
    },
  });
  if (rejectStage) { await assert.rejects(pending, /admission rejected/); return {rows, calls, allocations}; }
  return {api: await pending, canvas, rows, calls, owned, retired, metrics, get gl() { return gl; }, get allocations() { return allocations; }};
}

test('default has the exact baseline resource row, contact strengths, and one render; no implicit copy admission', async () => {
  const e = await harness();
  try {
    e.api.renderDirect({sample});
    assert.equal(e.api.diagnostics.qualityProbe.copy, null);
    assert.deepEqual(e.api.diagnostics.contactShadow.strength, [.21, .29, .29]);
    assert.equal(e.api.resources.geometryGPUBufferBytes, 4028332);
    assert.equal(e.api.resources.knownCPUBufferPeakBytes, 12223736);
    assert.equal(e.api.resources.ownedRGBASurfacePeakBytes, 4043520);
    assert.deepEqual(Object.keys(e.api.resources).filter(k => k.startsWith('quality')), []);
    assert.equal(e.calls.filter(c => c === 'main').length, 1); assert.equal(e.calls.includes('copy'), false);
    for (const mode of ['contact', 'identity', 'exterior']) assert.throws(() => e.api.setQualityProbeMode(mode), /explicitly admitted/);
    assert.equal(e.api.setQualityProbeMode('off'), true);
  } finally { e.api.dispose(); }
});

test('contact-only changes exactly the two strength constants and allocates no extra buffers or pass', async () => {
  const e = await harness('contact');
  try {
    e.api.renderDirect({sample}); const contact = e.api.diagnostics.contactShadow, frame = e.api.diagnostics.lastFrame;
    assert.deepEqual(contact.strength, [.25, .35, .35]); assert.equal(e.api.diagnostics.qualityProbe.copy, null);
    e.api.setQualityProbeMode('off'); e.api.renderDirect({sample}); const baseline = e.api.diagnostics.contactShadow;
    for (const key of ['body', 'left', 'right', 'bodyAxis', 'leftAxis', 'rightAxis', 'groundY', 'flatSupport']) assert.deepEqual(contact[key], baseline[key]);
    assert.deepEqual(e.api.diagnostics.lastFrame, frame); assert.deepEqual(baseline.strength, [.21, .29, .29]);
    assert.equal(e.api.resources.geometryGPUBufferBytes, 4028332); assert.equal(e.api.resources.knownCPUBufferPeakBytes, 12223736);
    assert.equal(e.calls.includes('copy'), false); assert.equal(e.allocations, 1);
    assert.throws(() => e.api.setQualityProbeMode('exterior'), /explicitly admitted/);
  } finally { e.api.dispose(); }
});

test('identity/exterior pre-admit old+new RGBA overlap and triangle within unchanged CPU, GPU, and RGBA caps', async () => {
  const e = await harness('identity');
  try {
    const row = e.api.resources;
    assert.equal(row.qualityCopyColorBytes, 1010880); assert.equal(row.qualityCopyColorPeakBytes, 2021760);
    assert.equal(row.knownCPUBufferPeakBytes + ENCODED_BACKGROUND_CPU_BYTES + row.boneDataTextureCPUBytesEstimate, 15112832);
    const gpu = row.geometryGPUBufferBytes + row.boneDataTextureGPUBytesEstimate + row.resizeDrawingBufferPeakEstimatedBytes + row.compositorResizePeakBytesEstimate + row.qualityCopyColorPeakBytes;
    assert.equal(gpu, 12116432); assert.ok(gpu < LIMITS.estimatedGPU);
    const worst = rgbaAdmission({uiBytes: 19138304, backgroundBytes: 973 * 1616 * 4, currentCanvasBytes: 1280 * 720 * 16, pendingCanvasBytes: 1280 * 720 * 16, directSurfaceBytes: row.ownedRGBASurfacePeakBytes});
    assert.equal(worst.totalBytes, 60984256); assert.equal(worst.fits, true);
    // Canonical catalogue lifetime reserve gives the reported worst owner peak.
    const canonicalWorst = rgbaAdmission({uiBytes: uiImageLifetimeLedger(canonicalItemCatalog).bytes, backgroundBytes: 973 * 1616 * 4, currentCanvasBytes: 1280 * 720 * 16, pendingCanvasBytes: 1280 * 720 * 16, directSurfaceBytes: row.ownedRGBASurfacePeakBytes});
    assert.equal(canonicalWorst.totalBytes, 65275724); assert.equal(canonicalWorst.fits, true);
    assert.ok(e.calls.indexOf('admit:before-drawing-buffer-allocation') < e.calls.indexOf('canvas'));
    assert.equal(e.rows[0].knownCPUBufferPeakBytes, 12223772);
    for (const patch of [{qualityCopyColorPeakBytes: 1010880}, {qualityCopyColorBytes: 0}, {qualityGeometryCPUBytes: 0}, {qualityGeometryGPUBytes: 0}, {qualityExtraDraws: 0}, {qualityDriverAndProgramOverheadKnown: true}, {qualityUnexpected: 0}, {knownCPUBufferPeakBytes: 12223736}, {ownedRGBASurfacePeakBytes: 4043520}, {geometryGPUBufferBytes: LIMITS.estimatedGPU}]) assert.equal(admitPipResources({...row, ...patch}), false);
    const incomplete = {...row}; delete incomplete.qualityCopyColorPeakBytes; assert.equal(admitPipResources(incomplete), false);
  } finally { e.api.dispose(); }
});

test('same-pose toggles preserve baseline contact, fixed camera, props, counters, pause, resize and context recovery', async () => {
  const e = await harness('identity');
  try {
    e.api.setCanonicalPlacements([{slotId: 'one', x: 98, y: 118}, {slotId: 'two', x: 114, y: 146}]);
    e.api.setQualityProbeMode('off'); e.api.renderDirect({sample});
    const held = e.api.diagnostics.lastFrame, props = e.api.diagnostics.propInstances;
    const heldMain = e.gl.info.render.calls;
    for (const mode of ['identity', 'exterior', 'off', 'identity']) {
      e.api.setQualityProbeMode(mode); e.api.renderDirect({sample});
      assert.deepEqual(e.api.diagnostics.lastFrame, held); assert.deepEqual(e.api.diagnostics.propInstances, props);
      assert.deepEqual(e.api.diagnostics.contactShadow.strength, [.21, .29, .29]);
      assert.equal(e.gl.info.render.calls, heldMain + (mode === 'off' ? 0 : 1));
      assert.equal(e.gl.autoClear, true); assert.equal(e.gl.info.autoReset, true);
    }
    assert.equal(e.api.diagnostics.qualityProbe.copy.copies, 3);
    assert.equal(e.api.diagnostics.qualityProbe.copy.draws, 3);
    const owned = new Set(e.owned);
    e.api.setPaused(true); assert.equal(e.api.renderDirect({sample}), false);
    e.api.resize({viewport: createCleanProjection(descriptor, 320, 274).renderViewport});
    assert.equal(e.api.renderDirect({sample, forcePausedRedraw: true}), true);
    e.canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true}));
    assert.equal(e.api.renderDirect({sample, forcePausedRedraw: true}), false);
    e.canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.equal(e.api.renderDirect({sample}), false); assert.equal(e.api.renderDirect({sample, forcePausedRedraw: true}), true);
    assert.deepEqual(e.owned, owned); assert.equal(e.allocations, 1);
    assert.equal(e.api.diagnostics.qualityProbe.copy.textureAllocations, 1);
    assert.deepEqual(e.api.diagnostics.lastFrame.cameraWorld, held.cameraWorld);
    assert.deepEqual(e.api.diagnostics.lastFrame.cameraProjection, held.cameraProjection);
    assert.equal(e.metrics.at(-1).GPUCompletionMeasured, false);
  } finally { e.api.dispose(); e.api.dispose(); }
  assert.equal(e.owned.size, 3); assert.equal(e.retired.length, 3); assert.deepEqual(new Set(e.retired), e.owned);
  assert.equal(e.api.diagnostics.qualityProbe.copy.disposed, true);
  assert.equal(e.api.setQualityProbeMode('identity'), false); assert.equal(e.canvas.width, 0);
});

test('resource rejection happens before a drawing canvas or quality resource can be created', async () => {
  for (const rejectStage of ['before-import-and-load', 'before-drawing-buffer-allocation']) {
    const e = await harness('identity', {rejectStage});
    assert.equal(e.calls.includes('canvas'), false); assert.equal(e.calls.includes('copy'), false); assert.equal(e.allocations, 0);
  }
});

test('quality helper rejects missing admission and releases partial construction; copy/draw errors restore renderer state', () => {
  let textures = 0, disposals = 0;
  class Texture extends THREE.FramebufferTexture { constructor(...args) { super(...args); textures++; this.addEventListener('dispose', () => disposals++); } }
  const vendor = {...THREE, FramebufferTexture: Texture};
  const canvas = {width: 390, height: 648};
  const renderer = {autoClear: true, info: {autoReset: true, render: {}}, getRenderTarget: () => null, copyFramebufferToTexture() {}, render() { throw Error('draw failed'); }};
  assert.throws(() => createPipQualityCopy(vendor, {renderer, canvas}), /admitted/); assert.equal(textures, 0);
  assert.throws(() => createPipQualityCopy({...vendor, BufferGeometry: class { constructor() { throw Error('geometry failed'); } }}, {renderer, canvas, admittedResources: pipQualityResourceFields('identity')}), /geometry failed/);
  assert.equal(textures, 1); assert.equal(disposals, 1);
  const pass = createPipQualityCopy(vendor, {renderer, canvas, admittedResources: pipQualityResourceFields('identity')});
  assert.throws(() => pass.render('identity'), /draw failed/); assert.equal(renderer.autoClear, true); assert.equal(renderer.info.autoReset, true);
  renderer.copyFramebufferToTexture = () => { throw Error('copy failed'); };
  assert.throws(() => pass.render('identity'), /copy failed/); assert.equal(renderer.autoClear, true); assert.equal(renderer.info.autoReset, true);
  canvas.width = 391; assert.throws(() => pass.render('identity'), /fixed default framebuffer/);
  pass.dispose(); pass.dispose(); assert.equal(disposals, 2); assert.equal(pass.render('identity'), false);
});

test('raw shader contract copies exact texel centers and gates only existing exterior coverage; real GPU identity remains unqualified', () => {
  assert.match(PIP_QUALITY_FRAGMENT, /uniform highp sampler2D/);
  assert.match(PIP_QUALITY_FRAGMENT, /texelFetch\(sourceColor,clamp/);
  assert.match(PIP_QUALITY_FRAGMENT, /result=c;/);
  assert.match(PIP_QUALITY_FRAGMENT, /exterior==0\|\|c\.a==0\.0/);
  assert.match(PIP_QUALITY_FRAGMENT, /if\(min\(min\(n\.a,s\.a\),min\(e\.a,w\.a\)\)>0\.0\)return/);
  assert.doesNotMatch(PIP_QUALITY_FRAGMENT, /colorspace|tonemapping|texture2D|n\.rgb|s\.rgb|e\.rgb|w\.rgb/);
  assert.equal(PIP_QUALITY_COPY.geometryCPUBytes, 36);
});

async function browserHarness(variant = 'exact', visibility = 'both') {
  let mode = 'off', draws = 0, reads = 0, lastReadDraw = 0, disposed = false, drawVisibility = visibility, clearAlpha = 0;
  const frame = {rootGLTF: [0, 0, 0], presentationRoot: [0, 0, 0], visibility,
    cameraWorld: new THREE.Matrix4().toArray(), cameraProjection: new THREE.Matrix4().toArray(),
    rect: {x: 0, y: 0, width: 390, height: 648, rootInSurface: {x: 195, y: 324}}, cssRect: {x: 0, y: 0, width: 390, height: 648}};
  const diag = {propInstances: [{slotId: 'static-prop', visible: true, ghost: false, position: [.25, .25, 0]}], lastFrame: structuredClone(frame)}, readSizes = [], visibleFrames = [];
  const heldSample = {world: {root: {x: 1}}};
  const probe = createPipQualityBrowserProbe({createRenderer: async options => {
    assert.equal(options.qualityProbe, 'identity');
    const gl = {NO_ERROR: 0, RGBA: 1, UNSIGNED_BYTE: 2, getError: () => 0,
      readPixels(x, y, w, h, format, type, buffer) {
        assert(draws > lastReadDraw, 'Every row read requires a fresh real draw'); lastReadDraw = draws;
        reads++; readSizes.push(buffer.byteLength); buffer.fill(0);
        if (drawVisibility === 'pet') {
          if (variant === 'tiny-actor') buffer[3] = 255;
          else if (!['empty', 'props-only'].includes(variant)) {
            const alpha = variant === 'shadow-only' ? 150 : variant === 'translucent-only' ? 229 : 255;
            buffer[3] = buffer[7] = alpha;
          }
        } else if (variant !== 'empty') buffer[3] = 255; // A prop alone is not actor coverage.
        if (variant === 'mismatch' && mode === 'identity') buffer[0] = 1;
      }};
    options.rendererFactory({THREE: {...THREE, WebGLRenderer: class {
      constructor() { this.info = {render: {}}; }
      getContext() { return gl; }
      getClearAlpha() { return clearAlpha; }
    }}});
    return {resources: {knownCPUBufferPeakBytes: 12223772, boneDataTextureCPUBytesEstimate: 1024}, diagnostics: diag,
      setQualityProbeMode(value) { mode = value; }, setPaused() {},
      renderDirect(request) {
        assert.deepEqual(request.sample, heldSample, 'Actor coverage must keep the same held pose');
        draws++; drawVisibility = request.visibility ?? 'both'; visibleFrames.push(drawVisibility);
        diag.lastFrame = drawVisibility === 'planter' ? propsOnlyExpectedFrame(frame, diag.propInstances, null, THREE) : {...structuredClone(frame), visibility: drawVisibility};
        options.onFrameMetrics({GPUCompletionMeasured: false}); return true;
      },
      dispose() { disposed = true; }};
  }});
  const api = await probe.rendererFactory({});
  assert.throws(() => probe.render('off'), /Hold/);
  api.renderDirect({sample: heldSample, visibility});
  return {api, probe, diag, readSizes, visibleFrames, setClearAlpha(value) { clearAlpha = value; },
    get reads() { return reads; }, get draws() { return draws; }, get disposed() { return disposed; }};
}

test('QA identity proves actor-only opaque coverage, compares bounded chunks, and restores the real held frame', async () => {
  for (const variant of ['exact', 'mismatch', 'empty', 'props-only', 'shadow-only', 'translucent-only', 'tiny-actor']) {
    const e = await browserHarness(variant); e.probe.hold();
    assert.equal(e.api.renderDirect({sample: {world: {root: {x: 2}}}}), false);
    assert.throws(() => e.probe.render('exterior'), /identity must pass/);
    const result = e.probe.compareIdentity();
    assert.equal(result.diagnosticScratchCPUBytes, 49920); assert.equal(result.diagnosticKnownCPUBytes, 15162752);
    assert.ok(e.readSizes.every(size => size === 24960));
    assert.equal(result.passed, variant === 'exact'); assert.equal(result.qualifiesPerformance, false);
    assert.equal(result.actorCoverage.visibility, 'pet'); assert.equal(result.actorCoverage.minimumAlphaByte, 230);
    assert.equal(result.actorCoverage.minimumOpaquePixels, 64); assert.equal(result.actorCoverage.transparentGLClear, true);
    assert.equal(e.diag.lastFrame.visibility, 'both', 'The original visibility must be restored');
    assert.equal(e.visibleFrames.filter(v => v === 'pet').length, 41);
    if (variant === 'mismatch') {
      assert.equal(e.reads, 43); assert.equal(e.draws, 45); assert.equal(result.firstMismatch.byte, 0);
      assert.equal(result.failure, 'identity-mismatch');
    } else if (variant === 'exact') {
      assert.equal(result.comparedBytes, 1010880); assert.equal(e.reads, 123); assert.equal(result.actorCoverage.opaquePixels, 82);
    } else {
      assert.equal(result.comparedBytes, 0); assert.equal(e.reads, 41); assert.equal(result.failure, 'insufficient-opaque-actor-coverage');
      assert.equal(result.actorCoverage.opaquePixels, variant === 'tiny-actor' ? 41 : 0);
    }
    if (result.passed) assert.equal(e.probe.render('exterior').mode, 'exterior');
    else assert.throws(() => e.probe.render('exterior'), /identity must pass/);
    const chunk = e.probe.readHeldRows('off', 640, 8);
    assert.equal(Buffer.from(chunk.dataBase64, 'base64').length, 390 * 8 * 4);
    assert.equal(chunk.rowOrder, 'bottom-up'); assert.equal(chunk.qualifiesPerformance, false);
    assert.throws(() => e.probe.readHeldRows('off', 0, 17), /at most 16/);
    assert.throws(() => e.probe.readHeldRows('off', 648, 1), /at most 16/);
    assert.throws(() => e.probe.compareIdentity(), /One bounded/);
    e.api.dispose(); assert.equal(e.disposed, true); assert.throws(() => e.probe.render('off'), /Hold/);
  }
});

test('QA hold rejects prop-only and empty visibility before identity can unlock exterior', async () => {
  for (const visibility of ['planter', 'empty']) {
    const e = await browserHarness('exact', visibility);
    assert.throws(() => e.probe.hold(), /actor-visible held frame/);
    assert.throws(() => e.probe.compareIdentity(), /Hold/);
    assert.throws(() => e.probe.render('exterior'), /Hold/);
    assert.equal(e.reads, 0); e.api.dispose();
  }
});

test('QA opaque GL clear cannot fake actor coverage; black/white must remain behind the transparent surface', async () => {
  const e = await browserHarness(); e.probe.hold(); e.setClearAlpha(1);
  assert.throws(() => e.probe.compareIdentity(), /transparent GL clear/);
  assert.throws(() => e.probe.readHeldRows('off', 0, 16), /transparent GL clear/);
  assert.equal(e.reads, 0); e.setClearAlpha(0);
  assert.throws(() => e.probe.render('exterior'), /identity must pass/);
  e.api.dispose();
});

test('QA isolated masks are identity-gated, bounded, freshly rendered and restore held visibility', async () => {
  const e = await browserHarness(); e.probe.hold();
  assert.throws(() => e.probe.readHeldRows('off', 0, 16, 'planter'), /passed identity/);
  assert.equal(e.reads, 0); assert(e.probe.compareIdentity().passed);
  for (const isolation of ['pet', 'planter']) {
    const reads = e.reads, draws = e.draws;
    const row = e.probe.readHeldRows('off', 0, 16, isolation);
    assert.equal(row.isolation, isolation); assert.equal(Buffer.from(row.dataBase64, 'base64').length, 24960);
    assert.equal(e.reads, reads + 1); assert.equal(e.draws, draws + 2);
    assert.equal(e.diag.lastFrame.visibility, 'both');
    assert.equal(row.diagnosticScratchCPUBytes, 49920);
  }
  assert.throws(() => e.probe.readHeldRows('contact', 0, 16, 'planter'), /baseline mode/);
  assert.throws(() => e.probe.readHeldRows('off', 0, 16, 'empty'), /pet\/planter/);
  e.api.dispose(); assert.throws(() => e.probe.readHeldRows('off', 0, 16, 'planter'), /Hold/);
});


test('real renderer masks predict only the selected T2 anchor and reject camera/actor/extent drift', async () => {
  const e = await harness('identity');
  const route = makePlanterInspection(setup),settled = samplePlanterInspection(setup, route, route.route.totalMs);
  const projection = createCleanProjection(descriptor,390,592);
  const request = {sample:settled,point:projection.project(settled.world.root),presentation:{a:2,d:2,b:0,c:0,e:0,f:0,backingWidth:780,backingHeight:1184,contentWidth:390,contentHeight:592,offsetLeft:0,offsetTop:0},visibility:'both'};
  try {
    e.api.setCanonicalPlacements([{slotId:'one',x:98,y:118},{slotId:'two',x:72,y:145}],{selectedSlotId:'two'});
    e.api.renderDirect(request);const held=structuredClone(e.api.diagnostics.lastFrame),props=e.api.diagnostics.propInstances;
    e.api.renderDirect({...request,visibility:'planter'});const actual=structuredClone(e.api.diagnostics.lastFrame);
    assert.notDeepEqual(actual,{...held,visibility:'planter'});
    assert(propsOnlyFrameMatches(actual,propsOnlyExpectedFrame(held,props,'two',THREE)));
    const shifted=structuredClone(actual);shifted.rect.rootInSurface.x+=1e-6;
    assert.equal(propsOnlyFrameMatches(shifted,propsOnlyExpectedFrame(held,props,'two',THREE)),false);
    assert.notDeepEqual(actual,propsOnlyExpectedFrame(held,props,'one',THREE));
    assert.throws(()=>propsOnlyExpectedFrame(held,props,'missing',THREE),/anchor missing/);
    let consumed=0,drift=null;
    const gl={NO_ERROR:0,RGBA:1,UNSIGNED_BYTE:2,getError:()=>0,readPixels(x,y,w,h,f,t,b){assert(e.gl.info.render.frame>consumed);consumed=e.gl.info.render.frame;b.fill(0);b[3]=b[7]=255;}};
    e.gl.getContext=()=>gl;e.gl.getClearAlpha=()=>0;
    const probe=createPipQualityBrowserProbe({createRenderer:async options=>{
      options.rendererFactory({THREE:{...THREE,WebGLRenderer:class{constructor(){return e.gl;}}}});
      return {...e.api,get resources(){return e.api.resources;},get diagnostics(){
        const d=e.api.diagnostics;
        if(drift&&d.lastFrame.visibility===drift.visibility){
          if(drift.field==='rect')d.lastFrame.rect.width+=1;
          else if(drift.field==='cssRect')d.lastFrame.cssRect.x+=1;
          else d.lastFrame[drift.field][0]+=1;
        }
        return d;
      }};
    }});
    const owner=await probe.rendererFactory({});owner.renderDirect(request);probe.hold({selectedSlotId:'two'});assert(probe.compareIdentity().passed);
    for(const isolation of['pet','planter'])assert.equal(Buffer.from(probe.readHeldRows('off',0,16,isolation).dataBase64,'base64').length,24960);
    assert.deepEqual(e.api.diagnostics.lastFrame,held,'Isolation must restore the entire actor-held frame');
    for(const field of['rootGLTF','cameraWorld','cameraProjection','rect','cssRect','presentationRoot']){
      drift={visibility:'planter',field};assert.throws(()=>probe.readHeldRows('off',0,16,'planter'),/Camera, presentation or pose changed/);drift=null;
      assert.deepEqual(e.api.diagnostics.lastFrame,held);
    }
    drift={visibility:'both',field:'rootGLTF'};assert.throws(()=>probe.render('off'),/Camera, presentation or pose changed/);drift=null;
    drift={visibility:'pet',field:'rootGLTF'};assert.throws(()=>probe.readHeldRows('off',0,16,'pet'),/Camera, presentation or pose changed/);drift=null;
    e.api.setCanonicalPlacements([{slotId:'one',x:99,y:118},{slotId:'two',x:72,y:145}],{selectedSlotId:'two'});
    assert.throws(()=>probe.render('off'),/Prop state changed/);
  } finally {e.api.dispose();}
});
