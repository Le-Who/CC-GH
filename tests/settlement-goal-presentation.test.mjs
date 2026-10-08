import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const source = name => readFileSync(new URL(`../src/games/settlement/${name}`, import.meta.url), 'utf8');
test('goal progress comes from live hall, population and prestige state', () => {
 const s = source('SettlementGoalsPanel.jsx');
 assert.match(s, /levels\['hearth-hall'\]/);
 assert.match(s, /'population-600': population/);
 assert.match(s, /getStage\(resources, levels\).computedPrestige/);
 assert.match(s, /Object.hasOwn\(progressById, goal.id\)/);
 assert.match(s, /current: progressById\[goal.id\]/);
});
test('seeded rewards are presented as one-time legacy entitlements, not achievements', () => {
 const s = source('SettlementGoalsPanel.jsx');
 assert.match(s, /Сохранённые разовые награды/);
 assert.match(s, /не обновляются ежедневно/);
 assert.doesNotMatch(s, /dailyRefreshLabel|t\(task.title\)|t\(task.description\)|task.rewardLabel/);
 assert.match(s, /onClick=\{onClaimRewards\}/);
 assert.match(s, /claimed.has\(task.id\)/);
 assert.match(s, /amount=\{task.reward.amount\}/);
});
test('informational targets do not promise unimplemented reward grants', () => {
 const s = source('SettlementGoalsPanel.jsx');
 assert.doesNotMatch(s, /goal.reward/);
 assert.match(s, /Награды за эти цели пока не подключены/);
});
test('warehouse does not pass seeded special-item counts off as owned items', () => {
 const s = source('SettlementInventoryScreen.jsx');
 assert.doesNotMatch(s, /specialItems.map|t\(item.amount\)/);
 assert.match(s, /Учёт особых предметов пока не подключён/);
 assert.match(s, /resources\[row.id\]/);
});
