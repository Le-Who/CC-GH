import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BUILDINGS, STAGE_THRESHOLDS } from './gameData.js';

const startingResources = {
  food: 500,
  wood: 500,
  stone: 260,
  goods: 180,
  culture: 90,
  gold: 1673,
  gems: 25,
  prestige: 0,
  morale: 78
};

const startingLevels = Object.fromEntries(BUILDINGS.map((b) => [b.id, b.level]));

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function addResources(resources, delta) {
  const next = { ...resources };
  for (const [key, value] of Object.entries(delta)) {
    const floor = ['food', 'wood', 'stone', 'goods', 'culture', 'gold', 'prestige'].includes(key) ? 0 : -Infinity;
    next[key] = Math.max(floor, (next[key] ?? 0) + value);
  }
  next.morale = clamp(next.morale ?? 75, 0, 100);
  return next;
}

function productionFrom(levels) {
  const out = { food: 0, wood: 0, stone: 0, goods: 0, culture: 0, gold: 0, prestige: 0 };
  for (const building of BUILDINGS) {
    const level = levels[building.id] ?? 1;
    for (const [key, perMinute] of Object.entries(building.produces ?? {})) {
      out[key] = (out[key] ?? 0) + perMinute * (0.75 + level * 0.25);
    }
  }
  out.prestige += Object.values(levels).reduce((sum, v) => sum + v, 0) * 0.016;
  return out;
}

function getStage(resources, levels) {
  const prestige = Math.floor((resources.prestige ?? 0) + Object.values(levels).reduce((s, x) => s + x, 0) * 16);
  let stage = STAGE_THRESHOLDS[0];
  for (const candidate of STAGE_THRESHOLDS) {
    if (prestige >= candidate.prestige) stage = candidate;
  }
  return { ...stage, computedPrestige: prestige };
}

function upgradeCost(building, level) {
  const growth = 1 + level * 0.47;
  const out = {};
  for (const [key, value] of Object.entries(building.cost)) out[key] = Math.ceil(value * growth);
  return out;
}

function canPay(resources, cost) {
  return Object.entries(cost).every(([key, value]) => (resources[key] ?? 0) >= value);
}

function pay(resources, cost) {
  const out = { ...resources };
  for (const [key, value] of Object.entries(cost)) out[key] = Math.max(0, (out[key] ?? 0) - value);
  return out;
}

const MAX_NOTICES = 3;

function noticeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function noticeKey(notice) {
  return notice.key ?? `${notice.type ?? 'info'}:${notice.text ?? ''}`;
}

function pushNotice(notices, notice) {
  const key = noticeKey(notice);
  const createdAt = Date.now();
  const existing = notices.find((item) => noticeKey(item) === key);
  if (existing) {
    return [
      {
        ...existing,
        ...notice,
        id: noticeId(),
        key,
        count: (existing.count ?? 1) + 1,
        createdAt
      },
      ...notices.filter((item) => noticeKey(item) !== key)
    ].slice(0, MAX_NOTICES);
  }

  return [
    {
      ...notice,
      id: noticeId(),
      key,
      count: 1,
      createdAt
    },
    ...notices
  ].slice(0, MAX_NOTICES);
}

export const useSettlementStore = create(
  persist(
    (set, get) => ({
      resources: startingResources,
      levels: startingLevels,
      population: 18,
      lastTick: Date.now(),
      selectedBuildingId: 'hearth-hall',
      activePanel: 'build',
      notices: [],

      addNotice: (notice) => set((s) => ({ notices: pushNotice(s.notices, notice) })),
      dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((notice) => notice.id !== id) })),

      get stage() {
        return getStage(get().resources, get().levels);
      },

      tick: () => {
        const state = get();
        const now = Date.now();
        const elapsedMs = Math.max(0, now - (state.lastTick || now));
        if (elapsedMs < 500) return;
        const minutes = Math.min(elapsedMs / 60000, 60 * 12);
        const prod = productionFrom(state.levels);
        const delta = Object.fromEntries(Object.entries(prod).map(([key, value]) => [key, value * minutes]));
        const housing = state.levels['cottage-ring'] ?? 1;
        const hall = state.levels['hearth-hall'] ?? 1;
        const population = Math.max(8, Math.floor(12 + housing * 3.2 + hall * 0.8));
        set({ resources: addResources(state.resources, delta), population, lastTick: now });
      },

      collect: () => {
        const levels = get().levels;
        const prod = productionFrom(levels);
        const multiplier = 10 + (levels['market-green'] ?? 1) * 2;
        const delta = Object.fromEntries(Object.entries(prod).map(([key, value]) => [key, Math.max(0, value * multiplier)]));
        set((s) => ({
          resources: addResources(s.resources, { ...delta, gold: (delta.gold ?? 0) + 26, prestige: 8 }),
          notices: pushNotice(s.notices, { type: 'collect', key: 'collect:resources', text: '+ ресурсы поселения' })
        }));
      },

      selectBuilding: (id) => set({ selectedBuildingId: id, activePanel: 'build' }),
      setPanel: (activePanel) => set({ activePanel }),

      upgradeBuilding: (id) => {
        const building = BUILDINGS.find((b) => b.id === id);
        if (!building) return false;
        const level = get().levels[id] ?? 1;
        if (level >= building.max) return false;
        const cost = upgradeCost(building, level);
        if (!canPay(get().resources, cost)) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: 'warn:resources', text: 'Не хватает ресурсов' }) }));
          return false;
        }
        set((s) => ({
          resources: addResources(pay(s.resources, cost), { prestige: 25 + level * 5 }),
          levels: { ...s.levels, [id]: level + 1 },
          selectedBuildingId: id,
          notices: pushNotice(s.notices, { type: 'upgrade', key: `upgrade:${id}`, text: `${building.name}: уровень ${level + 1}` })
        }));
        return true;
      },

      resetSettlement: () => set({
        resources: startingResources,
        levels: startingLevels,
        population: 18,
        lastTick: Date.now(),
        selectedBuildingId: 'hearth-hall',
        activePanel: 'build',
        notices: []
      })
    }),
    {
      name: 'village-ascend-v2-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ resources: s.resources, levels: s.levels, population: s.population, lastTick: s.lastTick, selectedBuildingId: s.selectedBuildingId, activePanel: s.activePanel })
    }
  )
);

export { productionFrom, getStage, upgradeCost, canPay };
