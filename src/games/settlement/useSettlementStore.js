import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, RESEARCH_PANEL_DATA, STAGE_THRESHOLDS, WORLD_MAP_PANEL_DATA } from './gameData.js';

const ACTIVE_PANEL_STORAGE_KEY = 'village-ascend-v2-panel';
const ACTIVE_BUILDING_STORAGE_KEY = 'village-ascend-v2-building';
const ACTIVE_PANEL_QUERY_PARAM = 'panel';
const ACTIVE_BUILDING_QUERY_PARAM = 'building';

const startingResources = {
  food: 1240,
  wood: 850,
  stone: 670,
  goods: 410,
  culture: 310,
  gold: 2450,
  gems: 560,
  prestige: 885,
  morale: 78
};

const startingLevels = Object.fromEntries(BUILDINGS.map((b) => [b.id, b.level]));
const ACTIVE_PANEL_IDS = new Set(['overview', 'build', 'goals', 'inventory', 'council', 'research', 'store', 'inbox', 'map', 'rank', 'construction', 'world']);
const GOAL_REWARD_IDS = new Set(GOAL_PANEL_DATA.dailyTasks.map((task) => task.id));
const INVENTORY_RESOURCE_PROFILES = Object.fromEntries(INVENTORY_PANEL_DATA.resourceRows.map((row) => [row.id, row]));
const startingInventoryCaps = Object.fromEntries(INVENTORY_PANEL_DATA.resourceRows.map((row) => [row.id, row.initialCap]));
const CONSTRUCTION_CATEGORY_IDS = new Set(CONSTRUCTION_PANEL_DATA.categories.map((category) => category.id));
const CONSTRUCTION_ITEM_IDS = new Set(CONSTRUCTION_PANEL_DATA.items.map((item) => item.id));
const DEFAULT_CONSTRUCTION_CATEGORY_ID = CONSTRUCTION_PANEL_DATA.categories[0]?.id ?? 'production';
const DEFAULT_CONSTRUCTION_ITEM_ID = CONSTRUCTION_PANEL_DATA.items.find((item) => item.category === DEFAULT_CONSTRUCTION_CATEGORY_ID)?.id ?? CONSTRUCTION_PANEL_DATA.items[0]?.id ?? null;
const RESEARCH_CATEGORY_IDS = new Set(RESEARCH_PANEL_DATA.categories.map((category) => category.id));
const RESEARCH_NODES_BY_ID = Object.fromEntries(RESEARCH_PANEL_DATA.nodes.map((node) => [node.id, node]));
const DEFAULT_RESEARCH_CATEGORY_ID = RESEARCH_PANEL_DATA.categories[0]?.id ?? 'farming';
const DEFAULT_RESEARCH_NODE_ID = RESEARCH_PANEL_DATA.categories.find((category) => category.id === DEFAULT_RESEARCH_CATEGORY_ID)?.defaultNodeId
  ?? RESEARCH_PANEL_DATA.nodes.find((node) => node.category === DEFAULT_RESEARCH_CATEGORY_ID)?.id
  ?? RESEARCH_PANEL_DATA.nodes[0]?.id
  ?? null;
const startingResearchLevels = Object.fromEntries(RESEARCH_PANEL_DATA.nodes.map((node) => [node.id, node.level ?? 0]));
const WORLD_MAP_FILTER_IDS = new Set(WORLD_MAP_PANEL_DATA.filters.map((filter) => filter.id));
const WORLD_EXPEDITIONS_BY_ID = Object.fromEntries(WORLD_MAP_PANEL_DATA.expeditions.map((expedition) => [expedition.id, expedition]));
const DEFAULT_WORLD_MAP_FILTER_ID = WORLD_MAP_PANEL_DATA.filters[0]?.id ?? 'all';
const DEFAULT_WORLD_EXPEDITION_ID = WORLD_MAP_PANEL_DATA.expeditions.find((expedition) => expedition.unlocked !== false)?.id ?? WORLD_MAP_PANEL_DATA.expeditions[0]?.id ?? null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatStorageNumber(value) {
  return Math.floor(value ?? 0).toLocaleString('ru-RU');
}

function addResources(resources, delta, caps = null) {
  const next = { ...resources };
  for (const [key, value] of Object.entries(delta)) {
    const floor = ['food', 'wood', 'stone', 'goods', 'culture', 'gold', 'prestige'].includes(key) ? 0 : -Infinity;
    const cap = caps?.[key];
    const withDelta = (next[key] ?? 0) + value;
    next[key] = Math.max(floor, cap == null ? withDelta : Math.min(cap, withDelta));
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
  if (level === building.level && building.detail?.upgradeCost) return { ...building.detail.upgradeCost };
  const growth = 1 + level * 0.47;
  const out = {};
  for (const [key, value] of Object.entries(building.cost)) out[key] = Math.ceil(value * growth);
  return out;
}

function normalizeActivePanel(value) {
  const panel = String(value || '').trim();
  return ACTIVE_PANEL_IDS.has(panel) ? panel : 'overview';
}

function normalizeConstructionCategoryId(value) {
  const category = String(value || '').trim();
  return CONSTRUCTION_CATEGORY_IDS.has(category) ? category : DEFAULT_CONSTRUCTION_CATEGORY_ID;
}

function normalizeConstructionItemId(value, categoryId = null) {
  const itemId = String(value || '').trim();
  const category = categoryId ? normalizeConstructionCategoryId(categoryId) : null;
  if (CONSTRUCTION_ITEM_IDS.has(itemId)) {
    const item = CONSTRUCTION_PANEL_DATA.items.find((candidate) => candidate.id === itemId);
    if (!category || item?.category === category) return itemId;
  }
  return CONSTRUCTION_PANEL_DATA.items.find((item) => !category || item.category === category)?.id ?? DEFAULT_CONSTRUCTION_ITEM_ID;
}

function constructionItemsForCategory(categoryId) {
  const normalized = normalizeConstructionCategoryId(categoryId);
  return CONSTRUCTION_PANEL_DATA.items.filter((item) => item.category === normalized);
}

function normalizeConstructionPage(value, categoryId) {
  const pageSize = CONSTRUCTION_PANEL_DATA.pageSize || 9;
  const pageCount = Math.max(1, Math.ceil(constructionItemsForCategory(categoryId).length / pageSize));
  const page = Number.isFinite(Number(value)) ? Number(value) : 0;
  return clamp(Math.trunc(page), 0, pageCount - 1);
}

function normalizeResearchCategoryId(value) {
  const category = String(value || '').trim();
  return RESEARCH_CATEGORY_IDS.has(category) ? category : DEFAULT_RESEARCH_CATEGORY_ID;
}

function researchNodesForCategory(categoryId) {
  const normalized = normalizeResearchCategoryId(categoryId);
  return RESEARCH_PANEL_DATA.nodes.filter((node) => node.category === normalized);
}

function normalizeResearchNodeId(value, categoryId = null) {
  const nodeId = String(value || '').trim();
  const category = categoryId ? normalizeResearchCategoryId(categoryId) : null;
  const node = RESEARCH_NODES_BY_ID[nodeId];
  if (node && (!category || node.category === category)) return nodeId;
  const profile = category ? RESEARCH_PANEL_DATA.categories.find((item) => item.id === category) : null;
  const fallbackId = profile?.defaultNodeId;
  if (fallbackId && RESEARCH_NODES_BY_ID[fallbackId]) return fallbackId;
  return researchNodesForCategory(category ?? DEFAULT_RESEARCH_CATEGORY_ID)[0]?.id ?? DEFAULT_RESEARCH_NODE_ID;
}

function researchRequirementMet(requirement, researchLevels) {
  return (researchLevels?.[requirement.id] ?? 0) >= (requirement.level ?? 1);
}

function researchNodeUnlocked(node, researchLevels) {
  return (node.requires ?? []).every((requirement) => researchRequirementMet(requirement, researchLevels));
}

function getResearchNodeStatus(node, researchLevels, activeResearch = null) {
  if (!node) return 'locked';
  if (!researchNodeUnlocked(node, researchLevels)) return 'locked';
  if ((activeResearch?.nodeId ?? null) === node.id) return 'researching';
  const level = researchLevels?.[node.id] ?? node.level ?? 0;
  if (level >= (node.maxLevel ?? 1)) return 'done';
  if (node.initialState === 'complete') return 'complete';
  return 'available';
}

function normalizeWorldMapFilterId(value) {
  const filter = String(value || '').trim();
  return WORLD_MAP_FILTER_IDS.has(filter) ? filter : DEFAULT_WORLD_MAP_FILTER_ID;
}

function worldExpeditionsForFilter(filterId) {
  const normalized = normalizeWorldMapFilterId(filterId);
  if (normalized === 'all') return WORLD_MAP_PANEL_DATA.expeditions;
  return WORLD_MAP_PANEL_DATA.expeditions.filter((expedition) => expedition.category === normalized);
}

function normalizeWorldExpeditionId(value, filterId = null) {
  const expeditionId = String(value || '').trim();
  const filter = filterId ? normalizeWorldMapFilterId(filterId) : null;
  const expedition = WORLD_EXPEDITIONS_BY_ID[expeditionId];
  if (expedition && (!filter || filter === 'all' || expedition.category === filter)) return expeditionId;
  return worldExpeditionsForFilter(filter ?? DEFAULT_WORLD_MAP_FILTER_ID)[0]?.id ?? DEFAULT_WORLD_EXPEDITION_ID;
}

function worldExpeditionUnlocked(expedition, stage) {
  if (!expedition) return false;
  if (expedition.unlocked === false) return false;
  const requiredStageLevel = expedition.requiredStageLevel ?? 0;
  return (stage?.level ?? 0) >= requiredStageLevel;
}

function readInitialActivePanel() {
  if (typeof window === 'undefined') return 'overview';
  try {
    const url = new URL(window.location.href);
    const panel = normalizeActivePanel(url.searchParams.get(ACTIVE_PANEL_QUERY_PARAM));
    if (panel !== 'overview' || url.searchParams.has(ACTIVE_PANEL_QUERY_PARAM)) return panel;
  } catch {
    // URL parsing is best-effort.
  }
  try {
    return normalizeActivePanel(window.sessionStorage.getItem(ACTIVE_PANEL_STORAGE_KEY));
  } catch {
    return 'overview';
  }
}

function readInitialSelectedBuildingId() {
  const fallback = 'hearth-hall';
  if (typeof window === 'undefined') return fallback;
  const buildingIds = new Set(BUILDINGS.map((building) => building.id));
  try {
    const url = new URL(window.location.href);
    const building = String(url.searchParams.get(ACTIVE_BUILDING_QUERY_PARAM) || '').trim();
    if (buildingIds.has(building)) return building;
  } catch {
    // URL parsing is best-effort.
  }
  try {
    const building = String(window.sessionStorage.getItem(ACTIVE_BUILDING_STORAGE_KEY) || '').trim();
    return buildingIds.has(building) ? building : fallback;
  } catch {
    return fallback;
  }
}

function persistSettlementPanelState(activePanel, selectedBuildingId) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ACTIVE_PANEL_STORAGE_KEY, activePanel);
    window.sessionStorage.setItem(ACTIVE_BUILDING_STORAGE_KEY, selectedBuildingId);
    const url = new URL(window.location.href);
    if (activePanel === 'overview') url.searchParams.delete(ACTIVE_PANEL_QUERY_PARAM);
    else url.searchParams.set(ACTIVE_PANEL_QUERY_PARAM, activePanel);
    if (selectedBuildingId === 'hearth-hall') url.searchParams.delete(ACTIVE_BUILDING_QUERY_PARAM);
    else url.searchParams.set(ACTIVE_BUILDING_QUERY_PARAM, selectedBuildingId);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  } catch {
    // Session restore and deep-linking are progressive enhancement.
  }
}

function canPay(resources, cost) {
  return Object.entries(cost).every(([key, value]) => (resources[key] ?? 0) >= value);
}

function populationFromLevels(levels) {
  const housing = levels['cottage-ring'] ?? 1;
  const hall = levels['hearth-hall'] ?? 1;
  return Math.max(120, Math.floor(220 + housing * 90 + hall * 40));
}

function pay(resources, cost) {
  const out = { ...resources };
  for (const [key, value] of Object.entries(cost)) out[key] = Math.max(0, (out[key] ?? 0) - value);
  return out;
}

function addGoalRewards(resources, rewards, caps = null) {
  return rewards.reduce((acc, reward) => addResources(acc, { [reward.type]: reward.amount }, caps), resources);
}

function clampInventoryCap(resourceId, value) {
  const profile = INVENTORY_RESOURCE_PROFILES[resourceId];
  if (!profile) return value;
  return clamp(value, profile.minCap, profile.maxCap);
}

function applyInventoryCapChange(state, resourceId, delta, noticeKeyPrefix) {
  const profile = INVENTORY_RESOURCE_PROFILES[resourceId];
  if (!profile) return null;
  const currentCap = state.inventoryCaps?.[resourceId] ?? profile.initialCap;
  const nextCap = clampInventoryCap(resourceId, currentCap + delta);
  const nextResources = (state.resources?.[resourceId] ?? 0) > nextCap
    ? { ...state.resources, [resourceId]: nextCap }
    : state.resources;
  return {
    inventoryCaps: { ...state.inventoryCaps, [resourceId]: nextCap },
    inventorySelectedResourceId: resourceId,
    resources: nextResources,
    notices: pushNotice(state.notices, {
      type: 'collect',
      key: `${noticeKeyPrefix}:${resourceId}:${nextCap}`,
      text: `Склад: ${profile.label} ${formatStorageNumber(nextCap)}`
    })
  };
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
      population: populationFromLevels(startingLevels),
      lastTick: Date.now(),
      selectedBuildingId: readInitialSelectedBuildingId(),
      activePanel: readInitialActivePanel(),
      rightPanelOpen: true,
      activeUpgrade: null,
      claimedGoalRewardIds: [],
      inventoryCaps: { ...startingInventoryCaps },
      inventorySelectedResourceId: null,
      constructionCategoryId: DEFAULT_CONSTRUCTION_CATEGORY_ID,
      constructionPage: 0,
      selectedConstructionId: DEFAULT_CONSTRUCTION_ITEM_ID,
      researchCategoryId: DEFAULT_RESEARCH_CATEGORY_ID,
      selectedResearchId: DEFAULT_RESEARCH_NODE_ID,
      researchLevels: { ...startingResearchLevels },
      activeResearch: null,
      worldMapFilterId: DEFAULT_WORLD_MAP_FILTER_ID,
      selectedExpeditionId: DEFAULT_WORLD_EXPEDITION_ID,
      activeExpedition: null,
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
        let resources = addResources(state.resources, delta, state.inventoryCaps);
        let levels = state.levels;
        let activeUpgrade = state.activeUpgrade ?? null;
        let researchLevels = state.researchLevels ?? { ...startingResearchLevels };
        let activeResearch = state.activeResearch ?? null;
        let activeExpedition = state.activeExpedition ?? null;
        let notices = state.notices;

        if (activeUpgrade && now >= activeUpgrade.completesAt) {
          const building = BUILDINGS.find((b) => b.id === activeUpgrade.buildingId);
          if (building) {
            const currentLevel = levels[building.id] ?? building.level;
            const cost = upgradeCost(building, activeUpgrade.fromLevel);
            if (currentLevel === activeUpgrade.fromLevel && currentLevel < building.max && canPay(resources, cost)) {
              resources = addResources(pay(resources, cost), { prestige: 25 + currentLevel * 5 }, state.inventoryCaps);
              levels = { ...levels, [building.id]: activeUpgrade.toLevel };
              notices = pushNotice(notices, { type: 'upgrade', key: `upgrade:complete:${building.id}`, text: `${building.name}: улучшение завершено` });
            } else {
              notices = pushNotice(notices, { type: 'warn', key: `upgrade:blocked:${building?.id ?? 'unknown'}`, text: 'Улучшение не завершено: проверьте ресурсы' });
            }
          }
          activeUpgrade = null;
        }

        if (activeResearch && now >= activeResearch.completesAt) {
          const node = RESEARCH_NODES_BY_ID[activeResearch.nodeId];
          if (node) {
            const currentLevel = researchLevels[node.id] ?? node.level ?? 0;
            if (currentLevel === activeResearch.fromLevel && currentLevel < (node.maxLevel ?? 1)) {
              researchLevels = {
                ...researchLevels,
                [node.id]: Math.min(node.maxLevel ?? currentLevel + 1, activeResearch.toLevel)
              };
              resources = addResources(resources, { prestige: 12 + activeResearch.toLevel * 4 }, state.inventoryCaps);
              notices = pushNotice(notices, { type: 'upgrade', key: `research:complete:${node.id}:${activeResearch.toLevel}`, text: `${node.title}: изучение завершено` });
            } else {
              notices = pushNotice(notices, { type: 'warn', key: `research:blocked:${node?.id ?? 'unknown'}`, text: 'Исследование не завершено: проверьте состояние узла' });
            }
          }
          activeResearch = null;
        }

        if (activeExpedition && now >= activeExpedition.completesAt) {
          const expedition = WORLD_EXPEDITIONS_BY_ID[activeExpedition.expeditionId];
          if (expedition) {
            resources = addResources(resources, expedition.rewards ?? {}, state.inventoryCaps);
            notices = pushNotice(notices, {
              type: 'collect',
              key: `expedition:complete:${expedition.id}:${activeExpedition.startedAt}`,
              text: `${expedition.title}: экспедиция вернулась`
            });
          }
          activeExpedition = null;
        }

        const population = populationFromLevels(levels);
        set({ resources, levels, activeUpgrade, researchLevels, activeResearch, activeExpedition, notices, population, lastTick: now });
      },

      collect: () => {
        const levels = get().levels;
        const prod = productionFrom(levels);
        const multiplier = 10 + (levels['market-green'] ?? 1) * 2;
        const delta = Object.fromEntries(Object.entries(prod).map(([key, value]) => [key, Math.max(0, value * multiplier)]));
        set((s) => ({
          resources: addResources(s.resources, { ...delta, gold: (delta.gold ?? 0) + 26, prestige: 8 }, s.inventoryCaps),
          notices: pushNotice(s.notices, { type: 'collect', key: 'collect:resources', text: '+ ресурсы поселения' })
        }));
      },

      claimGoalRewards: () => {
        const state = get();
        const claimedGoalRewardIds = new Set(state.claimedGoalRewardIds ?? []);
        const claimableTasks = GOAL_PANEL_DATA.dailyTasks.filter((task) => GOAL_REWARD_IDS.has(task.id) && task.progress.current >= task.progress.max && !claimedGoalRewardIds.has(task.id));
        if (!claimableTasks.length) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: 'goals:claim-empty', text: 'Награды уже забраны' }) }));
          return 0;
        }
        const resources = addGoalRewards(state.resources, claimableTasks.map((task) => task.reward), state.inventoryCaps);
        set((s) => ({
          resources,
          claimedGoalRewardIds: [...claimedGoalRewardIds, ...claimableTasks.map((task) => task.id)],
          notices: pushNotice(s.notices, { type: 'collect', key: 'goals:claim-daily', text: `Цели: забрано ${claimableTasks.length}` })
        }));
        return claimableTasks.length;
      },

      selectBuilding: (id) => set((state) => {
        const nextPanel = 'build';
        persistSettlementPanelState(nextPanel, id);
        return { selectedBuildingId: id, activePanel: nextPanel, rightPanelOpen: true };
      }),
      setPanel: (activePanel) => set((state) => {
        const nextPanel = normalizeActivePanel(activePanel);
        persistSettlementPanelState(nextPanel, state.selectedBuildingId ?? 'hearth-hall');
        return { activePanel: nextPanel, rightPanelOpen: true };
      }),
      closePanel: () => set({ rightPanelOpen: false }),
      focusInventoryResource: (resourceId) => set((state) => {
        if (!INVENTORY_RESOURCE_PROFILES[resourceId]) return {};
        return { inventorySelectedResourceId: resourceId };
      }),
      adjustInventoryCap: (resourceId, delta) => set((state) => applyInventoryCapChange(state, resourceId, delta, 'inventory:cap') ?? {}),
      boostInventoryCap: (resourceId) => set((state) => applyInventoryCapChange(state, resourceId, INVENTORY_RESOURCE_PROFILES[resourceId]?.boostStep ?? 1000, 'inventory:boost') ?? {}),
      setConstructionCategory: (categoryId) => set((state) => {
        const nextCategoryId = normalizeConstructionCategoryId(categoryId);
        const nextItemId = normalizeConstructionItemId(state.selectedConstructionId, nextCategoryId);
        persistSettlementPanelState('construction', state.selectedBuildingId ?? 'hearth-hall');
        return {
          activePanel: 'construction',
          rightPanelOpen: true,
          constructionCategoryId: nextCategoryId,
          constructionPage: 0,
          selectedConstructionId: nextItemId
        };
      }),
      setConstructionPage: (page) => set((state) => {
        const nextPage = normalizeConstructionPage(page, state.constructionCategoryId);
        persistSettlementPanelState('construction', state.selectedBuildingId ?? 'hearth-hall');
        return { activePanel: 'construction', rightPanelOpen: true, constructionPage: nextPage };
      }),
      selectConstructionItem: (itemId) => set((state) => {
        const item = CONSTRUCTION_PANEL_DATA.items.find((candidate) => candidate.id === itemId);
        if (!item) return {};
        const items = constructionItemsForCategory(item.category);
        const itemIndex = Math.max(0, items.findIndex((candidate) => candidate.id === item.id));
        const pageSize = CONSTRUCTION_PANEL_DATA.pageSize || 9;
        persistSettlementPanelState('construction', state.selectedBuildingId ?? 'hearth-hall');
        return {
          activePanel: 'construction',
          rightPanelOpen: true,
          constructionCategoryId: item.category,
          constructionPage: Math.floor(itemIndex / pageSize),
          selectedConstructionId: item.id
        };
      }),
      confirmConstructionPlacement: () => {
        const state = get();
        const item = CONSTRUCTION_PANEL_DATA.items.find((candidate) => candidate.id === state.selectedConstructionId);
        if (!item) return false;
        if (!canPay(state.resources, item.cost)) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: `construction:blocked:${item.id}`, text: `${item.name}: не хватает ресурсов` }) }));
          return false;
        }
        set((s) => ({
          activePanel: 'construction',
          rightPanelOpen: true,
          notices: pushNotice(s.notices, { type: 'upgrade', key: `construction:placement:${item.id}`, text: `${item.name}: площадка выбрана` })
        }));
        return true;
      },

      setResearchCategory: (categoryId) => set((state) => {
        const nextCategoryId = normalizeResearchCategoryId(categoryId);
        const nextResearchId = normalizeResearchNodeId(state.selectedResearchId, nextCategoryId);
        persistSettlementPanelState('research', state.selectedBuildingId ?? 'hearth-hall');
        return {
          activePanel: 'research',
          rightPanelOpen: true,
          researchCategoryId: nextCategoryId,
          selectedResearchId: nextResearchId
        };
      }),
      selectResearchNode: (nodeId) => set((state) => {
        const node = RESEARCH_NODES_BY_ID[nodeId];
        if (!node) return {};
        persistSettlementPanelState('research', state.selectedBuildingId ?? 'hearth-hall');
        return {
          activePanel: 'research',
          rightPanelOpen: true,
          researchCategoryId: node.category,
          selectedResearchId: node.id
        };
      }),
      studySelectedResearch: () => {
        const state = get();
        const node = RESEARCH_NODES_BY_ID[state.selectedResearchId];
        if (!node) return false;
        const researchLevels = state.researchLevels ?? { ...startingResearchLevels };
        const currentLevel = researchLevels[node.id] ?? node.level ?? 0;
        const status = getResearchNodeStatus(node, researchLevels, state.activeResearch);
        if (status === 'locked') {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: `research:locked:${node.id}`, text: `${node.title}: требования не выполнены` }) }));
          return false;
        }
        if (status === 'complete' || status === 'done' || currentLevel >= (node.maxLevel ?? 1)) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: `research:done:${node.id}`, text: `${node.title}: уже изучено` }) }));
          return false;
        }
        if (state.activeResearch) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: `research:busy:${state.activeResearch.nodeId}`, text: 'Исследование уже выполняется' }) }));
          return false;
        }
        const cost = node.cost ?? {};
        if (!canPay(state.resources, cost)) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: `research:resources:${node.id}`, text: `${node.title}: не хватает ресурсов` }) }));
          return false;
        }
        const now = Date.now();
        const durationMs = node.durationMs ?? 600000;
        set((s) => ({
          activePanel: 'research',
          rightPanelOpen: true,
          resources: pay(s.resources, cost),
          activeResearch: {
            nodeId: node.id,
            fromLevel: currentLevel,
            toLevel: Math.min(node.maxLevel ?? currentLevel + 1, currentLevel + 1),
            startedAt: now,
            completesAt: now + durationMs,
            durationMs
          },
          notices: pushNotice(s.notices, { type: 'upgrade', key: `research:start:${node.id}:${currentLevel + 1}`, text: `${node.title}: изучение начато` })
        }));
        return true;
      },

      setWorldMapFilter: (filterId) => set((state) => {
        const nextFilterId = normalizeWorldMapFilterId(filterId);
        const nextExpeditionId = normalizeWorldExpeditionId(state.selectedExpeditionId, nextFilterId);
        persistSettlementPanelState('world', state.selectedBuildingId ?? 'hearth-hall');
        return {
          activePanel: 'world',
          rightPanelOpen: true,
          worldMapFilterId: nextFilterId,
          selectedExpeditionId: nextExpeditionId
        };
      }),
      selectExpedition: (expeditionId) => set((state) => {
        const expedition = WORLD_EXPEDITIONS_BY_ID[expeditionId];
        if (!expedition) return {};
        const currentFilter = normalizeWorldMapFilterId(state.worldMapFilterId);
        persistSettlementPanelState('world', state.selectedBuildingId ?? 'hearth-hall');
        return {
          activePanel: 'world',
          rightPanelOpen: true,
          worldMapFilterId: currentFilter === 'all' || expedition.category === currentFilter ? currentFilter : 'all',
          selectedExpeditionId: expedition.id
        };
      }),
      startSelectedExpedition: () => {
        const state = get();
        const expedition = WORLD_EXPEDITIONS_BY_ID[state.selectedExpeditionId];
        if (!expedition) return false;
        const stage = getStage(state.resources, state.levels);
        if (!worldExpeditionUnlocked(expedition, stage)) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: `expedition:locked:${expedition.id}`, text: expedition.requiredLabel ?? `${expedition.title}: маршрут закрыт` }) }));
          return false;
        }
        if (state.activeExpedition) {
          const active = WORLD_EXPEDITIONS_BY_ID[state.activeExpedition.expeditionId];
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: `expedition:busy:${state.activeExpedition.expeditionId}`, text: `${active?.title ?? 'Экспедиция'} уже в пути` }) }));
          return false;
        }
        const now = Date.now();
        const durationMs = expedition.durationMs ?? 900000;
        set((s) => ({
          activePanel: 'world',
          rightPanelOpen: true,
          activeExpedition: {
            expeditionId: expedition.id,
            startedAt: now,
            completesAt: now + durationMs,
            durationMs
          },
          notices: pushNotice(s.notices, { type: 'upgrade', key: `expedition:start:${expedition.id}`, text: `${expedition.title}: экспедиция отправлена` })
        }));
        return true;
      },

      upgradeBuilding: (id) => {
        const building = BUILDINGS.find((b) => b.id === id);
        if (!building) return false;
        const level = get().levels[id] ?? 1;
        if (level >= building.max) return false;
        const existingUpgrade = get().activeUpgrade;
        if (existingUpgrade?.buildingId === id) return false;
        const cost = upgradeCost(building, level);
        if (!canPay(get().resources, cost)) {
          set((s) => ({ notices: pushNotice(s.notices, { type: 'warn', key: 'warn:resources', text: 'Не хватает ресурсов' }) }));
          return false;
        }
        const now = Date.now();
        const durationMs = building.detail?.upgradeDurationMs ?? Math.max(180000, (level + 1) * 90000);
        set((s) => ({
          selectedBuildingId: id,
          activePanel: 'build',
          rightPanelOpen: true,
          activeUpgrade: {
            buildingId: id,
            fromLevel: level,
            toLevel: level + 1,
            startedAt: now,
            completesAt: now + durationMs,
            durationMs
          },
          notices: pushNotice(s.notices, { type: 'upgrade', key: `upgrade:start:${id}`, text: `${building.name}: улучшение начато` })
        }));
        return true;
      },

      resetSettlement: () => set({
        resources: startingResources,
        levels: startingLevels,
        population: populationFromLevels(startingLevels),
        lastTick: Date.now(),
        selectedBuildingId: 'hearth-hall',
        activePanel: 'overview',
        rightPanelOpen: true,
        activeUpgrade: null,
        claimedGoalRewardIds: [],
        inventoryCaps: { ...startingInventoryCaps },
        inventorySelectedResourceId: null,
        constructionCategoryId: DEFAULT_CONSTRUCTION_CATEGORY_ID,
        constructionPage: 0,
        selectedConstructionId: DEFAULT_CONSTRUCTION_ITEM_ID,
        researchCategoryId: DEFAULT_RESEARCH_CATEGORY_ID,
        selectedResearchId: DEFAULT_RESEARCH_NODE_ID,
        researchLevels: { ...startingResearchLevels },
        activeResearch: null,
        worldMapFilterId: DEFAULT_WORLD_MAP_FILTER_ID,
        selectedExpeditionId: DEFAULT_WORLD_EXPEDITION_ID,
        activeExpedition: null,
        notices: []
      })
    }),
    {
      name: 'village-ascend-v2-state',
      storage: createJSONStorage(() => localStorage),
      version: 8,
      migrate: (persisted) => ({
        ...persisted,
        resources: { ...startingResources, ...(persisted?.resources ?? {}) },
        levels: { ...startingLevels, ...(persisted?.levels ?? {}) },
        population: populationFromLevels({ ...startingLevels, ...(persisted?.levels ?? {}) }),
        selectedBuildingId: persisted?.selectedBuildingId ?? readInitialSelectedBuildingId(),
        activePanel: normalizeActivePanel(persisted?.activePanel ?? readInitialActivePanel()),
        rightPanelOpen: true,
        activeUpgrade: null,
        claimedGoalRewardIds: persisted?.claimedGoalRewardIds ?? [],
        inventoryCaps: { ...startingInventoryCaps, ...(persisted?.inventoryCaps ?? {}) },
        inventorySelectedResourceId: INVENTORY_RESOURCE_PROFILES[persisted?.inventorySelectedResourceId] ? persisted.inventorySelectedResourceId : null,
        constructionCategoryId: normalizeConstructionCategoryId(persisted?.constructionCategoryId),
        constructionPage: normalizeConstructionPage(persisted?.constructionPage, persisted?.constructionCategoryId),
        selectedConstructionId: normalizeConstructionItemId(persisted?.selectedConstructionId, persisted?.constructionCategoryId),
        researchCategoryId: normalizeResearchCategoryId(persisted?.researchCategoryId),
        selectedResearchId: normalizeResearchNodeId(persisted?.selectedResearchId, persisted?.researchCategoryId),
        researchLevels: { ...startingResearchLevels, ...(persisted?.researchLevels ?? {}) },
        activeResearch: null,
        worldMapFilterId: normalizeWorldMapFilterId(persisted?.worldMapFilterId),
        selectedExpeditionId: normalizeWorldExpeditionId(persisted?.selectedExpeditionId, persisted?.worldMapFilterId),
        activeExpedition: persisted?.activeExpedition?.expeditionId && WORLD_EXPEDITIONS_BY_ID[persisted.activeExpedition.expeditionId] ? persisted.activeExpedition : null,
        notices: []
      }),
      partialize: (s) => ({ resources: s.resources, levels: s.levels, population: s.population, lastTick: s.lastTick, selectedBuildingId: s.selectedBuildingId, activePanel: s.activePanel, rightPanelOpen: s.rightPanelOpen, activeUpgrade: s.activeUpgrade, claimedGoalRewardIds: s.claimedGoalRewardIds, inventoryCaps: s.inventoryCaps, inventorySelectedResourceId: s.inventorySelectedResourceId, constructionCategoryId: s.constructionCategoryId, constructionPage: s.constructionPage, selectedConstructionId: s.selectedConstructionId, researchCategoryId: s.researchCategoryId, selectedResearchId: s.selectedResearchId, researchLevels: s.researchLevels, activeResearch: s.activeResearch, worldMapFilterId: s.worldMapFilterId, selectedExpeditionId: s.selectedExpeditionId, activeExpedition: s.activeExpedition })
    }
  )
);

export { productionFrom, getStage, upgradeCost, canPay, populationFromLevels, getResearchNodeStatus, worldExpeditionUnlocked };
