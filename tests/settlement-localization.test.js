import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as data from '../src/games/settlement/gameData.js';
import { translateSettlement } from '../src/games/settlement/settlementText.js';

test('all authored Settlement display strings have an English translation', () => {
  function visit(value) {
    if (typeof value === 'string' && /[а-яё]/i.test(value)) {
      assert.doesNotMatch(translateSettlement('en', value), /[а-яё]/i, value);
      assert.equal(translateSettlement('ru', value), value);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  Object.values(data).forEach(visit);
});

test('translation preserves identifiers, callbacks, objects and numeric gameplay state', () => {
  for (const value of ['hearth-hall', 'stone-masonry', 44, false, null, { wood: 250 }, () => true]) {
    assert.equal(translateSettlement('en', value), value);
  }
});

test('dynamic notices, capacity and time translate their values as display text', () => {
  assert.equal(translateSettlement('en', 'Очажный зал: улучшение начато'), 'Hearth Hall: upgrade started');
  assert.equal(translateSettlement('en', 'Каменная кладка: исследование завершено'), 'Stone masonry: research complete');
  assert.equal(translateSettlement('en', 'Уменьшить вместимость: Еда'), 'Reduce capacity: Food');
  assert.equal(translateSettlement('en', 'Уровень 3/12 · Управление'), 'Level 3/12 · Civic');
  assert.equal(translateSettlement('en', '10м 05с'), '10m 05s');
  assert.equal(translateSettlement('en', 'Ледяные пустоши, закрыто'), 'Frozen Wastes, locked');
  assert.equal(translateSettlement('en', 'Готовая постройка: Ферма. Площадка: Еда.'), 'Building: Farm. Plot: Food.');
  assert.equal(translateSettlement('en', 'Готовая постройка: Ферма! Площадка: Еда!'), 'Готовая постройка: Ферма! Площадка: Еда!');
});


test('post-Settlement copy uses the final translator and keeps concise RU/EN guidance', () => {
  const source = readFileSync(new URL('../src/games/settlement/SettlementGame.jsx', import.meta.url), 'utf8');
  for (const [ru, en] of [
    ['Развитие поселения', 'Settlement progress'],
    ['Собирайте партии, доставляйте заказы и развивайте поселение.', 'Collect batches, deliver orders and develop the settlement.'],
    ['Выберите исследование, чтобы увидеть цену и бонусы.', 'Choose research to see its cost and bonuses.'],
  ]) {
    assert.ok(source.includes(`t("${ru}")`), ru);
    assert.equal(translateSettlement('ru', ru), ru);
    assert.equal(translateSettlement('en', ru), en);
  }
  assert.equal(data.BUILDINGS.find(building => building.id === 'hearth-hall').detail.body, 'Главное здание поселения.');
  assert.equal(translateSettlement('en', 'Главное здание поселения.'), 'Main settlement building.');
  assert.doesNotMatch(source, /Счастливые жители работают эффективнее и создают больше/);
});
