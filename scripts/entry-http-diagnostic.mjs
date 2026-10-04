// Bounded localhost diagnostic only. It does not import or alter the game.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const output = 'artifacts/entry-http-diagnostic.json';
const report = {
  format: 'entry-http-diagnostic/v1', status: 'started', startedAt: new Date().toISOString(),
  sourceCommit: process.env.GITHUB_SHA || '', runId: process.env.GITHUB_RUN_ID || '',
  nodeVersion: process.version, cases: [],
  scope: 'Isolated HTTP/1.1 transport and real font/screenshot readiness; not a full-game reproduction.',
};
await mkdir('artifacts', { recursive: true });
const persist = () => writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
await persist();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 5000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() >= deadline) throw Error(`Diagnostic deadline: ${label}`);
    await pause(20);
  }
}
const digest = value => createHash('sha256').update(value).digest('hex');
const fontPath = new URL('../node_modules/@fontsource/nunito/files/nunito-latin-400-normal.woff2', import.meta.url);
let browser;
try {
  const font = await readFile(fontPath);
  report.font = { source: 'src/fonts.css: Nunito latin normal 400', bytes: font.length, sha256: digest(font) };
  browser = await chromium.launch({ timeout: 10000 });
  report.browserVersion = browser.version();
  for (const holdLimit of [6, 1]) {
    const start = performance.now(), held = [], events = [];
    const elapsed = () => Number((performance.now() - start).toFixed(3));
    let mediaRequests = 0, fontRequests = 0, statusRequests = 0;
    // An explicit test image, never shipped or used as production artwork.
    const image = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>';
    const release = response => { response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); response.end(image); };
    const server = createServer((request, response) => {
      const path = new URL(request.url, 'http://local.invalid').pathname;
      events.push({ path, atServerMs: elapsed(), httpVersion: request.httpVersion });
      if (path.startsWith('/media/')) {
        mediaRequests++;
        if (held.length < holdLimit) held.push(response); else release(response);
      } else if (path === '/font.woff2') {
        fontRequests++; response.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'no-store' }); response.end(font);
      } else if (path === '/status') {
        statusRequests++; response.end('ready');
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        response.end('<!doctype html><html><head><title>Isolated entry transport diagnostic</title></head><body>HTTP connection diagnostic</body></html>');
      }
    });
    const row = { holdLimit, events, status: 'started' }; report.cases.push(row);
    let context;
    try {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      context = await browser.newContext({ viewport: { width: 390, height: 300 } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`, { timeout: 5000 });
      await page.evaluate(() => {
        for (let index = 0; index < 6; index++) { const image = new Image(); image.src = `/media/${index}`; document.body.append(image); }
      });
      await until(() => mediaRequests === 6, 'six media requests reach the real HTTP server');
      await page.evaluate(() => {
        window.readiness = { fontReadyAt: null, fontsReadyAt: null, statusReadyAt: null, error: null, requestedAt: performance.now() };
        const font = new FontFace('EntryDiagnostic', 'url(/font.woff2)');
        document.fonts.add(font);
        const label = document.createElement('div'); label.style.font = '24px EntryDiagnostic'; label.textContent = 'Real Nunito font readiness'; document.body.append(label);
        font.load().then(() => { window.readiness.fontReadyAt = performance.now(); }).catch(error => { window.readiness.error = String(error); });
        document.fonts.ready.then(() => { window.readiness.fontsReadyAt = performance.now(); });
        fetch('/status').then(() => { window.readiness.statusReadyAt = performance.now(); }).catch(error => { window.readiness.error = String(error); });
      });
      let screenshot;
      // Ordinary Playwright screenshot, including its default fonts-ready wait.
      const shot = page.screenshot({ timeout: 10000 }).then(bytes => {
        screenshot = { completedAtServerMs: elapsed(), bytes: bytes.length, sha256: digest(bytes) };
      }).catch(error => { screenshot = { error: String(error) }; });
      await pause(800);
      row.beforeRelease = { atServerMs: elapsed(), heldResponses: held.length, fontRequests, statusRequests, screenshot: screenshot || null, browser: await page.evaluate(() => ({ ...window.readiness, fontsStatus: document.fonts.status })) };
      if (holdLimit === 6) {
        row.releaseOneAtServerMs = elapsed();
        release(held.shift());
      }
      await until(() => !!screenshot, 'default screenshot completes after releasing one response, or with one held response');
      await shot;
      row.afterControl = { atServerMs: elapsed(), heldResponses: held.length, fontRequests, statusRequests, screenshot, browser: await page.evaluate(() => ({ ...window.readiness, fontsStatus: document.fonts.status })) };
      if (screenshot.error) throw Error(screenshot.error);
      row.status = 'completed';
    } finally {
      while (held.length) release(held.shift());
      await context?.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await persist();
    }
  }
  const [six, one] = report.cases;
  report.hypothesisConfirmed = six.beforeRelease.fontRequests === 0
    && six.beforeRelease.browser.fontReadyAt === null && six.beforeRelease.screenshot === null
    && six.afterControl.fontRequests > 0 && six.afterControl.browser.fontReadyAt !== null
    && six.afterControl.heldResponses === 5 && !!six.afterControl.screenshot?.sha256
    && one.afterControl.heldResponses === 1 && one.afterControl.browser.fontReadyAt !== null
    && !!one.afterControl.screenshot?.sha256;
  report.status = 'completed';
} catch (error) {
  report.status = 'failed'; report.error = String(error?.stack || error); process.exitCode = 1;
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  await persist();
  console.log(JSON.stringify(report, null, 2));
}
