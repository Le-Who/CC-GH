// ResourceTiming's default 250-entry buffer also contains fonts, textures and
// API polls. Keep observing JS after it fills, including queued callback entries.
export function installScriptResourceProbe() {
  const scripts = [];
  const append = entries => {
    for (const entry of entries) {
      const path = new URL(entry.name).pathname;
      if (path.endsWith('.js')) scripts.push({ path, encodedBytes: entry.encodedBodySize, transferBytes: entry.transferSize });
    }
  };
  const observer = new PerformanceObserver(list => append(list.getEntries()));
  observer.observe({ type: 'resource', buffered: true });
  window.__gameLoadingResources = { snapshot() { append(observer.takeRecords()); return scripts.map(row => ({ ...row })); } };
}

export function readScriptResources(page) {
  return page.evaluate(() => window.__gameLoadingResources.snapshot());
}
