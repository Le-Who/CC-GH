import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installGardenNavigationObservation } from './e2e/helpers/gardenNavigationObservation.js';

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
