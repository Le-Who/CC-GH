// Settlement-only preview economy. No shared wallet or network writes.
export const PRODUCTION_MS = 20_000;
export const MAX_READY_BATCHES = 3;
export const DEVELOPMENTS = [
  { buildingId: 'cottage-ring', deliveries: 3, cost: { wood: 120, stone: 80, gold: 150 }, ru: 'Новые дома', en: 'New homes' },
  { buildingId: 'common-garden', deliveries: 7, cost: { wood: 180, stone: 120, gold: 220 }, ru: 'Большой сад', en: 'Larger garden' },
  { buildingId: 'hearth-hall', deliveries: 12, cost: { wood: 240, stone: 180, gold: 300 }, ru: 'Обновлённая ратуша', en: 'Town hall renewal' },
];
const ORDERS = [
  { ru: 'Анна · ужин для соседей', en: 'Anna · supper for neighbours', cost: { food: 70, wood: 20 } },
  { ru: 'Иван · ремонт домов', en: 'Ivan · home repairs', cost: { wood: 55, stone: 35 } },
  { ru: 'Мира · рыночный день', en: 'Mira · market day', cost: { goods: 30, food: 35 } },
  { ru: 'Лев · деревенский праздник', en: 'Lev · village festival', cost: { food: 50, goods: 20, culture: 10 } },
];
const whole = (value, fallback, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : fallback;
export function normalizeCycle(value, now = Date.now()) {
  return {
    ready: whole(value?.ready, 1, MAX_READY_BATCHES),
    productionAt: Number.isFinite(value?.productionAt) ? Math.max(0, Math.min(now, value.productionAt)) : now,
    deliveries: whole(value?.deliveries, 0, 1_000_000),
    development: whole(value?.development, 0, DEVELOPMENTS.length),
    collected: whole(value?.collected, 0, 1_000_000),
  };
}
export function advanceProduction(value, now = Date.now()) {
  const cycle = normalizeCycle(value, now);
  const batches = Math.floor(Math.max(0, now - cycle.productionAt) / PRODUCTION_MS);
  const ready = Math.min(MAX_READY_BATCHES, cycle.ready + batches);
  return { ...cycle, ready, productionAt: ready === MAX_READY_BATCHES ? now : cycle.productionAt + batches * PRODUCTION_MS };
}
export function residentOrder(cycle) {
  const index = normalizeCycle(cycle).deliveries;
  return { ...ORDERS[index % ORDERS.length], id: `resident:${index}`, reward: { gold: 90 + Math.min(index, 20) * 5, prestige: 12 } };
}
export function batchYield(production, development = 0) {
  const base = { food: 90, wood: 70, stone: 50, goods: 40, culture: 15 };
  return Object.fromEntries(Object.entries(base).map(([key, amount]) => [key, Math.round((amount + Math.max(0, production[key] ?? 0) * 8) * (1 + development * 0.2))]));
}
// Limit new income without reducing already-owned stock above a cap.
export function addCycleIncome(resources, income, caps = {}) {
  const next = { ...resources };
  for (const [key, amount] of Object.entries(income)) {
    const current = next[key] ?? 0;
    const cap = Number.isFinite(caps[key]) ? Math.max(current, caps[key]) : Infinity;
    next[key] = Math.min(cap, current + amount);
  }
  return next;
}
