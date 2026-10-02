import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Persist outside browser RPCs: a timed-out/closed renderer must not hide the
// original assertion, its last completed phase, or the page errors that led to it.
export function gardenDiagnostics(page, testInfo, name = 'garden') {
  const filename = testInfo.outputPath(`${name}-diagnostics.json`);
  const report = { phase: 'created', completed: false, checkpoints: [], pageErrors: [], failure: null };
  function save() {
    try { mkdirSync(path.dirname(filename), { recursive: true }); writeFileSync(filename, JSON.stringify(report, null, 2)); }
    catch (error) { console.error(`[${name}:diagnostics] ${error.message}`); }
  }
  const onError = error => {
    report.pageErrors.push(error.message); save();
    console.error(`[${name}:pageerror] ${error.stack || error.message}`);
  };
  page.on('pageerror', onError); save();
  return {
    errors: report.pageErrors,
    mark(phase) { report.phase = phase; report.checkpoints.push({ phase, at: Date.now() }); save(); },
    fail(error) { report.failure = { message: error.message, stack: error.stack }; save(); console.error(`[${name}:failure:${report.phase}] ${error.stack || error.message}`); },
    complete() { report.completed = true; save(); },
    dispose() { page.off('pageerror', onError); },
  };
}
