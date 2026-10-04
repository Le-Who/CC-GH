import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import recovery from '../recovery-tools/ast-recovery.cjs';
import { installGardenNavigationObservation } from './e2e/helpers/gardenNavigationObservation.js';

function traceUseCalls(source) {
  const ast = recovery.acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const calls = [];
  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
        && node.callee.object.name === 'test' && node.callee.property.name === 'use'
        && node.arguments[0]?.type === 'ObjectExpression'
        && node.arguments[0].properties.some(property => (property.key?.name || property.key?.value) === 'trace')) {
      calls.push({ node, fileScope: ancestors.length === 2 && ancestors[0].type === 'Program' && ancestors[1].type === 'ExpressionStatement' });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) visit(child, [...ancestors, node]);
      else if (value && typeof value.type === 'string') visit(value, [...ancestors, node]);
    }
  }
  visit(ast);
  return calls;
}

test('Garden trace fixture is file-scoped so Playwright can discover the viewport groups', () => {
  const source = readFileSync(new URL('./e2e/garden-shelf.spec.js', import.meta.url), 'utf8');
  const validate = text => {
    const calls = traceUseCalls(text);
    assert.equal(calls.length, 1, 'retain the first failed attempt with one file-level trace option');
    assert.equal(calls[0].fileScope, true, 'worker-scoped trace must not be placed inside test.describe');
    assert.equal(calls[0].node.arguments[0].properties.find(property => (property.key?.name || property.key?.value) === 'trace').value.value, 'retain-on-failure');
    return calls[0].node;
  };
  const call = validate(source);
  const withoutTopLevel = source.slice(0, call.start) + source.slice(call.end);
  const nested = withoutTopLevel.replace('const touch=width<1100;', "const touch=width<1100; test.use({trace:'retain-on-failure'});");
  assert.notEqual(nested, withoutTopLevel);
  assert.throws(() => validate(nested), /worker-scoped trace/);
});

function harness() {
  const listeners = new Map(), observers = [];
  let now = 0, homeOpen = true, busy = false, tab = 'garden';
  const add = (prefix, type, callback) => listeners.set(`${prefix}:${type}`, callback);
  const remove = (prefix, type, callback) => {
    if (listeners.get(`${prefix}:${type}`) === callback) listeners.delete(`${prefix}:${type}`);
  };
  const card = { tagName: 'BUTTON', dataset: { homeGame: 'blox' }, disabled: false,
    getAttribute: name => name === 'aria-label' ? 'Blox' : null,
    closest: selector => ['button', '[data-home-game]'].includes(selector) ? card : null };
  const app = { inert: true, getAttribute: () => tab };
  const home = { getAttribute: () => String(busy), querySelector: () => null, querySelectorAll: () => [card] };
  const document = {
    hidden: false, documentElement: {}, activeElement: card,
    addEventListener: (type, callback, capture) => add(capture ? 'document' : 'document-bubble', type, callback),
    removeEventListener: (type, callback, capture) => remove(capture ? 'document' : 'document-bubble', type, callback),
    querySelector: selector => ({ '.telegram-app': app, '[data-testid="home-catalogue"]': homeOpen ? home : null, '.status-dot': { className: 'status-dot ready' } }[selector]),
  };
  const window = {
    history: { state: { __gameHubHome: 2 } }, location: { pathname: '/', search: '' },
    addEventListener: (type, callback) => add('window', type, callback),
    removeEventListener: (type, callback) => remove('window', type, callback),
  };
  const install = vm.runInNewContext(`(${installGardenNavigationObservation.toString()})`, {
    window, document, performance: { now: () => ++now },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = true; observers.push(this); }
      observe() {} disconnect() { this.active = false; }
    },
  });
  return { install, window, document, card, listeners, observers,
    get events() { return window.__gardenNavigationObservation.events; },
    emit(type, prefix = 'document') {
      const event = { type, target: card, isTrusted: true, defaultPrevented: false, pointerId: 1, pointerType: 'mouse', clientX: 520, clientY: 280 };
      listeners.get(`${prefix}:${type}`)?.(event);
      return event;
    },
    state(next) {
      if ('busy' in next) busy = next.busy;
      if ('tab' in next) tab = next.tab;
      if ('home' in next) homeOpen = next.home;
      for (const observer of observers) if (observer.active) observer.callback();
    },
  };
}

test('Garden observer records the original click, real state changes and history without changing input', () => {
  const h = harness(); h.install();
  const before = JSON.stringify({ card: h.card, history: h.window.history, app: h.document.querySelector('.telegram-app') });
  const down = h.emit('pointerdown'), up = h.emit('pointerup'), click = h.emit('click');
  assert.equal(h.events.at(-1).source, 'capture:click');
  assert.equal(h.events.at(-1).homeBusy, 'false');
  h.state({ busy: true }); h.emit('click', 'document-bubble');
  assert.equal(h.events.at(-1).source, 'bubble:click');
  assert.equal(h.events.at(-1).homeBusy, 'true');
  h.emit('popstate', 'window');
  h.state({ home: false, tab: 'blox' });
  assert.equal(h.events.at(-1).tab, 'blox');
  assert.equal(h.events.at(-1).home, false);
  assert.deepEqual([down, up, click].map(event => event.defaultPrevented), [false, false, false]);
  assert.equal(JSON.stringify({ card: h.card, history: h.window.history, app: h.document.querySelector('.telegram-app') }), before);
});

test('missed navigation is preserved as evidence rather than retried or reported as successful', () => {
  const h = harness(); h.install(); h.emit('click'); h.emit('click', 'document-bubble');
  const last = h.events.at(-1);
  assert.equal(last.event.target.game, 'blox');
  assert.equal(last.tab, 'garden'); assert.equal(last.home, true); assert.equal(last.homeBusy, 'false');
  assert.equal(h.events.filter(event => event.source === 'capture:click').length, 1);
});

test('Garden observation is bounded, unchanged DOM callbacks deduplicate, and stop cleans listeners', () => {
  const h = harness(); h.install();
  for (let i = 0; i < 100; i++) h.state({});
  assert.equal(h.events.length, 1);
  for (let i = 0; i < 150; i++) h.emit('pointerdown');
  assert.equal(h.events.length, 96);
  h.window.__gardenNavigationObservation.stop();
  assert.equal(h.listeners.size, 0); assert.equal(h.observers[0].active, false);
  h.emit('click'); h.state({ tab: 'blox' });
  assert.equal(h.events.length, 96);
});

test('replacement disconnects the old Garden recorder without input listeners leaking', () => {
  const h = harness(); h.install(); h.emit('click');
  const old = h.events;
  h.install();
  assert.equal(h.observers[0].active, false); assert.equal(h.observers[1].active, true);
  assert.equal(old.length, 2); assert.equal(h.events.length, 1);
  assert.equal(h.listeners.size, 7);
});
