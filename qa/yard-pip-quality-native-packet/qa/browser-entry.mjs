// Resolved only by the private build overlay. No production import or URL gate.
import {createPipYardScene as createScene} from '../../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import {createPipQualityBrowserProbe} from '../../tests/yard-pip-quality-browser-probe.mjs';

export function createPipYardScene(canvas, options) {
  if (!options.canonicalItems || window.__yardQualityNative) throw Error('One canonical quality owner required');
  const probe = createPipQualityBrowserProbe();
  const scene = createScene(canvas, {...options, rendererFactory: probe.rendererFactory});
  const host = options.directHost;
  const old = {visibility: canvas.style.visibility, background: host.style.backgroundColor};
  let held = false, retired = false, background = 'garden';
  const admittedMode = mode => {
    if (mode !== 'off' && probe.diagnostics().identity?.passed !== true) throw Error('Candidate progression requires passed actor/identity gate');
    return mode;
  };
  const api = Object.freeze({
    snapshot: () => ({scene: scene.diagnostics(), probe: probe.diagnostics(), held, retired, background}),
    hold() {
      const s = scene.diagnostics();
      if (!s.ready || !s.settled || s.viewportBlocked || s.itemEditing || s.canonicalRecords?.length !== 2 || s.lastFrame?.visibility !== 'both') throw Error('Hold requires a settled real Pip and two canonical T2 instances');
      if (s.renderer.propInstances.filter(p => p.visible && !p.ghost).length !== 2) throw Error('Both T2 instances must actually be visible');
      held = true; return probe.hold({selectedSlotId: s.selectedCanonicalSlotId});
    },
    compareIdentity: () => probe.compareIdentity(),
    render: mode => probe.render(admittedMode(mode)),
    readRows: (mode, y, rows, isolation = null) => probe.readHeldRows(admittedMode(mode), y, rows, isolation),
    background(kind) {
      if (!held || !['garden', 'light', 'dark'].includes(kind)) throw Error('Invalid held background');
      background = kind;
      canvas.style.visibility = kind === 'garden' ? old.visibility : 'hidden';
      host.style.backgroundColor = kind === 'garden' ? old.background : kind === 'light' ? '#fff' : '#000';
      return probe.render('off');
    },
    async cost() {
      if (probe.diagnostics().identity?.passed !== true) throw Error('Identity must pass before candidate timing');
      const rows = [];
      for (const mode of ['off', 'contact', 'identity', 'exterior']) {
        for (let n = 0; n < 3; n++) probe.render(mode);
        const samples = [];
        for (let n = 0; n < 20; n++) {
          await new Promise(requestAnimationFrame);
          const before = probe.diagnostics().renderer.qualityProbe.copy;
          const result = probe.render(mode), after = result.diagnostics.qualityProbe.copy;
          samples.push({metrics: result.metrics, calls: result.rendererInfo.calls, triangles: result.rendererInfo.triangles,
            copies: after.copies - before.copies, extraDraws: after.draws - before.draws});
        }
        rows.push({mode, warmups: 3, measured: 20, samples});
      }
      probe.render('off');
      return {rows, visualAcceptance: 'PENDING_NATIVE_IMAGE_REVIEW', GPUCompletionMeasured: false,
        compositorCompletionMeasured: false, realDeviceCostMeasured: false,
        method: 'Same-owner CPU submission only, no readback, screenshots or downloads in measured intervals; RAF between samples.'};
    },
    async dispose() {
      canvas.style.visibility = old.visibility; host.style.backgroundColor = old.background;
      await scene.dispose(); retired = true;
      return {probe: probe.diagnostics(), directCanvases: host.querySelectorAll('canvas').length, backgroundRestored: host.style.backgroundColor === old.background};
    },
  });
  window.__yardQualityNative = api;
  return scene;
}
