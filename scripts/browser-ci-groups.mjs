import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// File-level groups keep each spec's serial suites, fixtures and retries intact.
// Cross-game specs stay whole rather than silently dropping tests with --grep.
export const BROWSER_GROUPS = Object.freeze({
  match3: ['match3-motion.spec.js'],
  bubbo: ['bubbo-casual-motion.spec.js', 'bubbo-marine-art.spec.js', 'qa-bubbo-interruption.spec.js'],
  garden: ['garden-accounting.spec.js', 'garden-r2.spec.js', 'garden-shelf.spec.js'],
  merge: ['merge-v3.spec.js'],
  yard: ['companion-yard.spec.js'],
  'cross-game-motion': ['casual-motion.spec.js'],
  'hud-layout': ['glass-ui.spec.js', 'hud-art-visual-regressions.spec.js', 'hud-editor.spec.js', 'hud-redesign-runtime-coverage.spec.js'],
  'mobile-ui': ['mobile-ui-extended.spec.js', 'mobile-ui-matrix.spec.js'],
  'navigation-input': ['gestures.spec.js', 'home-navigation.spec.js', 'minigames.spec.js', 'pause-paint-regression.spec.js'],
  'assets-performance': ['asset-retirement.spec.js', 'assets-runtime.spec.js', 'perf-guard.spec.js', 'split-game-loading.spec.js'],
  'auth-cache-smoke': ['auth.spec.js', 'multi-game-logic-smoke.spec.js', 'player-copy.spec.js', 'sw-api-cache.spec.js'],
});
const specPattern = /\.(spec|test)\.[cm]?[jt]sx?$/;
export function discoverBrowserSpecs(directory) {
  const result = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Browser inventory refuses symlinks: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && specPattern.test(entry.name)) result.push(relative(directory, path).split(sep).join('/'));
    }
  }
  visit(resolve(directory)); return result.sort();
}
export function validateBrowserGroups(specs, groups = BROWSER_GROUPS) {
  const seen = new Set(), available = new Set(specs);
  if (!Object.keys(groups).length || !specs.length) throw Error('Empty browser coverage');
  for (const [group, files] of Object.entries(groups)) {
    if (!/^[a-z][a-z0-9-]*$/.test(group) || !Array.isArray(files) || !files.length) throw Error(`Invalid browser group: ${group}`);
    for (const file of files) {
      if (!available.has(file)) throw Error(`Unknown browser spec: ${group}/${file}`);
      if (seen.has(file)) throw Error(`Duplicate browser spec: ${file}`);
      seen.add(file);
    }
  }
  const orphaned = specs.filter(file => !seen.has(file));
  if (orphaned.length) throw Error(`Unassigned browser specs: ${orphaned.join(', ')}`);
  return { groups: Object.keys(groups).length, specs: seen.size };
}
export function browserArgs(group, groups = BROWSER_GROUPS) {
  if (!Object.hasOwn(groups, group)) throw Error(`Unknown browser group: ${group}`);
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ['exec', 'playwright', 'test', ...groups[group].map(file => `${escape(`tests/e2e/${file}`)}$`), '--project=chromium', '--workers=1'];
}
export function validateDefaultBrowserConfig(source) {
  // Fail closed if future config changes invalidate this exact file inventory.
  if (!/testDir:\s*["']\.\/tests\/e2e["']/.test(source) || /\b(testMatch|testIgnore|grep|grepInvert)\s*:/.test(source)) throw Error('Review browser groups for changed Playwright discovery rules');
  if (!/reuseExistingServer:\s*false/.test(source)) throw Error('Browser groups require isolated web servers');
}
export function validateBrowserDiscovery(report, specs, repositoryRoot = process.cwd()) {
  if (!Array.isArray(report.suites) || (report.errors || []).length) throw Error('Playwright discovery failed');
  const found = new Set(), ids = new Set(); let tests = 0;
  const testRoot = resolve(repositoryRoot, 'tests/e2e');
  function visit(suite) {
    for (const spec of suite.specs || []) {
      let file = String(spec.file || suite.file || '').replaceAll('\\', '/');
      if (file.startsWith('/')) file = relative(testRoot, file).split(sep).join('/');
      else file = file.replace(/^\.\//, '').replace(/^tests\/e2e\//, '');
      if (!specs.includes(file)) throw Error(`Discovered unassigned browser spec: ${file}`);
      if (!Array.isArray(spec.tests) || !spec.tests.length) throw Error(`Empty discovered spec: ${file}`);
      if (typeof spec.id !== 'string' || ids.has(spec.id)) throw Error(`Missing or duplicate discovered test ID: ${file}`);
      ids.add(spec.id); found.add(file);
      for (const entry of spec.tests) {
        if (entry.projectName !== 'chromium') throw Error(`Unexpected discovery project: ${entry.projectName}`);
        tests++;
      }
    }
    for (const child of suite.suites || []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  if (!tests || found.size !== specs.length) throw Error(`Discovery omitted browser files: ${specs.filter(file => !found.has(file)).join(', ')}`);
  return { specs: found.size, tests };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateDefaultBrowserConfig(readFileSync('playwright.config.js', 'utf8'));
  const coverage = validateBrowserGroups(discoverBrowserSpecs('tests/e2e'));
  if (process.argv[2] === '--matrix') console.log(JSON.stringify({ group: Object.keys(BROWSER_GROUPS) }));
  else if (process.argv[2] === '--verify-list') console.log(JSON.stringify(validateBrowserDiscovery(JSON.parse(readFileSync(process.argv[3], 'utf8')), discoverBrowserSpecs('tests/e2e')), null, 2));
  else if (process.argv[2] === '--run') {
    const group = process.argv[3], args = browserArgs(group);
    console.log(JSON.stringify({ group, files: BROWSER_GROUPS[group], coverage, command: ['pnpm', ...args] }));
    const result = spawnSync('pnpm', args, { stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else if (!process.argv[2]) console.log(JSON.stringify({ ...coverage, assignments: BROWSER_GROUPS }, null, 2));
  else throw Error('Usage: browser-ci-groups.mjs [--matrix | --verify-list REPORT | --run GROUP]');
}
