import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = name => readFileSync(new URL(`../src/games/settlement/${name}`, import.meta.url), 'utf8');
test('shop does not advertise fake purchasable offers or daily gifts', () => {
 const shop = source('SettlementGenericPanel.jsx').split("if (activePanel === 'store')")[1].split("if (activePanel === 'research')")[0];
 assert.doesNotMatch(shop, /<button|offer-action|Стартовый набор|Бесплатная награда/);
 assert.match(shop, /Магазин пока недоступен/);
});
test('news renders live notices with an explicit empty state', () => {
 const s = source('SettlementGenericPanel.jsx');
 assert.match(s, /useSettlementStore\(\(state\) => state.notices\)/);
 assert.match(s, /notices.map/); assert.match(s, /t\(notice.text\)/);
 assert.doesNotMatch(s, /Караван прибудет|Подарок готов|Можно забрать малый бонус/);
});
test('rail and dock badges derive from supported state, not magic counts', () => {
 const s = source('SettlementGame.jsx');
 assert.doesNotMatch(s, /badge="[23]"|sub: '3д 12ч'|sub: 'готов'|sub: '1д 6ч'/);
 assert.match(s, /badge=\{noticeCount\}/); assert.match(s, /badge=\{readyGoals\}/);
 assert.match(s, /!claimed.includes\(task.id\)/);
});
test('overview shows genuine production-loop progress without invented reward grants', () => {
 const s = source('SettlementOverviewPanel.jsx');
 assert.match(s, /t\(cycle.deliveries\)/); assert.match(s, /value=\{cycle.development\}/);
 assert.doesNotMatch(s, /reward: 150|reward: 250|value: 0|Постройте Лесопилку/);
});
test('cycle CTA uses existing standalone art without changing hit targets', () => {
 const s = source('settlement.css');
 assert.match(s, /settlement-cycle-action \{\s*background: url\('\/games\/hud-redesign\/settlement\/primary-button.png'\)/);
 assert.match(s, /min-height: 44px; min-width: 0/);
 assert.match(s, /settlement-cycle-action:disabled \{\s*filter: grayscale/);
});
test('new explanatory copy has English translations', () => {
 const s = source('settlementText.js');
 for (const text of ['No new village news right now.', 'Shop is not available yet', 'Orders delivered', 'The village is thriving']) assert.ok(s.includes(text));
});
