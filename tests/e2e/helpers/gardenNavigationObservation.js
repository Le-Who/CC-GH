import { writeFile } from 'node:fs/promises';

/** Read-only failure evidence. No retries, clocks, focus, navigation or game
 * state are changed. Record before/after the real click and subsequent DOM /
 * history transitions so a missed click is distinguishable from a refused leave.
 */
export function installGardenNavigationObservation() {
  window.__gardenNavigationObservation?.stop();
  const events = [];
  let stopped = false, previous = '', observer;
  const describe = node => node ? {
    tag: node.tagName || '', game: node.closest?.('[data-home-game]')?.dataset.homeGame || null,
    label: node.getAttribute?.('aria-label') || null,
    disabled: !!node.closest?.('button')?.disabled,
  } : null;
  const snapshot = () => {
    const app = document.querySelector('.telegram-app');
    const home = document.querySelector('[data-testid="home-catalogue"]');
    return {
      tab: app?.getAttribute('data-active-tab') || null, appInert: !!app?.inert,
      home: !!home, homeBusy: home?.getAttribute('aria-busy') || null,
      homeNotice: home?.querySelector('.home-switch,.home-waiting')?.textContent?.trim().slice(0, 240) || null,
      cards: [...(home?.querySelectorAll('[data-home-game]') || [])].map(node => ({ game: node.dataset.homeGame, disabled: node.disabled })),
      focus: describe(document.activeElement), status: document.querySelector('.status-dot')?.className || null,
      historyHome: window.history.state?.__gameHubHome ?? null,
      url: window.location.pathname + window.location.search, hidden: document.hidden,
    };
  };
  const record = (source, event = null, changedOnly = false) => {
    if (stopped) return;
    const state = snapshot(), signature = JSON.stringify(state);
    if (changedOnly && signature === previous) return;
    previous = signature;
    events.push({ source, at: performance.now(), wallAt: Date.now(), ...state,
      event: event ? { type: event.type, target: describe(event.target), trusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented, pointerId: event.pointerId ?? null,
        pointerType: event.pointerType || null, x: event.clientX ?? null, y: event.clientY ?? null } : null });
    if (events.length > 96) events.shift();
  };
  const onInput = event => {
    record(`capture:${event.type}`, event);
  };
  // React's root is below document: bubbling here observes the real handler's
  // result. If propagation is stopped, the capture-only event remains evidence.
  const onClickBubble = event => record('bubble:click', event);
  const onHistory = event => record('popstate', event);
  const onVisibility = event => record('visibilitychange', event);
  const start = () => {
    if (stopped || observer) return;
    observer = new MutationObserver(() => record('dom-state', null, true));
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-active-tab', 'aria-busy', 'disabled', 'inert', 'class'] });
    record('dom-ready');
  };
  for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, onInput, true);
  document.addEventListener('click', onClickBubble);
  window.addEventListener('popstate', onHistory, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('DOMContentLoaded', start, { once: true });
  window.__gardenNavigationObservation = { events, snapshot, stop() {
    stopped = true;
    observer?.disconnect();
    for (const type of ['pointerdown', 'pointerup', 'click']) document.removeEventListener(type, onInput, true);
    document.removeEventListener('click', onClickBubble);
    window.removeEventListener('popstate', onHistory, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('DOMContentLoaded', start);
  } };
  if (document.documentElement) start();
}

export async function gardenNavigationDiagnostics(page, testInfo) {
  const responses = [];
  let disposed = false;
  const onResponse = async response => {
    const pathname = new URL(response.url()).pathname;
    if (!['/api/player/snapshot', '/api/player/mutate'].includes(pathname)) return;
    const entry = { path: pathname, status: response.status(), at: Date.now() };
    try {
      const body = await response.json(), snapshot = body?.snapshot || body;
      entry.playerId = snapshot?.player?.id || null;
      if (pathname.endsWith('/mutate')) entry.action = response.request().postDataJSON()?.action || null;
    } catch (error) { entry.captureError = error.message; }
    if (!disposed) { responses.push(entry); if (responses.length > 32) responses.shift(); }
  };
  page.on('response', onResponse);
  await page.addInitScript(installGardenNavigationObservation);
  return {
    async save() {
      try {
        const browser = await page.evaluate(() => {
          const observation = window.__gardenNavigationObservation;
          const result = { events: observation?.events || [], final: observation?.snapshot() || null };
          observation?.stop();
          return result;
        }).catch(error => ({ captureError: error.message }));
        const path = testInfo.outputPath('garden-navigation-diagnostics.json');
        await writeFile(path, JSON.stringify({ title: testInfo.title, retry: testInfo.retry, responses, ...browser }, null, 2));
        await testInfo.attach('garden-navigation-diagnostics', { path, contentType: 'application/json' });
      } catch (error) {
        // Evidence collection must never replace the original test failure.
        console.warn(`[garden:navigation-diagnostics] ${error.message}`);
      }
    },
    dispose() { disposed = true; page.off('response', onResponse); },
  };
}
