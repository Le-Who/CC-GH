export const GARDEN_DAILY_QUEST_GROUP_COUNT = 3;
export const GARDEN_DAILY_QUESTS_PER_GROUP = 3;
export const GARDEN_DAILY_QUEST_COUNT = GARDEN_DAILY_QUEST_GROUP_COUNT * GARDEN_DAILY_QUESTS_PER_GROUP;

const DAILY_STAT_KEYS = ["taps", "waters", "plantsBought", "upgrades", "goldEarned", "xpEarned", "levelUps"];
const QUEST_ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

export const GARDEN_STORY_QUESTS = [
  {
    id: "first_plant",
    kind: "story",
    reward: 12,
    titleKey: "quest.firstPlant.title",
    bodyKey: "quest.firstPlant.body",
    getProgress: (state) => ({ current: Math.min((state.plants || []).length, 1), target: 1 }),
  },
  {
    id: "mature_plant",
    kind: "story",
    reward: 25,
    titleKey: "quest.maturePlant.title",
    bodyKey: "quest.maturePlant.body",
    getProgress: (state) => ({
      current: (state.plants || []).some((plant) => plant.phase === 3) ? 1 : 0,
      target: 1,
    }),
  },
  {
    id: "level_2",
    kind: "story",
    reward: 40,
    titleKey: "quest.level2.title",
    bodyKey: "quest.level2.body",
    getProgress: (state) => ({ current: Math.min(Number(state.level) || 1, 2), target: 2 }),
  },
  {
    id: "filled_shelf",
    kind: "story",
    reward: 60,
    titleKey: "quest.filledShelf.title",
    bodyKey: "quest.filledShelf.body",
    getProgress: (state) => ({
      current: Math.min((state.plants || []).filter((plant) => plant.shelfIndex >= 0 && plant.spotIndex >= 0).length, 3),
      target: 3,
    }),
  },
  {
    id: "second_shelf",
    kind: "story",
    reward: 90,
    titleKey: "quest.secondShelf.title",
    bodyKey: "quest.secondShelf.body",
    getProgress: (state) => ({ current: Math.min(Number(state.shelvesUnlocked) || 1, 2), target: 2 }),
  },
];

const DAILY_QUEST_TEMPLATES = [
  { key: "tap_3", stat: "taps", target: 3, endowed: 1, reward: 14, titleKey: "quest.daily.tap.title", bodyKey: "quest.daily.tap.body" },
  { key: "tap_5", stat: "taps", target: 5, endowed: 2, reward: 18, titleKey: "quest.daily.tap.title", bodyKey: "quest.daily.tap.body" },
  { key: "water_1", stat: "waters", target: 1, endowed: 0, reward: 14, titleKey: "quest.daily.water.title", bodyKey: "quest.daily.water.body" },
  { key: "water_2", stat: "waters", target: 2, endowed: 1, reward: 20, titleKey: "quest.daily.water.title", bodyKey: "quest.daily.water.body" },
  { key: "tend_4", stat: "tends", target: 4, endowed: 1, reward: 16, titleKey: "quest.daily.tend.title", bodyKey: "quest.daily.tend.body" },
  { key: "gold_20", stat: "goldEarned", target: 20, endowed: 5, reward: 18, titleKey: "quest.daily.gold.title", bodyKey: "quest.daily.gold.body" },
  { key: "gold_35", stat: "goldEarned", target: 35, endowed: 8, reward: 24, titleKey: "quest.daily.gold.title", bodyKey: "quest.daily.gold.body" },
  { key: "xp_16", stat: "xpEarned", target: 16, endowed: 4, reward: 18, titleKey: "quest.daily.xp.title", bodyKey: "quest.daily.xp.body" },
  { key: "plant_1", stat: "plantsBought", target: 1, endowed: 0, reward: 18, titleKey: "quest.daily.plant.title", bodyKey: "quest.daily.plant.body" },
  { key: "upgrade_1", stat: "upgrades", target: 1, endowed: 0, reward: 24, titleKey: "quest.daily.upgrade.title", bodyKey: "quest.daily.upgrade.body" },
  { key: "placed_2", metric: "placedPlants", target: 2, endowed: 1, reward: 14, titleKey: "quest.daily.placed.title", bodyKey: "quest.daily.placed.body" },
  { key: "mature_1", metric: "maturePlants", target: 1, endowed: 0, reward: 18, titleKey: "quest.daily.mature.title", bodyKey: "quest.daily.mature.body" },
];

function safeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function hashText(value = "") {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getGardenDailyDateKey(now = Date.now()) {
  const timestamp = Number(now);
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  return date.toISOString().slice(0, 10);
}

function normalizeQuestIdList(value, limit = 120) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((id) => String(id || "").trim())
    .filter((id) => QUEST_ID_PATTERN.test(id))
  )].slice(0, limit);
}

export function createGardenDailyQuestState(now = Date.now()) {
  return {
    date: getGardenDailyDateKey(now),
    claimed: [],
    stats: DAILY_STAT_KEYS.reduce((stats, key) => ({ ...stats, [key]: 0 }), {}),
  };
}

export function normalizeGardenDailyQuestState(raw = {}, now = Date.now()) {
  const date = getGardenDailyDateKey(now);
  const source = raw && typeof raw === "object" && raw.date === date ? raw : {};
  const statsSource = source.stats && typeof source.stats === "object" ? source.stats : {};
  const stats = {};
  for (const key of DAILY_STAT_KEYS) {
    stats[key] = Math.max(0, Math.min(1_000_000, safeInteger(statsSource[key], 0)));
  }
  return {
    date,
    claimed: normalizeQuestIdList(source.claimed, GARDEN_DAILY_QUEST_COUNT * 2),
    stats,
  };
}

export function isGardenDailyQuestId(id = "") {
  return /^daily_\d{8}_[0-8]_[a-z0-9_]+$/.test(String(id || ""));
}

export function recordGardenDailyProgress(rawDaily, deltas = {}, now = Date.now()) {
  const daily = normalizeGardenDailyQuestState(rawDaily, now);
  const stats = { ...daily.stats };
  for (const key of DAILY_STAT_KEYS) {
    const delta = safeInteger(deltas[key], 0);
    if (delta > 0) stats[key] = Math.min(1_000_000, stats[key] + delta);
  }
  return { ...daily, stats };
}

function selectedDailyTemplates(date) {
  const offset = hashText(date) % DAILY_QUEST_TEMPLATES.length;
  return Array.from({ length: GARDEN_DAILY_QUEST_COUNT }, (_item, index) => (
    DAILY_QUEST_TEMPLATES[(offset + index) % DAILY_QUEST_TEMPLATES.length]
  ));
}

function metricProgress(metric, state = {}) {
  const plants = Array.isArray(state.plants) ? state.plants : [];
  if (metric === "placedPlants") {
    return plants.filter((plant) => plant.shelfIndex >= 0 && plant.spotIndex >= 0).length;
  }
  if (metric === "maturePlants") {
    return plants.filter((plant) => plant.phase === 3 && plant.shelfIndex >= 0 && plant.spotIndex >= 0).length;
  }
  return 0;
}

function statProgress(stat, daily) {
  if (stat === "tends") return (daily.stats.taps || 0) + (daily.stats.waters || 0);
  return daily.stats[stat] || 0;
}

function normalizeProgress(progress = {}) {
  const target = Math.max(1, safeInteger(progress.target, 1));
  const current = Math.max(0, Math.min(target, safeInteger(progress.current, 0)));
  return {
    current,
    target,
    percent: Math.max(6, Math.min(100, (current / target) * 100)),
  };
}

export function buildGardenStoryQuests(state = {}) {
  const claimed = new Set(Array.isArray(state.claimedQuests) ? state.claimedQuests : []);
  return GARDEN_STORY_QUESTS.map((quest) => {
    const progress = normalizeProgress(quest.getProgress(state));
    return {
      ...quest,
      ...progress,
      claimed: claimed.has(quest.id),
      complete: progress.current >= progress.target,
      unlocked: true,
      section: "story",
    };
  });
}

export function buildGardenDailyQuests(state = {}, now = Date.now()) {
  const daily = normalizeGardenDailyQuestState(state.dailyQuests, now);
  const dateToken = daily.date.replace(/-/g, "");
  const claimed = new Set(daily.claimed);
  const templates = selectedDailyTemplates(daily.date);
  const quests = templates.map((template, index) => {
    const target = Math.max(1, safeInteger(template.target, 1));
    const rawCurrent = template.stat ? statProgress(template.stat, daily) : metricProgress(template.metric, state);
    const endowed = Math.max(0, Math.min(target - 1, safeInteger(template.endowed, 0)));
    const progress = normalizeProgress({ current: rawCurrent + endowed, target });
    const groupIndex = Math.floor(index / GARDEN_DAILY_QUESTS_PER_GROUP);
    return {
      id: `daily_${dateToken}_${index}_${template.key}`,
      kind: "daily",
      reward: template.reward,
      titleKey: template.titleKey,
      bodyKey: template.bodyKey,
      bodyVars: { target },
      current: progress.current,
      target: progress.target,
      percent: progress.percent,
      complete: progress.current >= progress.target,
      claimed: false,
      unlocked: false,
      section: `daily-${groupIndex + 1}`,
      groupIndex,
      endowed,
      rawCurrent,
    };
  });

  const groupClaimed = (groupIndex) => quests
    .filter((quest) => quest.groupIndex === groupIndex)
    .every((quest) => claimed.has(quest.id));

  return quests.map((quest) => ({
    ...quest,
    claimed: claimed.has(quest.id),
    unlocked: quest.groupIndex === 0 || groupClaimed(quest.groupIndex - 1),
    locked: quest.groupIndex > 0 && !groupClaimed(quest.groupIndex - 1),
  }));
}

export function buildGardenQuestSections(state = {}, now = Date.now()) {
  const daily = normalizeGardenDailyQuestState(state.dailyQuests, now);
  const dailyQuests = buildGardenDailyQuests(state, now);
  return [
    {
      id: "story",
      titleKey: "quest.storySection",
      subtitleKey: "quest.storySubtitle",
      quests: buildGardenStoryQuests(state),
    },
    ...Array.from({ length: GARDEN_DAILY_QUEST_GROUP_COUNT }, (_item, groupIndex) => {
      const quests = dailyQuests.filter((quest) => quest.groupIndex === groupIndex);
      const locked = quests.every((quest) => quest.locked);
      return {
        id: `daily-${groupIndex + 1}`,
        titleKey: "quest.dailySection",
        titleVars: { part: groupIndex + 1, total: GARDEN_DAILY_QUEST_GROUP_COUNT },
        subtitleKey: locked ? "quest.dailyLocked" : "quest.dailySubtitle",
        subtitleVars: { date: daily.date },
        locked,
        quests,
      };
    }),
  ];
}

export function getGardenReadyQuestCount(state = {}, now = Date.now()) {
  return buildGardenQuestSections(state, now)
    .flatMap((section) => section.quests)
    .filter((quest) => quest.unlocked && quest.complete && !quest.claimed)
    .length;
}
