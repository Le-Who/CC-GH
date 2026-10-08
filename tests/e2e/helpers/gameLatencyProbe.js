// Test-only, read-only observation. Never retain auth headers, query strings,
// account IDs, full API bodies, or private journal contents.
export function installGameLatencyProbe() {
  const events = [], resources = [], longTasks = [], observers = [];
  const mark = (name, detail = {}) => events.push({name, at: performance.now(), ...detail});
  const pathOf = value => { try { return new URL(value, location.href).pathname; } catch { return ''; } };
  const originalFetch = window.fetch;
  window.fetch = async function(input, options) {
    const path = pathOf(typeof input === 'string' || input instanceof URL ? input : input.url);
    const tracked = ['/api/config', '/api/player/snapshot', '/api/player/mutate'].includes(path);
    let command = null;
    if (tracked && typeof options?.body === 'string') {
      try { const body = JSON.parse(options.body); command = body.action === 'garden.r2' ? body.payload?.command : body.action; } catch {}
    }
    if (tracked) mark('api-start', {path, command});
    try {
      const response = await originalFetch.call(this, input, options);
      if (tracked) {
        mark('api-headers', {path, command, status: response.status});
        void response.clone().json().then(body => mark('api-body-observed', {
          path, command, receiptConfirmed: body.receiptConfirmed === true,
          error: typeof body.error === 'string' ? body.error : null,
        })).catch(() => mark('api-body-unreadable', {path, command}));
      }
      return response;
    } catch (error) { if (tracked) mark('api-failed', {path, command, error: error.name}); throw error; }
  };
  const appendResources = entries => {
    for (const e of entries) resources.push({path: pathOf(e.name), initiatorType: e.initiatorType,
      startTime: e.startTime, requestStart: e.requestStart, responseStart: e.responseStart,
      responseEnd: e.responseEnd, duration: e.duration, encodedBytes: e.encodedBodySize,
      transferBytes: e.transferSize, workerStart: e.workerStart, deliveryType: e.deliveryType || ''});
  };
  const resourceObserver = new PerformanceObserver(list => appendResources(list.getEntries()));
  resourceObserver.observe({type: 'resource', buffered: true}); observers.push(resourceObserver);
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({startTime: e.startTime, duration: e.duration}))));
    observer.observe({type: 'longtask', buffered: true}); observers.push(observer);
  }
  let previous = '';
  const observeDom = () => {
    const plant = document.querySelector('.gs2-plant-target');
    const state = {tab: document.querySelector('[data-active-tab]')?.dataset.activeTab || null,
      gardenMounted: !!document.querySelector('.gs2-stage'), plantEnabled: !!plant && !plant.disabled,
      panel: document.querySelector('[data-garden-panel]')?.dataset.gardenPanel || null,
      fallback: !!document.querySelector('.game-entry-status'), home: !!document.querySelector('[data-testid="home-catalogue"]')};
    const signature = JSON.stringify(state);
    if (signature !== previous) { previous = signature; mark('dom-state', state); }
  };
  const mutation = new MutationObserver(observeDom);
  mutation.observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'data-active-tab', 'data-garden-panel']});
  document.addEventListener('pointerup', event => mark('pointerup', {target: event.target.closest?.('[data-home-game]')?.dataset.homeGame || event.target.closest?.('button')?.className || ''}), true);
  mark('probe-installed');
  window.__gameLatency = {mark, snapshot() {
    appendResources(resourceObserver.takeRecords()); observeDom();
    const navigation = performance.getEntriesByType('navigation')[0];
    return {events: [...events], resources: [...resources], longTasks: [...longTasks],
      navigation: navigation ? {startTime: navigation.startTime, responseStart: navigation.responseStart, responseEnd: navigation.responseEnd, domContentLoadedEventEnd: navigation.domContentLoadedEventEnd} : null,
      connection: {saveData: navigator.connection?.saveData ?? null, effectiveType: navigator.connection?.effectiveType ?? null},
      visibility: document.visibilityState};
  }};
}

export async function saveGameLatency(page, testInfo, name, extra = {}) {
  const evidence = await page.evaluate(() => window.__gameLatency?.snapshot() || {probeMissing: true}).catch(error => ({captureError: error.message}));
  await testInfo.attach(name, {body: Buffer.from(JSON.stringify({...extra, ...evidence}, null, 2)), contentType: 'application/json'});
}
