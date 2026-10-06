/** Native follow-up QA. Local preparation only; the coordinator owns review and the one bounded run.
 * No frame/image fabrication: native browser pixels, explicit held-pose diagnostics,
 * original-time video trimming, and separately reported software/native-event limits. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile), HERE = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATE = process.argv.includes('--verify-only') && process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(HERE, '../candidate'), OUT = path.resolve(HERE, '../followup-results');
const BRANCH = 'refs/heads/qa/yard-pip-webgl-followup-setupfix-20261006', CAP = 8 * 1024 * 1024;
const CAPTURE_MS = 6500, PIXEL_TOLERANCE = 14, OVERLAP_MIN_PIXELS = 32;
const report = { format: 'Pip-native-followup-QA/v1', status: 'RUNNING', retries: 0, browserFlagsAdded: [],
  visualAcceptance: 'PENDING_NATIVE_PIXEL_AND_CLEAN_VIDEO_REVIEW', hardwareMobilePerformance: 'NOT_TESTED',
  modes: [], occlusion: [], lifecycle: {}, errors: [], blockedRequests: [], boundaries: [
    'One existing approved model and calibrated planter proxy. No final illustrated scene or cottage-relative-scale acceptance.',
    'Two separately safe planter placements establish opposite depth orders. They are not a demonstrated single route around a fixed obstacle.',
    'Projected hull search selects candidates only. Native isolated/together pixels must establish actual common silhouette and occlusion.',
    'A fast render submission call is not GPU completion or displayed FPS. RAF, displayed route timestamps and recorded-frame deltas are separate observations.',
    'The encoded native video samples the compositor at its own rate. Recorded-frame changes are not unrestricted GPU/mobile FPS.',
    'Absent native blur, visibility or pagehide events leave that category unqualified. Synthetic dispatch is not used.'
  ] };
const assert = (v, m) => { if (!v) throw Error(m); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = b => createHash('sha256').update(b).digest('hex');
async function list(dir, prefix = '') { const out = []; for (const e of await fs.readdir(dir, { withFileTypes: true })) { assert(!e.isSymbolicLink(), 'No symlink assets'); const p = path.posix.join(prefix, e.name); if (e.isDirectory()) out.push(...await list(path.join(dir, e.name), p)); else if (e.isFile()) out.push(p); } return out.sort(); }
async function verify() {
  const pin = JSON.parse(await fs.readFile(path.join(HERE, 'candidate-pin.json'), 'utf8'));
  const names = await list(CANDIDATE); assert(names.length === pin.files.length, 'Candidate file count changed');
  for (const f of pin.files) { const b = await fs.readFile(path.join(CANDIDATE, f.path)); assert(names.includes(f.path) && b.length === f.bytes && sha(b) === f.sha256, `Candidate changed: ${f.path}`); }
  return new Set(names);
}
function observeGL() {
  const d = window.__pipNativeObserver = { contexts: [], shaderErrors: [], programErrors: [], nativeEvents: [] };
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) { const c = Reflect.apply(get, this, [type, ...args]); if (/^webgl/.test(type) && c && !d.contexts.includes(c)) d.contexts.push(c); return c; };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    const p = C.prototype, compile = p.compileShader, link = p.linkProgram;
    p.compileShader = function(s) { const r = Reflect.apply(compile, this, [s]); if (!this.getShaderParameter(s, this.COMPILE_STATUS)) d.shaderErrors.push(this.getShaderInfoLog(s)); return r; };
    p.linkProgram = function(s) { const r = Reflect.apply(link, this, [s]); if (!this.getProgramParameter(s, this.LINK_STATUS)) d.programErrors.push(this.getProgramInfoLog(s)); return r; };
  }
  const capture = event => d.nativeEvents.push({ type: event.type, trusted: event.isTrusted, at: performance.now(), hidden: document.hidden, focus: document.hasFocus() });
  for (const t of ['blur', 'focus', 'pagehide', 'pageshow']) window.addEventListener(t, capture);
  document.addEventListener('visibilitychange', capture);
  window.addEventListener('pip-fixture-lifecycle', e => console.log('__PIP_LIFECYCLE__' + JSON.stringify({ fixture: e.detail, nativeEvents: d.nativeEvents })));
}
function snapshot() {
  const d = window.__pipNativeObserver;
  return { fixture: window.__pipFixture.snapshot(), observer: { nativeEvents: d.nativeEvents, shaderErrors: d.shaderErrors, programErrors: d.programErrors,
    contexts: d.contexts.map(gl => { if (gl.isContextLost()) return { lost: true }; const x = gl.getExtension('WEBGL_debug_renderer_info'), vendor = gl.getParameter(x ? x.UNMASKED_VENDOR_WEBGL : gl.VENDOR), renderer = gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER); return { lost: false, version: gl.getParameter(gl.VERSION), vendor, renderer, classification: /swiftshader|llvmpipe|software|softpipe/i.test(`${vendor} ${renderer}`) ? 'software' : 'not-known-software; hardware not established' }; }) } };
}
async function stageRect(page) { const r = await page.locator('#stage').boundingBox(); const v = page.viewportSize(); assert(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= v.width && r.y + r.height <= v.height, 'Entire fixed stage must fit viewport before capture'); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.floor(r.width / 2) * 2, height: Math.floor(r.height / 2) * 2 }; }
async function still(page, name, rect) { const b = await page.screenshot({ clip: rect, scale: 'css', timeout: 10000 }); await fs.writeFile(path.join(OUT, name), b); return b; }
function summarizeNumbers(a) { if (!a.length) return null; const s = [...a].sort((a, b) => a - b); return { n: a.length, min: s[0], median: s[Math.floor(s.length * .5)], p95: s[Math.min(s.length - 1, Math.floor(s.length * .95))], max: s.at(-1) }; }

function timingSummary(fixture) {
  const moving = fixture.timings.filter(x => x.phase === 'moving'), intervals = key => moving.slice(1).map((x, i) => x[key] - moving[i][key]).filter(Number.isFinite);
  const raf = intervals('rafTimestampMs'), displayed = intervals('sampledElapsedMs');
  return { movingSamples: moving.length, timingDropped: fixture.timingDropped, samplingWindow: fixture.timingDropped ? 'TRUNCATED; do not treat summary as complete route coverage' : 'complete bounded ring', rafIntervalsMs: summarizeNumbers(raf), displayedRouteIntervalsMs: summarizeNumbers(displayed), rafLateOver25ms: raf.filter(x => x > 25).length, rafLateOver50ms: raf.filter(x => x > 50).length,
    totalCallsMs: summarizeNumbers(moving.map(x => x.totalCallMs)), wholeDrawImageMs: summarizeNumbers(moving.map(x => x.drawImageCallMs).filter(Number.isFinite)), renderSubmissionMs: summarizeNumbers(moving.map(x => x.renderSubmitMs)),
    qualifier: 'All observations belong to the recorded browser/backend. RAF and encoded-frame cadence are not hardware GPU completion or mobile FPS.' };
}

async function inspectVideo(raw, mode, rect) {
  const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', raw], { maxBuffer: 2 * CAP })).stdout);
  const times = probe.frames.map(f => Number(f.best_effort_timestamp_time));
  const marker = await exec('ffmpeg', ['-v', 'error', '-i', raw, '-vf', 'crop=16:16:366:4,scale=1:1:flags=neighbor,format=rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: CAP });
  const rgb = marker.stdout; assert(rgb.length / 3 === times.length, 'Native marker/frame timestamp count mismatch');
  const find = (predicate, from = 0) => { for (let i = from; i < times.length; i++) if (predicate(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])) return i; return -1; };
  const begin = find((r, g, b) => r > 150 && g < 115 && b > 150), end = find((r, g, b) => r < 115 && g > 150 && b > 150, Math.max(0, begin + 1));
  assert(begin >= 0 && end > begin, 'Clean interval markers missing in native video'); const start = times[begin], duration = times[end] - start;
  assert(duration >= 5 && duration <= 8, `Native clean interval outside5–8s: ${duration}`);
  const crop = `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y}`;
  const delta = await exec('ffmpeg', ['-hide_banner', '-i', raw, '-vf', `trim=start=${start}:duration=${duration},${crop},format=gray,tblend=all_mode=difference,signalstats,metadata=print`, '-an', '-f', 'null', '-'], { maxBuffer: 2 * CAP });
  const values = [...delta.stderr.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map(m => Number(m[1]));
  const summary = { nativeStartSeconds: start, nativeDurationSeconds: duration, frames: end - begin, frameTimestampIntervalsMs: summarizeNumbers(times.slice(begin + 1, end).map((t, i) => 1000 * (t - times[begin + i]))), recordedMeanPixelDelta: summarizeNumbers(values), deltaQualifier: 'Grayscale native recorded-frame change; includes a deliberate settled tail and is not GPU completion or hardware FPS.' };
  if (mode === 'direct') {
    const file = 'direct-clean-native-6s.webm';
    await exec('ffmpeg', ['-v', 'error', '-i', raw, '-ss', String(start), '-t', String(duration), '-vf', crop, '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-row-mt', '1', '-y', path.join(OUT, file)], { maxBuffer: CAP });
    summary.file = file; summary.processing = 'Decode native video, remove setup/marker/UI margins, lossless VP9 encode; no setpts/fps interpolation/speed change.';
  }
  return summary;
}
async function captureClean(page, mode) {
  const rect = await stageRect(page);
  await page.evaluate(async mode => { await window.__pipFixture.prepare({ mode, goalIndex: 0, placementIndex: 0, overlapPlacement: 'planter-nearer' }); }, mode);
  const prepared = await page.evaluate(snapshot); assert(!prepared.observer.shaderErrors.length && !prepared.observer.programErrors.length, 'Actual GL compilation failed');
  await page.evaluate(() => { const m = document.createElement('div'); m.id = 'qa-recording-marker'; Object.assign(m.style, { position: 'fixed', left: '366px', top: '4px', width: '16px', height: '16px', background: '#ffffff', zIndex: '2147483647', pointerEvents: 'none' }); document.body.append(m); });
  await sleep(200);
  const begin = await page.evaluate(() => { document.querySelector('#qa-recording-marker').style.background = '#ff00ff'; const started = window.__pipFixture.start(); return { at: performance.now(), started }; });
  assert(!begin.started.prepared && begin.started.pauseReasons.length === 0, 'Clean start remained prepared or paused');
  // Deliberately no screenshot, readback, scrolling, resizing, focus changes or evaluate polling here.
  await sleep(CAPTURE_MS);
  const end = await page.evaluate(() => { document.querySelector('#qa-recording-marker').style.background = '#00ffff'; return { at: performance.now(), snapshot: window.__pipFixture.snapshot() }; });
  await sleep(160);
  const idle = await page.evaluate(() => window.__pipFixture.snapshot());
  assert(idle.frameCount === end.snapshot.frameCount && idle.scheduler?.pending === false, 'Settled idle continued drawing or scheduling RAF');
  const moving = end.snapshot.timings.filter(t => t.phase === 'moving');
  assert(moving.length >= 3 && moving.at(-1).sampledElapsedMs > moving[0].sampledElapsedMs, 'Clean window lacks advancing native moving samples');
  assert(end.snapshot.route.settled && end.snapshot.route.displayedElapsedMs === end.snapshot.route.durationMs && end.snapshot.scheduler?.pending === false, 'Clean route failed to settle and become idle');
  assert(mode === 'direct' ? end.snapshot.renderer.copies === 0 && end.snapshot.renderer.directPresentations > 0 : end.snapshot.renderer.copies > 0, 'Presentation counters do not establish the requested direct/copy mode');
  return { rect, prepared, begin, end, idle, timingSummary: timingSummary(end.snapshot), cleanWallWindowMs: end.at - begin.at, intendedWindowMs: CAPTURE_MS };
}
async function maskProof(page, rect, choice) {
  await page.evaluate(async choice => { await window.__pipFixture.prepare({ mode: 'direct', goalIndex: 0, placementIndex: 0 }); window.__pipFixture.renderAt({ elapsedMs: 3545, visibility: 'both' }); window.__pipFixture.setOverlapWitness(choice); }, choice);
  const images = {}, snapshots = {};
  for (const visibility of ['empty', 'pet', 'planter', 'both']) {
    await page.evaluate(visibility => window.__pipFixture.renderAt({ elapsedMs: 3545, visibility }), visibility);
    snapshots[visibility] = await page.evaluate(snapshot);
    images[visibility] = await still(page, `depth-${choice}-${visibility}.png`, rect);
  }
  const sharp = (await import('sharp')).default, decoded = {};
  for (const [name, data] of Object.entries(images)) decoded[name] = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const empty = decoded.empty, n = empty.data.length; assert(Object.values(decoded).every(x => x.data.length === n), 'Depth witness image dimensions changed');
  const different = (a, b, i) => Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > PIXEL_TOLERANCE;
  let overlap = 0, petWins = 0, planterWins = 0, ambiguous = 0;
  for (let i = 0; i < n; i += 4) if (different(decoded.pet.data, empty.data, i) && different(decoded.planter.data, empty.data, i)) {
    overlap++; const isPet = !different(decoded.both.data, decoded.pet.data, i), isPlanter = !different(decoded.both.data, decoded.planter.data, i);
    if (isPet && !isPlanter) petWins++; else if (isPlanter && !isPet) planterWins++; else ambiguous++;
  }
  const expectedWins = choice === 'pip-nearer' ? petWins : planterWins;
  const proof = { choice, snapshots, imageDimensions: empty.info, overlapPixels: overlap, petWins, planterWins, ambiguous, meaningfulOverlap: overlap >= OVERLAP_MIN_PIXELS, expectedOccluderDominates: expectedWins >= Math.max(OVERLAP_MIN_PIXELS / 2, overlap * .6), visualArtAcceptance: 'PENDING_HUMAN_REVIEW', note: 'These are real native pixel masks at one held supported pose; not final prop art or a single moving route changing depth order.' };
  return proof;
}
async function compareCopyPresentation(page, rect) {
  await page.evaluate(async () => { await window.__pipFixture.prepare({ mode: 'copy', goalIndex: 0, placementIndex: 0, overlapPlacement: 'planter-nearer' }); window.__pipFixture.renderAt({ elapsedMs: 3545, visibility: 'both' }); });
  const observed = await page.evaluate(snapshot), file = 'copy-supported-A-same-depth.png'; await still(page, file, rect);
  const sharp = (await import('sharp')).default, buffers = await Promise.all(['depth-planter-nearer-both.png', file, 'depth-planter-nearer-empty.png'].map(async name => sharp(await fs.readFile(path.join(OUT, name))).ensureAlpha().raw().toBuffer()));
  const [direct, copy, empty] = buffers; assert(direct.length === copy.length && copy.length === empty.length, 'Direct/copy native image sizes differ'); let union = 0, changed = 0, sum = 0;
  for (let i = 0; i < direct.length; i += 4) { const visible = [0, 1, 2].some(c => Math.abs(direct[i+c]-empty[i+c]) > PIXEL_TOLERANCE || Math.abs(copy[i+c]-empty[i+c]) > PIXEL_TOLERANCE); if (!visible) continue; union++; const delta = [0, 1, 2].map(c => Math.abs(direct[i+c]-copy[i+c])); sum += delta.reduce((a,b)=>a+b,0); if (Math.max(...delta) > PIXEL_TOLERANCE) changed++; }
  return { file, snapshot: observed, visibleUnionPixels: union, changedVisiblePixels: changed, meanVisibleRGBDifference: union ? sum / (3*union) : null, qualification: 'Native supported-pose comparison; inspect both images. No perceptual/art pass is inferred from a small mean.' };
}

async function lifecycle(page, context, receipts) {
  await page.evaluate(async () => { await window.__pipFixture.prepare({ mode: 'direct', goalIndex: 0, placementIndex: 0 }); window.__pipFixture.start(); });
  await sleep(300); const before = await page.evaluate(snapshot);
  const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront(); await sleep(150);
  const pausedStart = await page.evaluate(snapshot); await sleep(350); const pausedEnd = await page.evaluate(snapshot);
  await page.bringToFront(); await other.close(); await sleep(150); const resumed = await page.evaluate(snapshot);
  const events = resumed.observer.nativeEvents.filter(e => e.trusted), blur = events.some(e => e.type === 'blur'), hidden = events.some(e => e.type === 'visibilitychange' && e.hidden), focus = events.some(e => e.type === 'focus'), visible = events.some(e => e.type === 'visibilitychange' && !e.hidden);
  const result = { before, pausedStart, pausedEnd, resumed, nativeBlur: blur, nativeHidden: hidden, nativeFocus: focus, nativeVisible: visible, qualification: blur && hidden && focus && visible ? 'NATIVE_EVENTS_EMITTED_VALUES_REQUIRE_REVIEW' : 'UNQUALIFIED_MISSING_NATIVE_EVENTS' };
  if (blur && hidden) assert(pausedStart.fixture.route.displayedElapsedMs === pausedEnd.fixture.route.displayedElapsedMs && pausedEnd.fixture.pauseReasons.length > 0, 'Actual hidden/blur did not preserve displayed pose');
  if (focus && visible) assert(resumed.fixture.route.activeElapsedMs > pausedEnd.fixture.route.activeElapsedMs, 'Actual native resume did not advance active route');
  await page.goto('about:blank'); await sleep(100); result.pagehideReceipts = [...receipts];
  result.pagehideQualification = receipts.some(r => r.nativeEvents.some(e => e.type === 'pagehide' && e.trusted) && r.fixture.disposed && r.fixture.scheduler === null && r.fixture.renderer === null && r.fixture.lifecycle.pagehides > 0 && r.fixture.lastDisposed?.renderer?.disposed === true && r.fixture.lastDisposed?.renderer?.mounted === false && r.fixture.lastDisposed?.scheduler?.disposed === true && r.fixture.lastDisposed?.scheduler?.pending === false) ? 'DISPOSAL_RECEIPT_OBSERVED' : 'UNQUALIFIED_NO_POST_PAGEHIDE_DISPOSAL_RECEIPT';
  return result;
}
async function main() {
  assert(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF === BRANCH && process.env.GITHUB_RUN_ATTEMPT === '1', 'Needs the scoped first-attempt follow-up job');
  const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH)); assert(event.created === true && !event.forced && !event.deleted && event.after === process.env.GITHUB_SHA, 'Initial approved creation push only');
  const allowed = await verify(); await fs.mkdir(OUT, { recursive: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glsl': 'text/plain', '.glb': 'model/gltf-binary' };
  const server = http.createServer(async (req, res) => { try { const u = new URL(req.url, 'http://127.0.0.1'), name = decodeURIComponent(u.pathname.slice(1)) || 'index.html'; if (req.method !== 'GET' || !allowed.has(name) || [...u.searchParams].some(([k, v]) => k !== 'qa' || v !== '1')) { res.writeHead(403); return res.end(); } const b = await fs.readFile(path.join(CANDIDATE, name)); res.writeHead(200, { 'content-type': mime[path.extname(name)] || 'text/plain', 'cache-control': 'no-store' }); res.end(b); } catch { res.writeHead(500); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  let browser; const limit = setTimeout(() => { report.errors.push('150-second browser limit reached'); void browser?.close(); }, 150000);
  try {
    const { chromium } = await import('@playwright/test'); browser = await chromium.launch({ headless: false }); report.browserVersion = browser.version(); report.display = 'headed ordinary Chromium on Xvfb; no added browser flags';
    async function open(recordVideo = false) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(recordVideo ? { recordVideo: { dir: path.join(OUT, 'raw'), size: { width: 390, height: 844 } } } : {}) });
      await context.addInitScript(observeGL); await context.route('**/*', route => { const q = route.request(), u = new URL(q.url()), name = decodeURIComponent(u.pathname.slice(1)) || 'index.html'; if (u.origin === origin && u.pathname === '/favicon.ico' && q.method() === 'GET') return route.fulfill({ status: 204, body: '' }); if (q.method() !== 'GET' || u.origin !== origin || !allowed.has(name) || [...u.searchParams].some(([k, v]) => k !== 'qa' || v !== '1')) { report.blockedRequests.push({ method: q.method(), url: q.url() }); return route.abort(); } return route.continue(); });
      const page = await context.newPage(), receipts = []; page.setDefaultTimeout(10000); page.on('pageerror', e => report.errors.push(String(e))); page.on('console', m => { if (m.text().startsWith('__PIP_LIFECYCLE__')) receipts.push(JSON.parse(m.text().slice('__PIP_LIFECYCLE__'.length))); else if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(origin + '/?qa=1', { waitUntil: 'networkidle' }); await page.bringToFront(); await page.waitForFunction(() => Boolean(window.__pipFixture)); return { context, page, receipts };
    }
    // Identical clean measurement windows in both modes, without interleaved QA activity.
    for (const mode of ['direct', 'copy']) { const { context, page } = await open(true); let item; try { item = { mode, ...await captureClean(page, mode) }; report.modes.push(item); } finally { const video = page.video(); await context.close(); if (item) item.rawVideo = await video.path(); } }
    const { context, page, receipts } = await open(false);
    try { const rect = await stageRect(page); for (const choice of ['planter-nearer', 'pip-nearer']) { try { const proof = await maskProof(page, rect, choice); report.occlusion.push(proof); assert(proof.meaningfulOverlap && proof.expectedOccluderDominates, `Insufficient native overlap/depth evidence for ${choice}`); } catch (e) { report.errors.push(String(e)); } }
      try { report.presentationComparison = await compareCopyPresentation(page, rect); } catch (e) { report.errors.push(String(e)); }
      report.lifecycle = await lifecycle(page, context, receipts);
      await page.goto(origin + '/?qa=1', { waitUntil: 'networkidle' }); await page.evaluate(() => window.__pipFixture.prepare({ mode: 'direct', goalIndex: 0, placementIndex: 0 }));
      report.resize = []; let previous = await page.evaluate(snapshot); for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) { await page.setViewportSize(viewport); await sleep(200); const current = await page.evaluate(snapshot); assert(current.fixture.route.displayedElapsedMs === previous.fixture.route.displayedElapsedMs && current.fixture.frameCount > previous.fixture.frameCount && current.fixture.scheduler.pending === false, 'Held resize did not redraw the same supported pose and stop'); report.resize.push({ viewport, stageRect: await page.locator('#stage').boundingBox(), snapshot: current, qualification: 'Held-pose backing/redraw check only; not a full compact-layout acceptance' }); previous = current; }
    } finally { await context.close(); }
  } catch (e) { report.errors.push(String(e)); }
  finally { clearTimeout(limit); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  // Postprocessing reads only native recordings. Browser time is already closed.
  for (const item of report.modes) if (item.rawVideo) { try { item.recording = await inspectVideo(item.rawVideo, item.mode, item.rect); } catch (e) { report.errors.push(String(e)); } }
  // Keep native source evidence when a marker/capture/processing failure needs diagnosis.
  // The same cap still wins; never expand uploads to preserve a failed recording.
  report.rawEvidence = { retainedOnFailure: report.errors.length > 0, omitted: [] };
  if (!report.errors.length) await fs.rm(path.join(OUT, 'raw'), { recursive: true, force: true });
  else {
    const files = await list(OUT); let total = 0; const raw = [];
    for (const f of files) { const size = (await fs.stat(path.join(OUT, f))).size; total += size; if (f.startsWith('raw/')) raw.push({ path: f, bytes: size }); }
    raw.sort((a, b) => b.bytes - a.bytes);
    for (const f of raw) if (total > CAP - 1024 * 1024) { await fs.rm(path.join(OUT, f.path)); total -= f.bytes; report.rawEvidence.omitted.push({ ...f, reason: 'Existing eight MiB cap plus report reserve; no expanded upload.' }); }
  }
  for (const item of report.modes) delete item.rawVideo;
  report.status = report.errors.length || report.blockedRequests.length ? 'FAILURE_OR_MISSING_EVIDENCE' : 'NATIVE_EVIDENCE_READY_VISUAL_AND_HARDWARE_ACCEPTANCE_PENDING';
  report.artifacts = []; for (const f of await list(OUT)) { const b = await fs.readFile(path.join(OUT, f)); report.artifacts.push({ path: f, bytes: b.length, sha256: sha(b) }); }
  await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); let bytes = 0; for (const f of await list(OUT)) bytes += (await fs.stat(path.join(OUT, f))).size; assert(bytes <= CAP, 'Eight MiB evidence cap exceeded; upload must be refused'); console.log(JSON.stringify({ status: report.status, bytes })); if (report.status.startsWith('FAILURE')) process.exitCode = 1;
}
if (process.argv.includes('--verify-only')) { await verify(); console.log('Pinned candidate verified without server/browser.'); } else await main();
