import { readSplitGameSource } from './helpers/splitGameSources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  gardenLocalStateKey, selectGardenInitialState, readGardenLocalState, writeGardenLocalState,
} from '../src/games/garden-shelf/lib/gardenLocalState.js';
import { createDefaultPlayer } from '../game-logic/player.js';
import { createGardenEconomyState } from '../game-logic/garden-economy.js';
import { applyGardenTransaction, getGardenAccounting } from '../game-logic/garden-transactions.js';

const now = Date.UTC(2026, 9, 2, 12);
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
}
function creditedA() {
  return { ...createGardenEconomyState(now), name: 'Account A garden', totalGoldEarned: 10000, acknowledgedEarnedTotal: 10000,
    plants: [{ id: 'account-a-daisy', type: 'daisy', level: 1, phase: 3, phaseProgress: 0, shelfIndex: -1, spotIndex: -1, lastTapped: 0 }] };
}
function credit(player, state) {
  const streamId = 'account_switch_test_stream';
  return applyGardenTransaction(player, 'garden.creditEarned', {
    state, throughTotal: state.totalGoldEarned, expectedRevision: 0,
    intent: { accountId: player.id, streamId, sequence: 1, createdAt: now },
  }, { clientActionId: `garden:${streamId}:1`, now });
}

test('one browser A → fresh B → A cannot import A plants or credit A earned total to B', () => {
  const browser = storage(), a = creditedA(), legacyBytes = JSON.stringify(a);
  browser.setItem('terrarium_save', legacyBytes);
  assert.equal(writeGardenLocalState(browser, 'account-a', a), true);
  const aBytes = browser.getItem(gardenLocalStateKey('account-a'));
  const b = createDefaultPlayer('account-b', 'B', now);
  b.garden = createGardenEconomyState(now);
  b.gardenAccounting = getGardenAccounting(b);
  const beforeBalance = b.resources.gold;

  // Reproduce the old failure with the actual transaction implementation.
  const oldAdopted = { ...JSON.parse(browser.getItem('terrarium_save')), totalGoldEarned: 10001 };
  assert.equal(credit(b, oldAdopted).goldDelta, 10001);

  // Exercise the exact startup selector now used by GameProvider, in the same storage.
  const fresh = structuredClone(selectGardenInitialState(b.id, b.garden));
  assert.deepEqual(fresh.plants, []);
  assert.equal(fresh.totalGoldEarned, 0);
  assert.equal(fresh.name, '');
  assert.equal(writeGardenLocalState(browser, b.id, fresh), true);
  const earned = credit(b, { ...fresh, totalGoldEarned: 1 });
  assert.equal(earned.error, undefined);
  assert.equal(earned.goldDelta, 1);
  assert.equal(earned.gold, beforeBalance + 1);
  assert.equal(earned.accounting.creditedTotal, 1);
  assert.deepEqual(earned.garden.plants, []);
  assert.equal(browser.getItem('terrarium_save'), legacyBytes);
  assert.equal(browser.getItem(gardenLocalStateKey('account-a')), aBytes);
  assert.deepEqual(readGardenLocalState(browser, 'account-a'), a);
  assert.deepEqual(selectGardenInitialState('account-a', a), a);
});

test('verified empty or absent server Garden never adopts even a same-account cached history', () => {
  const browser = storage(), a = creditedA(), empty = createGardenEconomyState(now);
  writeGardenLocalState(browser, 'account-a', a);
  assert.equal(selectGardenInitialState('account-a', empty), empty);
  assert.equal(selectGardenInitialState('account-a', null), null);
  assert.equal(selectGardenInitialState('account-a', undefined), null);
  assert.deepEqual(readGardenLocalState(browser, 'account-a'), a);
});

test('an envelope copied under another account key is rejected by the recovery reader', () => {
  const browser = storage();
  writeGardenLocalState(browser, 'account-a', creditedA());
  browser.setItem(gardenLocalStateKey('account-b'), browser.getItem(gardenLocalStateKey('account-a')));
  assert.equal(readGardenLocalState(browser, 'account-b'), null);
  for (const value of ['{', '{}', 'null', JSON.stringify({ version: 2, accountId: 'account-b', state: creditedA() })]) {
    browser.setItem(gardenLocalStateKey('account-b'), value);
    assert.equal(readGardenLocalState(browser, 'account-b'), null);
  }
});

test('unverified sessions do not adopt a Garden or write browser recovery data', () => {
  const browser = storage();
  for (const account of ['', null, undefined, 1]) {
    assert.equal(selectGardenInitialState(account, creditedA()), null);
    assert.equal(writeGardenLocalState(browser, account, creditedA()), false);
    assert.equal(readGardenLocalState(browser, account), null);
  }
  assert.equal(browser.values.size, 0);
});

test('storage failures are best effort and cannot replace the server snapshot', () => {
  const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  assert.equal(readGardenLocalState(blocked, 'account-a'), null);
  assert.equal(writeGardenLocalState(blocked, 'account-a', creditedA()), false);
  const server = createGardenEconomyState(now);
  assert.equal(selectGardenInitialState('account-a', server), server);
});

test('cache keys cannot collide and shared balances are never serialized as garden authority', () => {
  const browser = storage(), a = creditedA();
  assert.notEqual(gardenLocalStateKey('a:b'), gardenLocalStateKey('a%3Ab'));
  writeGardenLocalState(browser, 'account-a', { ...a, gold: 900000 });
  assert.deepEqual(readGardenLocalState(browser, 'account-a'), a);
});

test('production provider is keyed and cached by verified account with server-only startup', () => {
  const context = fs.readFileSync(new URL('../src/games/garden-shelf/lib/GameContext.tsx', import.meta.url), 'utf8');
  const wrapper = readSplitGameSource(new URL('../src/games/garden-shelf/GardenShelfGame.tsx', import.meta.url));
  assert.match(context, /normalizePersistedGardenState\(selectGardenInitialState\(accountId, persistedState\), gold\)/);
  assert.match(context, /writeGardenLocalState\(localStorage, accountId, nextPersisted\)/);
  assert.doesNotMatch(context, /terrarium_save|readLocalGardenState|hasGardenProgress|readGardenLocalState/);
  assert.match(wrapper, /<GameProvider key=\{accountId\} accountId=\{accountId\}/);
  assert.match(wrapper, /if \(!accountId \|\| useGameHub\.getState\(\)\.snapshot\?\.player\?\.id !== accountId\) return \{ error: 'GARDEN_ACCOUNT_MISMATCH' \}/);
});
