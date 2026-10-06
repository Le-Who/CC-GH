/** Preparation only. This file starts Chromium only in the explicitly approved
 * single GitHub Actions job. It serves the exact frozen candidate, without transforms.
 * Pixel evidence requires human review; resource/pose counters cannot pass visual QA. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv.includes('--verify-only') && process.argv[3] ? path.resolve(process.argv[3]) : path.join(BASE, 'candidate');
const OUT = path.join(BASE, 'results');
const EXPECTED_TREE = '52afe885f4f5365acf37b41c73e0a786a0a66c10ccb7e4eae1a5fef893913254';
const EXPECTED_PARENT = 'd8a8a839e3a644f6e317b22594bab5c9aee6cddc';
const BRANCH = 'refs/heads/qa/yard-pip-webgl-pilot-20261006';
const MAX_BYTES = 8 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { format: 'Pip-bounded-native-WebGL-QA/v1', status: 'running',
  commit: process.env.GITHUB_SHA, parent: EXPECTED_PARENT,
  candidateTreeSHA256: EXPECTED_TREE, browserFlagsAdded: [], retries: 0,
  visualAcceptance: 'PENDING_HUMAN_PIXEL_REVIEW',
  limits: { jobMinutes: 10, browserSeconds: 150, artifactBytes: MAX_BYTES, retentionDays: 3 },
  boundaries: [
    'Only the approved GLB and calibrated native planter on an empty background.',
    'No illustrated scene background: final scene art and cottage-relative scale cannot be judged.',
    'Actual shared-depth-buffer pixels, not a diagram or screen-Y sort, must establish front/behind occlusion.',
    'Shader compilation and draw calls do not establish acceptable model appearance or smooth motion.',
    'Pause/resume must keep the isolated visual route supported; no server or economic clock is involved.',
    'Native blur and visibility observations are qualified only if the browser emits those events.',
    'Software WebGL evidence does not establish hardware GPU or real phone performance.'
  ], cases: [], network: [], blockedRequests: [], errors: [] };
function check(value, message) { if (!value) throw Error(message); }
async function filesIn(dir, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.posix.join(prefix, entry.name);
    check(!entry.isSymbolicLink(), 'Symlink outside exact candidate scope');
    if (entry.isDirectory()) result.push(...await filesIn(path.join(dir, entry.name), rel));
    else if (entry.isFile()) result.push(rel);
  }
  return result.sort();
}
async function verifyCandidate() {
  const files = await filesIn(ROOT); let bytes = 0; const lines = [];
  for (const file of files) { const data = await fs.readFile(path.join(ROOT, file)); bytes += data.length; lines.push(`${hash(data)}  ${file}\n`); }
  check(files.length === 21 && bytes === 6323101 && hash(lines.join('')) === EXPECTED_TREE, 'Frozen 21-file candidate changed');
  report.candidate = { files: files.length, bytes, editableGLBBytes: 3972384, vendorBytes: 2288783, ownCodeDataBytes: 61934 };
  return new Set(files);
}

// Observer only: retains native contexts and records compilation/linking and copies.
// No material, clock, animation, camera, GL context options or pixel output is replaced.
function observeNativeRendering() {
  const d = window.__pipNativeQA = { contexts: [], shaderErrors: [], programErrors: [], shaderCompiles: 0, programLinks: 0, copies: 0, events: [] };
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const context = Reflect.apply(get, this, [type, ...args]);
    if (/^webgl/.test(type) && context && !d.contexts.includes(context)) d.contexts.push(context);
    return context;
  };
  const copy = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(...args) {
    const result = Reflect.apply(copy, this, args);
    if (this.canvas.id === 'view' && args[0] instanceof HTMLCanvasElement) d.copies++;
    return result;
  };
  for (const Constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    const p = Constructor.prototype, compile = p.compileShader, link = p.linkProgram;
    p.compileShader = function(shader) { const r = Reflect.apply(compile, this, [shader]); d.shaderCompiles++; if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) d.shaderErrors.push(this.getShaderInfoLog(shader)); return r; };
    p.linkProgram = function(program) { const r = Reflect.apply(link, this, [program]); d.programLinks++; if (!this.getProgramParameter(program, this.LINK_STATUS)) d.programErrors.push(this.getProgramInfoLog(program)); return r; };
  }
  for (const event of ['blur', 'focus', 'pagehide']) window.addEventListener(event, () => d.events.push({ event, at: performance.now(), hidden: document.hidden }));
  document.addEventListener('visibilitychange', () => d.events.push({ event: 'visibilitychange', at: performance.now(), hidden: document.hidden }));
}
function inspectPage() {
  const d = window.__pipNativeQA, view = document.querySelector('#view');
  const pixels = view.getContext('2d').getImageData(0, 0, view.width, view.height).data;
  let opaque = 0, warm = 0, digest = 2166136261, minX = view.width, minY = view.height, maxX = -1, maxY = -1;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 8) { opaque++; const x = (i / 4) % view.width, y = Math.floor(i / 4 / view.width); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (pixels[i + 3] > 100 && pixels[i] > pixels[i + 1] * 1.18 && pixels[i + 1] > pixels[i + 2] * 1.1) warm++;
    digest = Math.imul((digest ^ pixels[i]) >>> 0, 16777619);
  }
  let metrics = null; try { metrics = JSON.parse(document.querySelector('#metrics').textContent); } catch {}
  return { at: performance.now(), status: document.querySelector('#status').textContent, hidden: document.hidden, focus: document.hasFocus(),
    selectedPlacement: document.querySelector('#placement').value, copies: d.copies,
    pixels: { opaque, warm, digest: digest >>> 0, bounds: [minX, minY, maxX, maxY], backing: [view.width, view.height], qualifier: 'mechanical presence only; inspect screenshots for approved Pip identity and occlusion' },
    metrics, shaderCompiles: d.shaderCompiles, programLinks: d.programLinks,
    shaderErrors: d.shaderErrors, programErrors: d.programErrors, events: d.events,
    webgl: d.contexts.map(gl => { const ext = gl.getExtension('WEBGL_debug_renderer_info'); const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR); const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); return { version: gl.getParameter(gl.VERSION), vendor, renderer,
      class: /swiftshader|llvmpipe|softpipe|software/i.test(`${vendor} ${renderer}`) ? 'software' : 'not-known-software; hardware not established', lost: gl.isContextLost() }; }) };
}
async function screenshot(page, name, sceneOnly = true) {
  const filename = `${name}.png`;
  if (sceneOnly) await page.locator('#view').screenshot({ path: path.join(OUT, filename), timeout: 5000 });
  else { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(OUT, filename), timeout: 5000 }); }
  return filename;
}
async function pause(ms) { await new Promise(resolve => setTimeout(resolve, ms)); }
async function observeRun(page, item, label, dense = false, goal = 'A') {
  const initial = await page.evaluate(inspectPage); item.observations.push({ label, ...initial });
  check(initial.status.startsWith(`Moving to ${goal};`), `Expected ${goal} route, got: ${initial.status}`);
  const duration = Number(initial.status.match(/; ([\d.]+) seconds/)?.[1]) * 1000;
  check(duration > 0 && duration <= 10000, 'Route exceeds reviewed duration bound');
  const started = Date.now();
  for (const fraction of dense ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0.2, 0.5, 0.8]) {
    await pause(Math.max(0, started + duration * fraction - Date.now()));
    item.frames.push({ label, fraction, file: await screenshot(page, `${item.name}-${label}-${fraction}`), snapshot: await page.evaluate(inspectPage) });
  }
  await page.waitForFunction(goal => document.querySelector('#status').textContent.startsWith(`Settled at ${goal}.`), goal, { timeout: 12000 });
  const settled = await page.evaluate(inspectPage);
  item.frames.push({ label, fraction: 1, file: await screenshot(page, `${item.name}-${label}-settled`), snapshot: settled });
  check(settled.pixels.opaque > 100 && settled.pixels.warm > 10, 'No substantial rendered model-colour pixels; inspect native screenshot');
  check(settled.programLinks > 0 && !settled.shaderErrors.length && !settled.programErrors.length, 'Shader compilation or program link failed');
  await pause(180); const stable = await page.evaluate(inspectPage);
  item.observations.push({ label: `${label}-supported-finish`, before: settled, after: stable, pixelsStable: settled.pixels.digest === stable.pixels.digest });
  check(settled.pixels.digest === stable.pixels.digest, 'Settled pixels continue moving');
}
async function testGoalControls(page, item, label) {
  // The bounded fixture supports forward continuation. Disable explicitly resets it.
  for (const goal of [1, 2]) {
    for (let earlier = 0; earlier < goal; earlier++) check(await page.locator(`.goal[data-goal="${earlier}"]`).isDisabled(), 'Earlier destination remains enabled');
    const before = await page.evaluate(inspectPage);
    check(await page.locator(`.goal[data-goal="${goal}"]`).isEnabled(), 'Next forward destination is disabled');
    await page.locator(`.goal[data-goal="${goal}"]`).click();
    item.observations.push({ label: `${label}-goal-${goal}-start`, before, after: await page.evaluate(inspectPage) });
    await observeRun(page, item, `${label}-goal-${goal}`, false, ['A', 'B', 'C'][goal]);
  }
  for (const goal of [0, 1, 2]) check(await page.locator(`.goal[data-goal="${goal}"]`).isDisabled(), 'End-of-scenario destination remains enabled');
  item.observations.push({ label: `${label}-C-terminal-controls-disabled`, ...await page.evaluate(inspectPage) });
}

async function run() {
  check(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF === BRANCH && process.env.GITHUB_RUN_ATTEMPT === '1', 'Execution needs the specifically approved GitHub branch, first attempt only');
  const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  check(process.env.GITHUB_EVENT_NAME === 'push' && event.created === true && event.ref === BRANCH && event.after === process.env.GITHUB_SHA && !event.deleted && !event.forced, 'Only the initial creation push of the approved ref may run');
  const candidateFiles = await verifyCandidate();
  await fs.mkdir(OUT, { recursive: true });
  const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.glsl': 'text/plain', '.glb': 'model/gltf-binary', '.txt': 'text/plain' };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1'); const file = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
      if (req.method !== 'GET' || url.search || !candidateFiles.has(file)) { res.writeHead(403); res.end('Outside reviewed static GET scope'); return; }
      const data = await fs.readFile(path.join(ROOT, file)); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(data);
    } catch { res.writeHead(500); res.end('Static fixture read failed'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const deadline = setTimeout(() => { report.errors.push('Bounded 150-second browser window exceeded'); void browser?.close(); }, 150000);
  try {
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ headless: true }); // No WebGL/security flags or fallback browser.
    report.browserVersion = browser.version();
    for (const spec of [{ name: 'phone390', width: 390, height: 844, dpr: 2 }, { name: 'phone320', width: 320, height: 568, dpr: 1 }, { name: 'landscape568', width: 568, height: 320, dpr: 1 }]) {
      const item = { ...spec, observations: [], frames: [], errors: [] }; const contextStarted = Date.now(); report.cases.push(item);
      async function openProbe(recordVideo) {
      const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.dpr, isMobile: true, hasTouch: true, serviceWorkers: 'block',
        ...(recordVideo ? { recordVideo: { dir: path.join(OUT, 'video'), size: { width: 390, height: 844 } } } : {}) });
      await context.addInitScript(observeNativeRendering);
      await context.route('**/*', route => {
        const r = route.request(), u = new URL(r.url()), rel = decodeURIComponent(u.pathname.slice(1)) || 'index.html';
        if (r.method() === 'GET' && u.origin === origin && u.pathname === '/favicon.ico' && !u.search) return route.fulfill({ status: 204, body: '' }); // Empty browser housekeeping response; no external asset.
        if (r.method() !== 'GET' || u.origin !== origin || u.search || !candidateFiles.has(rel)) { report.blockedRequests.push({ method: r.method(), url: r.url() }); return route.abort('blockedbyclient'); }
        report.network.push({ viewport: spec.name, method: r.method(), path: rel }); return route.continue();
      });
      const page = await context.newPage(); await page.bringToFront(); page.setDefaultTimeout(5000);
      page.on('pageerror', error => item.errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') item.errors.push(message.text()); });
      return { context, page };
      }
      let { context, page } = await openProbe(spec.name === 'phone390');
      try {
        await page.goto(origin, { waitUntil: 'networkidle' });
        const baseline = await page.evaluate(inspectPage); item.observations.push({ label: 'default-off', ...baseline });
        check(baseline.webgl.length === 0 && baseline.pixels.opaque === 0 && !report.network.filter(r => r.viewport === spec.name).some(r => r.path === 'assets/pip.glb'), 'Default-off loaded or drew the model');
        const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, controls: [...document.querySelectorAll('button,select')].map(e => ({ id: e.id || e.textContent, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })) }));
        item.layout = layout; check(layout.scrollWidth <= layout.width, 'Horizontal overflow'); check(layout.controls.every(c => c.width >= 44 && c.height >= 44), 'Tap target under 44 CSS pixels');
        check(await page.locator('#enable').isDisabled(), 'Enable should require an explicit first destination');
        await page.locator('#first-goal').selectOption('0');
        await page.locator('#enable').click();
        await page.waitForFunction(() => /Moving to|Test could not start:/.test(document.querySelector('#status').textContent), null, { timeout: 12000 });
        const start = await page.evaluate(inspectPage);
        if (start.status.startsWith('Test could not start:')) { item.blockedCapability = start; report.status = 'BLOCKED_BROWSER_CAPABILITY'; throw Error(start.status); }
        await page.locator('.goal[data-goal="1"]').click(); await page.locator('.goal[data-goal="2"]').click();
        item.observations.push({ label: 'repeated-mid-stride-goal-refusal', ...await page.evaluate(inspectPage) });
        check((await page.locator('#status').textContent()).includes('still moving'), 'Mid-stride replacement was not refused');
        await page.locator('#placement').selectOption('1');
        check(await page.locator('#placement').inputValue() === '0', 'Mid-stride planter change was not reverted');
        item.observations.push({ label: 'mid-stride-planter-refusal', ...await page.evaluate(inspectPage) });
        if (spec.name !== 'phone390') {
          // Observe interruptions mid-route, before a settled pose can hide clock jumps.
          const before = await page.evaluate(inspectPage), cdp = await context.newCDPSession(page);
          await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await pause(500); await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await pause(60);
          item.observations.push({ label: 'mid-stride-native-freeze-resume', before, after: await page.evaluate(inspectPage), note: 'Browser suspension alone does not prove application visibility handling.' });
          const away = await context.newPage(); await away.bringToFront(); const blurStart = await page.evaluate(inspectPage); await pause(450); const blurred = await page.evaluate(inspectPage); await page.bringToFront(); await away.close(); await pause(60);
          const focused = await page.evaluate(inspectPage); const observedVisibility = focused.events.some(e => e.event === 'visibilitychange' && e.hidden), observedBlur = focused.events.some(e => e.event === 'blur');
          item.observations.push({ label: 'mid-stride-native-blur-visibility-resume', blurStart, blurred, focused, visibilityObserved: observedVisibility, blurObserved: observedBlur });
          if (observedBlur && !blurStart.focus) { check(blurStart.copies === blurred.copies && blurStart.pixels.digest === blurred.pixels.digest, 'Native blur did not freeze the supported visual frame'); check(focused.copies > blurred.copies, 'Native refocus did not resume rendering'); }
          if (!observedVisibility || !observedBlur) item.nativeLifecycleCoverage = 'INCOMPLETE: headless Chromium did not emit every required native event; do not claim visibility/blur acceptance';
        }
        // Return status to the actual moving route is not forced: wait/capture it as-is.
        const initialRouteMs = Number(start.status.match(/; ([\d.]+) seconds/)?.[1]) * 1000;
        check(initialRouteMs > 0 && initialRouteMs <= 10000, 'Initial route exceeds reviewed ten-second bound');
        const routeDeadline = Date.now() + initialRouteMs + 2000;
        for (let frame = 0; frame < (spec.name === 'phone390' ? 7 : 2); frame++) {
          item.frames.push({ label: 'placement0-A-native', frame, file: await screenshot(page, `${spec.name}-placement0-${frame}`), snapshot: await page.evaluate(inspectPage) });
          await pause(spec.name === 'phone390' ? 450 : 900);
        }
        await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Settled at A.'), null, { timeout: Math.max(1000, routeDeadline - Date.now()) });
        if (spec.name === 'phone390') {
          // End the single short native video after the initial route/refusal witness.
          item.videoSeconds = (Date.now() - contextStarted) / 1000; await context.close();
          if (item.videoSeconds > 30) { for (const f of await filesIn(OUT)) if (f.endsWith('.webm')) await fs.rm(path.join(OUT, f)); report.videoOmitted = 'Native video exceeded the 30-second short-video bound; retained screenshots and diagnostics.'; }
          ({ context, page } = await openProbe(false));
          await page.goto(origin, { waitUntil: 'networkidle' }); await page.locator('#first-goal').selectOption('0'); await page.locator('#enable').click();
          await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Settled at A.'), null, { timeout: 15000 });
          item.observations.push({ label: 'same-viewport-reopened-after-short-video', ...await page.evaluate(inspectPage) });
          await testGoalControls(page, item, 'placement0');
          await page.locator('#placement').selectOption('1'); item.observations.push({ label: 'planter-relocated', ...await page.evaluate(inspectPage) });
          check(await page.locator('#placement').inputValue() === '1', 'Second planter placement refused');
          item.frames.push({ label: 'planter-moved-at-supported-C', file: await screenshot(page, 'phone390-planter-relocated-at-C'), snapshot: await page.evaluate(inspectPage) });
          await page.locator('#disable').click(); const off = await page.evaluate(inspectPage); item.observations.push({ label: 'disposed', ...off });
          check(await page.locator('#first-goal').isEnabled() && await page.locator('#placement').isEnabled(), 'Disable did not unlock setup');
          check(off.pixels.opaque === 0 && await page.locator('#enable').isEnabled(), 'Disable did not clear stage and restore enable');
          await page.locator('#enable').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Moving to'), null, { timeout: 12000 });
          await observeRun(page, item, 'placement1-reenabled-A', true);
          await testGoalControls(page, item, 'placement1');
        } else {
          await page.setViewportSize({ width: spec.width - 16, height: spec.height }); await pause(150); await page.setViewportSize({ width: spec.width, height: spec.height }); await pause(150);
          item.observations.push({ label: 'populated-resize-restored', ...await page.evaluate(inspectPage) });
        }
        item.frames.push({ label: 'controls-and-scene', file: await screenshot(page, `${spec.name}-viewport`, false) });
        const final = await page.evaluate(inspectPage); item.observations.push({ label: 'final', ...final });
        check(final.webgl.some(g => String(g.version).includes('WebGL 2')), 'Ordinary Chromium did not create WebGL2');
        check(final.pixels.opaque > 100 && final.pixels.warm > 10, 'Model-colour pixels absent');
        check(!final.shaderErrors.length && !final.programErrors.length, 'Actual GL compile/link error');
        check(!item.errors.length, 'Browser reported errors');
      } catch (error) { item.errors.push(String(error)); try { item.failureScreenshot = await screenshot(page, `${spec.name}-failure`, false); item.failureSnapshot = await page.evaluate(inspectPage); } catch {} }
      finally { await context.close(); item.elapsedSeconds = (Date.now() - contextStarted) / 1000; }
      if (item.nativeLifecycleCoverage) report.boundaries.push(`${spec.name}: ${item.nativeLifecycleCoverage}`);
      if (item.blockedCapability) break; // No alternative renderer or flags; report exact capability block.
    }
  } catch (error) { report.errors.push(String(error)); }
  finally { clearTimeout(deadline); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  if (report.status === 'running') report.status = report.errors.length || report.cases.some(c => c.errors.length) || report.blockedRequests.length ? 'FUNCTIONAL_FAILURE_REQUIRES_REVIEW' : 'NATIVE_EVIDENCE_READY_VISUAL_ACCEPTANCE_PENDING';
  let artifacts = await filesIn(OUT), total = 0;
  for (const f of artifacts) total += (await fs.stat(path.join(OUT, f))).size;
  if (total > MAX_BYTES - 256 * 1024) { for (const f of artifacts.filter(f => f.endsWith('.webm'))) await fs.rm(path.join(OUT, f)); report.videoOmitted = 'Native video exceeded the eight MiB evidence budget; retained screenshots and diagnostics.'; }
  report.artifacts = [];
  for (const f of await filesIn(OUT)) { const data = await fs.readFile(path.join(OUT, f)); report.artifacts.push({ path: f, bytes: data.length, sha256: hash(data) }); }
  await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  total = 0; for (const f of await filesIn(OUT)) total += (await fs.stat(path.join(OUT, f))).size;
  check(total <= MAX_BYTES, 'Evidence exceeds eight MiB; workflow will refuse artifact upload');
  console.log(JSON.stringify({ status: report.status, bytes: total, cases: report.cases.length }));
  if (report.status !== 'NATIVE_EVIDENCE_READY_VISUAL_ACCEPTANCE_PENDING') process.exitCode = 1;
}
if (process.argv.includes('--verify-only')) { await verifyCandidate(); console.log('Exact frozen candidate verified; no server or browser started.'); }
else await run();
