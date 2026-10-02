import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Execute the exact production hook body with explicit React/Telegram boundaries.
 * This is a pure behavior fixture, not an authenticated Telegram or browser test. */
export async function triviaNavigationHarness(controller) {
  const fixture = { effects: [], handler: null, closing: false, exits: 0, cleanup: [] };
  const sdk = {
    backButton: { mount() {}, show() {}, hide() {}, onClick(fn) { fixture.handler = fn; return () => { if (fixture.handler === fn) fixture.handler = null; }; } },
    closingBehavior: { mount() {}, enableConfirmation() { fixture.closing = true; }, disableConfirmation() { fixture.closing = false; } },
  };
  let source = readFileSync(new URL('../../src/platform/useTelegramGameNavigation.js', import.meta.url), 'utf8');
  assert.match(source, /^import \{ useEffect \} from "react";/);
  assert.match(source, /return import\("@telegram-apps\/sdk"\)\.catch\(\(\) => null\);/);
  source = source.replace('import { useEffect } from "react";', '')
    .replace('return import("@telegram-apps/sdk").catch(() => null);', 'return Promise.resolve(sdk);')
    .replace('export function useTelegramGameNavigation', 'function useTelegramGameNavigation');
  const hook = new Function('useEffect', 'sdk', `${source}\nreturn useTelegramGameNavigation;`)(fn => fixture.effects.push(fn), sdk);
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return {
    fixture,
    async render() {
      fixture.cleanup.forEach(fn => fn?.());
      fixture.effects = [];
      const s = controller.state, shell = s.view !== 'menu' || !!s.busy;
      hook({ activeGame: 'trivia', hasOpenPanel: shell && (s.paused || !s.question), hasActiveRun: shell && !!(s.question || s.roomId || s.busy), closePanel: shell ? () => controller.back() : null, pauseRun: shell ? () => controller.pause() : null, exitToHub: () => fixture.exits++ });
      fixture.cleanup = fixture.effects.map(fn => fn());
      await settle();
    },
    async press() { fixture.handler(); await settle(); },
    close() { fixture.cleanup.forEach(fn => fn?.()); },
  };
}
