import { ICONS, PROP_ASSETS, VILLAGER_ASSETS } from './assetRegistry.js';
import {
  SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS,
  getSettlementPlacementSlotLayout,
  settlementConstructionSlotRegionId,
} from './placementSlots.js';

export {
  SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS,
  getSettlementPlacementSlotLayout,
  settlementConstructionSlotRegionId,
};

export const RESOURCES = [
  { id: 'population', label: 'Жители', icon: ICONS.population },
  { id: 'food', label: 'Еда', icon: ICONS.food },
  { id: 'wood', label: 'Дерево', icon: ICONS.wood },
  { id: 'stone', label: 'Камень', icon: ICONS.stone },
  { id: 'goods', label: 'Товары', icon: ICONS.goods },
  { id: 'culture', label: 'Культура', icon: ICONS.culture },
  { id: 'gold', label: 'Золото', icon: ICONS.gold },
  { id: 'gems', label: 'Кристаллы', icon: ICONS.gems },
  { id: 'prestige', label: 'Престиж', icon: ICONS.prestige }
];

export const TOP_HUD_RESOURCE_IDS = ['population', 'food', 'wood', 'stone', 'gold', 'gems'];

export const SETTLEMENT_PROFILE = {
  mayorName: 'Мэр Александр',
  mayorLevel: 12,
  name: 'Зелёная деревня'
};


export const BUILDINGS = [
  {
    id: 'hearth-hall',
    name: 'Очажный зал',
    short: 'Ратуша',
    x: 1410,
    y: 1085,
    scale: 0.5,
    level: 3,
    max: 12,
    category: 'civic',
    description: 'Сердце поселения. Открывает новые стадии, дома, жителей и городские решения.',
    produces: { culture: 0.08, gold: 0.08 },
    cost: { wood: 140, stone: 90, gold: 150 },
    detail: {
      role: 'управление',
      levelProgress: { current: 320, max: 900 },
      productionPerMinute: { food: 12.4, wood: 9.6, stone: 6.2, culture: 3.1 },
      upgradeCost: { wood: 600, stone: 450, gold: 1200 },
      upgradeDurationMs: 630000,
      benefits: { passiveGoldPerMinute: 48, morale: 8 },
      body: 'Сердце вашей деревни. Отсюда управляются все важные решения, определяются приоритеты и развиваются новые возможности для жителей.'
    }
  },
  {
    id: 'cottage-ring',
    name: 'Кольцо домов',
    short: 'Жильё',
    x: 800,
    y: 1560,
    scale: 0.42,
    level: 2,
    max: 12,
    category: 'housing',
    description: 'Жилые дворы повышают население, мораль и лимит работников.',
    produces: { food: -0.04, gold: 0.04 },
    cost: { wood: 100, stone: 45, gold: 80 }
  },
  {
    id: 'common-garden',
    name: 'Общий сад',
    short: 'Ферма',
    x: 1993,
    y: 1549,
    scale: 0.36,
    level: 2,
    max: 12,
    category: 'production',
    description: 'Пассивно выращивает еду и запускает сезонные задачи сбора урожая.',
    produces: { food: 0.866 },
    cost: { wood: 70, stone: 25, gold: 70 }
  },
  {
    id: 'lumber-camp',
    name: 'Лесная артель',
    short: 'Лес',
    x: 460,
    y: 1023,
    scale: 0.36,
    level: 1,
    max: 12,
    category: 'production',
    description: 'Медленно пополняет дерево. Видимо меняется от навеса до лесопилки.',
    produces: { wood: 0.933 },
    cost: { wood: 75, stone: 20, gold: 55 }
  },
  {
    id: 'stone-quarry',
    name: 'Каменоломня',
    short: 'Камень',
    x: 2348,
    y: 967,
    scale: 0.31,
    level: 1,
    max: 12,
    category: 'production',
    description: 'Добывает камень для дорог, ратуши, мостов и поздних улучшений.',
    produces: { stone: 0.608 },
    cost: { wood: 85, stone: 35, gold: 65 }
  },
  {
    id: 'craft-workshop',
    name: 'Мастерская',
    short: 'Ремесло',
    x: 948,
    y: 505,
    scale: 0.36,
    level: 2,
    max: 12,
    category: 'production',
    description: 'Превращает сырьё в товары и ускоряет городское развитие.',
    produces: { goods: 0.208, wood: -0.12, stone: -0.06 },
    cost: { wood: 120, stone: 80, gold: 120 }
  },
  {
    id: 'market-green',
    name: 'Торговая площадь',
    short: 'Рынок',
    x: 1863,
    y: 599,
    scale: 0.38,
    level: 1,
    max: 12,
    category: 'commerce',
    description: 'Собирает золото, создаёт заявки, подарки и редкие торговые события.',
    produces: { gold: 0.31, goods: -0.08 },
    cost: { wood: 110, stone: 80, goods: 60, gold: 120 }
  },
  {
    id: 'way-shrine',
    name: 'Дорожное святилище',
    short: 'Святилище',
    x: 1418,
    y: 1760,
    scale: 0.31,
    level: 1,
    max: 12,
    category: 'culture',
    description: 'Культурная точка поселения. Улучшает мораль и открывает благословения.',
    produces: { culture: 0.08, gold: -0.03 },
    cost: { wood: 90, stone: 100, culture: 40, gold: 95 }
  },
  {
    id: 'river-bridge',
    name: 'Речной мост',
    short: 'Мост',
    x: 2260,
    y: 1285,
    scale: 0.34,
    level: 1,
    max: 12,
    category: 'infrastructure',
    description: 'Расширяет карту, снижает логистические штрафы и визуально связывает районы.',
    produces: { goods: 0.12, culture: 0.02 },
    cost: { wood: 140, stone: 130, gold: 110 }
  },
  {
    id: 'council-manor',
    name: 'Усадьба совета',
    short: 'Совет',
    x: 1377,
    y: 406,
    scale: 0.38,
    level: 1,
    max: 12,
    category: 'civic',
    description: 'Административное здание для долгих целей, указов и городских проектов.',
    produces: { culture: 0.03, gold: 0.017 },
    cost: { wood: 130, stone: 120, gold: 160 }
  }
];

export const CONSTRUCTION_PANEL_DATA = {
  pageSize: 9,
  categories: [
    { id: 'production', label: 'Производство', icon: 'production' },
    { id: 'storage', label: 'Хранение', icon: 'storage' },
    { id: 'decor', label: 'Декор', icon: 'decor' },
    { id: 'special', label: 'Особые', icon: 'special' }
  ],
  placementSlots: SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS,
  items: [
    {
      id: 'sawmill',
      name: 'Лесопилка',
      category: 'production',
      assetBuildingId: 'lumber-camp',
      assetLevel: 4,
      cost: { wood: 150, stone: 80 },
      produces: { wood: 0.72 }
    },
    {
      id: 'stonecutters-yard',
      name: 'Каменоломня',
      category: 'production',
      assetBuildingId: 'stone-quarry',
      assetLevel: 4,
      cost: { wood: 180, stone: 100 },
      produces: { stone: 0.62 }
    },
    {
      id: 'farm',
      name: 'Ферма',
      category: 'production',
      assetBuildingId: 'common-garden',
      assetLevel: 4,
      cost: { wood: 120, stone: 60 },
      produces: { food: 0.76 }
    },
    {
      id: 'mine',
      name: 'Рудник',
      category: 'production',
      assetBuildingId: 'stone-quarry',
      assetLevel: 1,
      cost: { wood: 180, stone: 120 },
      produces: { stone: 0.68, gold: 0.08 }
    },
    {
      id: 'bakery',
      name: 'Пекарня',
      category: 'production',
      assetBuildingId: 'market-green',
      assetLevel: 4,
      cost: { wood: 140, stone: 60 },
      produces: { food: 0.38, gold: 0.06 }
    },
    {
      id: 'smithy',
      name: 'Кузница',
      category: 'production',
      assetBuildingId: 'craft-workshop',
      assetLevel: 4,
      cost: { wood: 200, stone: 120 },
      produces: { goods: 0.24, stone: -0.03 }
    },
    {
      id: 'mill',
      name: 'Мельница',
      category: 'production',
      assetBuildingId: 'craft-workshop',
      assetLevel: 1,
      cost: { wood: 160, stone: 80 },
      produces: { food: 0.42 }
    },
    {
      id: 'fishing-hut',
      name: 'Рыбацкий домик',
      category: 'production',
      assetBuildingId: 'river-bridge',
      assetLevel: 1,
      cost: { wood: 130, stone: 60 },
      produces: { food: 0.34 }
    },
    {
      id: 'brewery',
      name: 'Пивоварня',
      category: 'production',
      assetBuildingId: 'council-manor',
      assetLevel: 1,
      cost: { wood: 220, stone: 150 },
      produces: { culture: 0.12, gold: 0.1 }
    },
    {
      id: 'charcoal-kiln',
      name: 'Угольная печь',
      category: 'production',
      assetBuildingId: 'craft-workshop',
      assetLevel: 8,
      cost: { wood: 240, stone: 180 }
    },
    {
      id: 'apiary',
      name: 'Пасека',
      category: 'production',
      assetBuildingId: 'common-garden',
      assetLevel: 8,
      cost: { wood: 170, stone: 90 }
    },
    {
      id: 'brickyard',
      name: 'Кирпичный двор',
      category: 'production',
      assetBuildingId: 'stone-quarry',
      assetLevel: 8,
      cost: { wood: 260, stone: 210 }
    },
    {
      id: 'warehouse',
      name: 'Склад',
      category: 'storage',
      assetBuildingId: 'market-green',
      assetLevel: 1,
      cost: { wood: 120, stone: 110 }
    },
    {
      id: 'granary',
      name: 'Амбар',
      category: 'storage',
      assetBuildingId: 'cottage-ring',
      assetLevel: 1,
      cost: { wood: 100, stone: 70 }
    },
    {
      id: 'trade-cellar',
      name: 'Погреб товаров',
      category: 'storage',
      assetBuildingId: 'craft-workshop',
      assetLevel: 1,
      cost: { wood: 160, stone: 120 }
    },
    {
      id: 'flower-square',
      name: 'Цветочная площадь',
      category: 'decor',
      assetBuildingId: 'way-shrine',
      assetLevel: 1,
      cost: { wood: 90, stone: 60 }
    },
    {
      id: 'statue-grove',
      name: 'Роща статуй',
      category: 'decor',
      assetBuildingId: 'way-shrine',
      assetLevel: 4,
      cost: { wood: 110, stone: 160 }
    },
    {
      id: 'festival-arch',
      name: 'Праздничная арка',
      category: 'decor',
      assetBuildingId: 'council-manor',
      assetLevel: 1,
      cost: { wood: 140, stone: 90 }
    },
    {
      id: 'watchtower',
      name: 'Сторожевая башня',
      category: 'special',
      assetBuildingId: 'council-manor',
      assetLevel: 4,
      cost: { wood: 220, stone: 180 }
    },
    {
      id: 'oracle-spire',
      name: 'Башня оракула',
      category: 'special',
      assetBuildingId: 'hearth-hall',
      assetLevel: 4,
      cost: { wood: 260, stone: 240 }
    },
    {
      id: 'crystal-garden',
      name: 'Кристальный сад',
      category: 'special',
      assetBuildingId: 'way-shrine',
      assetLevel: 8,
      cost: { wood: 180, stone: 210 }
    }
  ]
};

export const PROPS = [
  { id: 'oak-a', image: PROP_ASSETS.oakLarge, x: 185, y: 640, scale: 0.2 },
  { id: 'oak-b', image: PROP_ASSETS.oakSmall, x: 1730, y: 555, scale: 0.16 },
  { id: 'pine-a', image: PROP_ASSETS.pineLarge, x: 1885, y: 850, scale: 0.18 },
  { id: 'pine-b', image: PROP_ASSETS.pineSmall, x: 250, y: 1230, scale: 0.15 },
  { id: 'birch-a', image: PROP_ASSETS.birchSmall, x: 410, y: 1365, scale: 0.15 },
  { id: 'bush-a', image: PROP_ASSETS.bush, x: 710, y: 820, scale: 0.12 },
  { id: 'flowers-w', image: PROP_ASSETS.flowerWhite, x: 1180, y: 1065, scale: 0.13 },
  { id: 'flowers-y', image: PROP_ASSETS.flowerYellow, x: 1420, y: 805, scale: 0.12 },
  { id: 'flowers-b', image: PROP_ASSETS.flowerBlue, x: 475, y: 1020, scale: 0.12 },
  { id: 'hedge-a', image: PROP_ASSETS.hedge, x: 1060, y: 1135, scale: 0.17 },
  { id: 'well', image: PROP_ASSETS.well, x: 945, y: 1080, scale: 0.16 },
  { id: 'bench', image: PROP_ASSETS.bench, x: 1085, y: 1210, scale: 0.14 },
  { id: 'barrel', image: PROP_ASSETS.barrel, x: 720, y: 1270, scale: 0.12 },
  { id: 'crate', image: PROP_ASSETS.crate, x: 775, y: 1310, scale: 0.12 },
  { id: 'sack', image: PROP_ASSETS.sack, x: 1330, y: 1160, scale: 0.11 },
  { id: 'cart', image: PROP_ASSETS.cart, x: 1650, y: 1170, scale: 0.18 },
  { id: 'lantern-a', image: PROP_ASSETS.lantern, x: 875, y: 880, scale: 0.12 },
  { id: 'lantern-b', image: PROP_ASSETS.lantern, x: 1215, y: 910, scale: 0.12 },
  { id: 'signpost', image: PROP_ASSETS.signpost, x: 530, y: 940, scale: 0.13 },
  { id: 'fence-a', image: PROP_ASSETS.fence, x: 1505, y: 1230, scale: 0.13 },
  { id: 'stone', image: PROP_ASSETS.stone, x: 1540, y: 890, scale: 0.1 },
  { id: 'rocks', image: PROP_ASSETS.rocks, x: 1790, y: 990, scale: 0.13 },

  { id: 'oak-hero-nw', image: PROP_ASSETS.oakHero, x: 315, y: 820, scale: 0.18 },
  { id: 'pine-hero-ne', image: PROP_ASSETS.pineHero, x: 2205, y: 705, scale: 0.15 },
  { id: 'birch-hero-sw', image: PROP_ASSETS.birchHero, x: 610, y: 1730, scale: 0.13 },
  { id: 'rock-large-east', image: PROP_ASSETS.rockLarge, x: 2485, y: 1205, scale: 0.12 },
  { id: 'rock-small-plaza', image: PROP_ASSETS.rockSmall, x: 1680, y: 985, scale: 0.10 },
  { id: 'crate-stack-market', image: PROP_ASSETS.crateStack, x: 1745, y: 780, scale: 0.11 },
  { id: 'flower-bed-council', image: PROP_ASSETS.flowerBed, x: 1280, y: 520, scale: 0.12 },
  { id: 'well-full-plaza', image: PROP_ASSETS.wellFull, x: 1200, y: 1195, scale: 0.12 },
  { id: 'bench-full-plaza', image: PROP_ASSETS.benchFull, x: 1225, y: 1320, scale: 0.12 },
  { id: 'barrel-full-workshop', image: PROP_ASSETS.barrelFull, x: 1005, y: 610, scale: 0.10 },
  { id: 'sack-full-market', image: PROP_ASSETS.sackFull, x: 1890, y: 745, scale: 0.10 },
  { id: 'cart-full-road', image: PROP_ASSETS.cartFull, x: 1580, y: 1280, scale: 0.13 },
  { id: 'lantern-full-hall', image: PROP_ASSETS.lanternFull, x: 1328, y: 1022, scale: 0.095 },
  { id: 'signpost-full-road', image: PROP_ASSETS.signpostFull, x: 720, y: 965, scale: 0.10 }
];


export const VILLAGERS = [
  { id: 'farmer', image: VILLAGER_ASSETS.farmerWalk, x: 1985, y: 1500, scale: 0.095, path: [[1985,1500],[2115,1465],[2145,1550],[2020,1625]], layout: { cols: 2, rows: 2, frames: 4 } },
  { id: 'lumberjack', image: VILLAGER_ASSETS.lumberjackWalk, x: 380, y: 1020, scale: 0.08, path: [[380,1020],[520,980],[620,1090],[460,1160]] },
  { id: 'mason', image: VILLAGER_ASSETS.masonWalk, x: 2265, y: 955, scale: 0.075, path: [[2265,955],[2385,940],[2350,1030],[2220,1020]] },
  { id: 'merchant', image: VILLAGER_ASSETS.merchantWalk, x: 1835, y: 645, scale: 0.078, path: [[1835,645],[1930,610],[2020,690],[1910,760]] },
  { id: 'builder', image: VILLAGER_ASSETS.builderCarry, x: 980, y: 1040, scale: 0.074, path: [[980,1040],[1120,980],[1220,1070],[1070,1140]] },
  { id: 'courier', image: VILLAGER_ASSETS.courierWalk, x: 1450, y: 1360, scale: 0.072, path: [[1450,1360],[1600,1260],[1780,1180],[1910,900],[1710,1120]] },
  { id: 'elder', image: VILLAGER_ASSETS.elderWalk, x: 1310, y: 510, scale: 0.074, path: [[1310,510],[1250,565],[1340,625],[1440,560]] },
  { id: 'guard', image: VILLAGER_ASSETS.guardWalk, x: 1380, y: 955, scale: 0.074, path: [[1380,955],[1510,955],[1510,1095],[1330,1085]] },
  { id: 'child', image: VILLAGER_ASSETS.childWalk, x: 800, y: 1490, scale: 0.064, path: [[800,1490],[930,1440],[1040,1540],[905,1630]] },
  { id: 'trader', image: VILLAGER_ASSETS.traderCartWalk, x: 1940, y: 1460, scale: 0.075, path: [[1940,1460],[2100,1400],[2210,1495],[2040,1600]] }
];


export const WORKERS = [
  { id: 'builder-work', image: VILLAGER_ASSETS.builderHammer, x: 950, y: 525, scale: 0.082 },
  { id: 'merchant-wave', image: VILLAGER_ASSETS.merchantWave, x: 1865, y: 640, scale: 0.08 },
  { id: 'mason-chip', image: VILLAGER_ASSETS.masonChipstone, x: 2345, y: 960, scale: 0.082 },
  { id: 'lumber-saw', image: VILLAGER_ASSETS.lumberjackSaw, x: 470, y: 1010, scale: 0.082 },
  { id: 'farmer-harvest', image: VILLAGER_ASSETS.farmerHarvest, x: 1995, y: 1530, scale: 0.082 }
];

export const STAGE_THRESHOLDS = [
  { id: 'village', title: 'Деревня', prestige: 0 },
  { id: 'town', title: 'Городок', prestige: 320 },
  { id: 'city', title: 'Город', prestige: 900 },
  { id: 'capital', title: 'Столица', prestige: 1700 }
];

export const GOALS = [
  { id: 'collect-food', title: 'Собрать 1000 еды', check: (s) => s.resources.food >= 1000 },
  { id: 'hall-4', title: 'Улучшить Очажный зал до 4 ур.', check: (s) => s.levels['hearth-hall'] >= 4 },
  { id: 'population-20', title: 'Довести население до 20', check: (s) => s.population >= 20 },
  { id: 'culture-250', title: 'Накопить 250 культуры', check: (s) => s.resources.culture >= 250 },
  { id: 'first-town', title: 'Открыть стадию Городок', check: (s) => s.stage.id !== 'village' }
];

export const GOAL_PANEL_DATA = {
  dailyRefreshLabel: '12ч. 45м.',
  longTermGoals: [
    {
      id: 'settlement-level-15',
      title: 'Достигнуть уровня поселения 15',
      description: 'Развивайте поселение, повышайте уровень.',
      icon: 'shield',
      progress: { current: 12, max: 15 },
      reward: { type: 'gems', amount: 200 }
    },
    {
      id: 'town-hall-level-10',
      title: 'Улучшить Ратушу до уровня 10',
      description: 'Повышайте уровень Ратуши.',
      icon: 'town-hall',
      progress: { current: 7, max: 10 },
      reward: { type: 'culture', amount: 150 }
    },
    {
      id: 'population-600',
      title: 'Население 600 жителей',
      description: 'Увеличьте количество жителей в поселении.',
      icon: 'population',
      progress: { current: 520, max: 600 },
      reward: { type: 'gold', amount: 1000 }
    },
    {
      id: 'prestige-5000',
      title: 'Заработать 5 000 престижа',
      description: 'Выполняйте цели и развивайте поселение.',
      icon: 'prestige',
      progress: { current: 3420, max: 5000 },
      reward: { type: 'prestige', amount: 250 }
    }
  ],
  dailyTasks: [
    {
      id: 'daily-wood-800',
      title: 'Соберите дерево',
      description: 'Соберите 800 ед. дерева.',
      icon: 'wood',
      progress: { current: 800, max: 800 },
      reward: { type: 'gold', amount: 150 }
    },
    {
      id: 'daily-stone-600',
      title: 'Добыть камень',
      description: 'Добыть 600 ед. камня.',
      icon: 'stone',
      progress: { current: 600, max: 600 },
      reward: { type: 'food', amount: 120 }
    },
    {
      id: 'daily-enemies-3',
      title: 'Победите врагов',
      description: 'Победите врагов в приключениях: 3',
      icon: 'combat',
      progress: { current: 3, max: 3 },
      reward: { type: 'gems', amount: 80 }
    }
  ]
};

export const INVENTORY_PANEL_DATA = {
  resourceRows: [
    { id: 'food', label: 'Еда', initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
    { id: 'wood', label: 'Дерево', initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
    { id: 'stone', label: 'Камень', initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
    { id: 'goods', label: 'Товары', initialCap: 10000, step: 500, boostStep: 1000, minCap: 5000, maxCap: 20000 },
    { id: 'gold', label: 'Золото', initialCap: 20000, step: 1000, boostStep: 2000, minCap: 10000, maxCap: 40000 },
    { id: 'culture', label: 'Культура', initialCap: 5000, step: 500, boostStep: 1000, minCap: 2500, maxCap: 10000 },
    { id: 'gems', label: 'Кристаллы', initialCap: 5000, step: 500, boostStep: 1000, minCap: 2500, maxCap: 10000 },
    { id: 'prestige', label: 'Престиж', initialCap: 5000, step: 500, boostStep: 1000, minCap: 2500, maxCap: 10000 }
  ],
  specialItems: [
    { id: 'settlement-cart', title: 'Транспортный сундук', amount: 12, icon: 'starterPack' },
    { id: 'warehouse-barrel', title: 'Бочка хранения', amount: 8, icon: 'inventory' },
    { id: 'sealed-scroll', title: 'Опечатанный свиток', amount: 6, icon: 'quest' },
    { id: 'navigation-compass', title: 'Навигационный компас', amount: 3, icon: 'world' },
    { id: 'reward-medallion', title: 'Памятный знак', amount: 2, icon: 'achievement' }
  ]
};

export const COUNCIL_PANEL_DATA = {
  stage: {
    title: 'Устойчивая деревня',
    phaseLabel: 'Этап 3 из 5',
    progress: { current: 1850, max: 2500 },
    description: 'Развивайте поселение, выполняя цели и следуя советам.'
  },
  recommendations: [
    {
      id: 'upgrade-lumber-camp',
      advisor: 'Мастер-строитель',
      title: 'Улучшите лесопилку до ур. 3',
      description: 'Повысит добычу дерева на 25% и ускорит строительство.',
      icon: 'wood',
      portrait: 'elder',
      action: { kind: 'building', buildingId: 'lumber-camp', label: 'Следовать совету' }
    },
    {
      id: 'increase-food',
      advisor: 'Хранительница запасов',
      title: 'Увеличьте производство еды',
      description: 'Запасы еды низкие. Постройте ферму или улучшите существующие.',
      icon: 'food',
      portrait: 'keeper',
      action: { kind: 'building', buildingId: 'common-garden', label: 'Следовать совету' }
    },
    {
      id: 'strengthen-defense',
      advisor: 'Капитан стражи',
      title: 'Укрепите оборону',
      description: 'Постройте сторожевую башню для защиты поселения.',
      icon: 'stone',
      portrait: 'guard',
      action: { kind: 'panel', panel: 'construction', label: 'Следовать совету' }
    }
  ],
  buildPriorities: [
    { id: 'lumber-camp', title: 'Лесопилка ур. 3', priority: 'Высокий приоритет', trend: 'up', icon: 'wood' },
    { id: 'common-garden', title: 'Ферма', priority: 'Средний приоритет', trend: 'flat', icon: 'food' },
    { id: 'watchtower', title: 'Сторожевая башня', priority: 'Средний приоритет', trend: 'flat', icon: 'stone' }
  ]
};

export const RESEARCH_PANEL_DATA = {
  categories: [
    { id: 'farming', label: 'Хозяйство', icon: 'food', defaultNodeId: 'stone-masonry' },
    { id: 'trade', label: 'Торговля', icon: 'gold', defaultNodeId: 'trade-routes' },
    { id: 'culture', label: 'Культура', icon: 'culture', defaultNodeId: 'civic-chronicles' }
  ],
  nodes: [
    {
      id: 'improved-fields',
      category: 'farming',
      title: 'Улучшенные поля',
      icon: 'food',
      level: 3,
      maxLevel: 5,
      initialState: 'complete',
      position: { col: 1, row: 1 },
      connectors: { right: true, down: true },
      description: 'Повышает базовую урожайность и подготавливает поля к орошению.',
      benefits: ['+8% к производству еды', '+1 к лимиту фермерских участков']
    },
    {
      id: 'irrigation',
      category: 'farming',
      title: 'Ирригация',
      icon: 'gems',
      level: 2,
      maxLevel: 3,
      initialState: 'complete',
      position: { col: 2, row: 1 },
      connectors: { right: true, down: true },
      requires: [{ id: 'improved-fields', level: 3 }],
      description: 'Каналы и водосборы снижают потери урожая в сухой сезон.',
      benefits: ['+12% к стабильности еды', '+1 к запасу воды для ферм']
    },
    {
      id: 'fertile-soils',
      category: 'farming',
      title: 'Плодородие почв',
      icon: 'food',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 1 },
      requires: [{ id: 'irrigation', level: 3 }],
      requiredLabel: 'Требуется Ирригация',
      description: 'Полевые удобрения открывают поздние бонусы хозяйства.',
      benefits: ['+15% к росту еды', '+2 к вместимости амбаров']
    },
    {
      id: 'lumber-processing',
      category: 'farming',
      title: 'Лесопиление',
      icon: 'wood',
      level: 3,
      maxLevel: 5,
      initialState: 'complete',
      position: { col: 1, row: 2 },
      connectors: { right: true, down: true },
      description: 'Улучшенная обработка дерева ускоряет плотников и стройку.',
      benefits: ['+10% к добыче дерева', '-5% к деревянной стоимости зданий']
    },
    {
      id: 'stone-masonry',
      category: 'farming',
      title: 'Каменная кладка',
      icon: 'stone',
      level: 1,
      maxLevel: 3,
      initialState: 'available',
      position: { col: 2, row: 2 },
      connectors: { right: true, down: true },
      requires: [
        { id: 'lumber-processing', level: 3 },
        { id: 'irrigation', level: 2 }
      ],
      progress: { current: 150, max: 250, type: 'gems' },
      cost: { wood: 250, stone: 250, culture: 50 },
      durationMs: 900000,
      description: 'Улучшенные методы обработки камня позволяют строить более прочные и надежные здания.',
      benefits: ['+10% к прочности зданий', '+1 к вместимости Каменоломни']
    },
    {
      id: 'improved-tools',
      category: 'farming',
      title: 'Улучшенные инструменты',
      icon: 'build',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 2 },
      requires: [{ id: 'stone-masonry', level: 2 }],
      requiredLabel: 'Требуется Каменная кладка',
      description: 'Инструменты мастеров повышают эффективность всех производств.',
      benefits: ['+8% к скорости строительства', '+6% к добыче ресурсов']
    },
    {
      id: 'storage-yards',
      category: 'farming',
      title: 'Хранилища',
      icon: 'inventory',
      level: 2,
      maxLevel: 3,
      initialState: 'complete',
      position: { col: 1, row: 3 },
      connectors: { right: true },
      description: 'Расширяет безопасные склады для дерева, камня и еды.',
      benefits: ['+1000 к лимиту склада', '-10% к потерям при переполнении']
    },
    {
      id: 'resource-management',
      category: 'farming',
      title: 'Управление ресурсами',
      icon: 'goods',
      level: 1,
      maxLevel: 3,
      initialState: 'available',
      position: { col: 2, row: 3 },
      connectors: { right: true },
      requires: [{ id: 'storage-yards', level: 2 }],
      progress: { current: 120, max: 200, type: 'gems' },
      cost: { wood: 180, stone: 160, goods: 40 },
      durationMs: 720000,
      description: 'Учит жителей распределять запасы между складами без простоев.',
      benefits: ['+6% к пассивной добыче', '+1 к лимиту активных поручений']
    },
    {
      id: 'farming-mastery',
      category: 'farming',
      title: 'Мастерство земледелия',
      icon: 'food',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 3 },
      requires: [{ id: 'resource-management', level: 2 }],
      requiredLabel: 'Требуется Управление ресурсами',
      description: 'Финальный хозяйственный узел для стабильного роста еды.',
      benefits: ['+20% к производству еды', '+2 к поселковому запасу рабочих']
    },
    {
      id: 'market-ledgers',
      category: 'trade',
      title: 'Торговые меры',
      icon: 'goods',
      level: 2,
      maxLevel: 5,
      initialState: 'complete',
      position: { col: 1, row: 1 },
      connectors: { right: true, down: true },
      description: 'Единые меры упрощают обмен товаров между кварталами.',
      benefits: ['+7% к товарам', '+4% к доходу рынка']
    },
    {
      id: 'caravan-permits',
      category: 'trade',
      title: 'Караваны',
      icon: 'world',
      level: 1,
      maxLevel: 3,
      initialState: 'complete',
      position: { col: 2, row: 1 },
      connectors: { right: true, down: true },
      requires: [{ id: 'market-ledgers', level: 2 }],
      description: 'Открывает безопасные правила для торговых обозов.',
      benefits: ['+1 к торговым поручениям', '+5% к золоту']
    },
    {
      id: 'exchange-ledgers',
      category: 'trade',
      title: 'Биржевые записи',
      icon: 'gold',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 1 },
      requires: [{ id: 'caravan-permits', level: 2 }],
      requiredLabel: 'Требуются Караваны',
      description: 'Сводит большие сделки и редкие заявки в одну систему.',
      benefits: ['+12% к крупным заказам', '+1 к лимиту рынка']
    },
    {
      id: 'trade-charters',
      category: 'trade',
      title: 'Договоры',
      icon: 'quest',
      level: 2,
      maxLevel: 5,
      initialState: 'complete',
      position: { col: 1, row: 2 },
      connectors: { right: true, down: true },
      description: 'Городские договоры ускоряют поставки сырья.',
      benefits: ['-6% к цене обмена', '+5% к товарам']
    },
    {
      id: 'trade-routes',
      category: 'trade',
      title: 'Торговые связи',
      icon: 'gold',
      level: 1,
      maxLevel: 3,
      initialState: 'available',
      position: { col: 2, row: 2 },
      connectors: { right: true, down: true },
      requires: [
        { id: 'trade-charters', level: 2 },
        { id: 'caravan-permits', level: 1 }
      ],
      progress: { current: 90, max: 180, type: 'gems' },
      cost: { goods: 180, gold: 300, culture: 40 },
      durationMs: 840000,
      description: 'Связывает рынок с внешними поставщиками и повышает доходность заказов.',
      benefits: ['+10% к золоту рынка', '+1 к активному торговому заказу']
    },
    {
      id: 'guild-stalls',
      category: 'trade',
      title: 'Гильдейские лавки',
      icon: 'store',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 2 },
      requires: [{ id: 'trade-routes', level: 2 }],
      requiredLabel: 'Требуются Торговые связи',
      description: 'Лавки гильдий открывают редкие товары и бонусы рынка.',
      benefits: ['+8% к товарам', '+1 редкое предложение']
    },
    {
      id: 'market-stores',
      category: 'trade',
      title: 'Рыночные склады',
      icon: 'inventory',
      level: 2,
      maxLevel: 3,
      initialState: 'complete',
      position: { col: 1, row: 3 },
      connectors: { right: true },
      description: 'Защищает товары от переполнения и задержек.',
      benefits: ['+800 к лимиту товаров', '+5% к скорости сбора']
    },
    {
      id: 'treasury-control',
      category: 'trade',
      title: 'Казначейство',
      icon: 'prestige',
      level: 1,
      maxLevel: 3,
      initialState: 'available',
      position: { col: 2, row: 3 },
      connectors: { right: true },
      requires: [{ id: 'market-stores', level: 2 }],
      progress: { current: 70, max: 160, type: 'gems' },
      cost: { gold: 420, goods: 120, stone: 90 },
      durationMs: 780000,
      description: 'Наводит порядок в налогах и резервах поселения.',
      benefits: ['+6% к золоту', '+1200 к лимиту золота']
    },
    {
      id: 'distant-contracts',
      category: 'trade',
      title: 'Дальние контракты',
      icon: 'world',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 3 },
      requires: [{ id: 'treasury-control', level: 2 }],
      requiredLabel: 'Требуется Казначейство',
      description: 'Открывает внешние сделки для поздней стадии поселения.',
      benefits: ['+15% к торговым наградам', '+1 маршрут каравана']
    },
    {
      id: 'festival-calendar',
      category: 'culture',
      title: 'Праздничный календарь',
      icon: 'calendar',
      level: 2,
      maxLevel: 5,
      initialState: 'complete',
      position: { col: 1, row: 1 },
      connectors: { right: true, down: true },
      description: 'Упорядочивает праздники, повышая мораль жителей.',
      benefits: ['+5% к морали', '+4% к культуре']
    },
    {
      id: 'art-workshops',
      category: 'culture',
      title: 'Мастерские искусств',
      icon: 'culture',
      level: 1,
      maxLevel: 3,
      initialState: 'complete',
      position: { col: 2, row: 1 },
      connectors: { right: true, down: true },
      requires: [{ id: 'festival-calendar', level: 2 }],
      description: 'Ремесленники создают украшения и культурные товары.',
      benefits: ['+7% к культуре', '+3% к товарам']
    },
    {
      id: 'academy-lessons',
      category: 'culture',
      title: 'Академия',
      icon: 'research',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 1 },
      requires: [{ id: 'art-workshops', level: 2 }],
      requiredLabel: 'Требуются Мастерские искусств',
      description: 'Обучает мастеров и открывает поздние культурные решения.',
      benefits: ['+10% к исследованиям', '+1 советник']
    },
    {
      id: 'folk-songs',
      category: 'culture',
      title: 'Народные песни',
      icon: 'morale',
      level: 2,
      maxLevel: 5,
      initialState: 'complete',
      position: { col: 1, row: 2 },
      connectors: { right: true, down: true },
      description: 'Общие песни снижают усталость рабочих.',
      benefits: ['+4% к морали', '+4% к скорости сбора']
    },
    {
      id: 'civic-chronicles',
      category: 'culture',
      title: 'Городская летопись',
      icon: 'quest',
      level: 1,
      maxLevel: 3,
      initialState: 'available',
      position: { col: 2, row: 2 },
      connectors: { right: true, down: true },
      requires: [
        { id: 'folk-songs', level: 2 },
        { id: 'art-workshops', level: 1 }
      ],
      progress: { current: 100, max: 190, type: 'gems' },
      cost: { culture: 180, gold: 220, goods: 70 },
      durationMs: 810000,
      description: 'Летописцы фиксируют достижения и ускоряют рост престижа.',
      benefits: ['+8% к престижу', '+1 к культурному поручению']
    },
    {
      id: 'archive-halls',
      category: 'culture',
      title: 'Архивы',
      icon: 'inventory',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 2 },
      requires: [{ id: 'civic-chronicles', level: 2 }],
      requiredLabel: 'Требуется Городская летопись',
      description: 'Хранит знания совета и редкие культурные решения.',
      benefits: ['+12% к культуре', '+1 слот решения']
    },
    {
      id: 'council-manors',
      category: 'culture',
      title: 'Усадьбы совета',
      icon: 'shield',
      level: 2,
      maxLevel: 3,
      initialState: 'complete',
      position: { col: 1, row: 3 },
      connectors: { right: true },
      description: 'Улучшает работу советников и снижает задержки поручений.',
      benefits: ['+6% к решениям совета', '+3% к престижу']
    },
    {
      id: 'mentor-circle',
      category: 'culture',
      title: 'Наставники',
      icon: 'population',
      level: 1,
      maxLevel: 3,
      initialState: 'available',
      position: { col: 2, row: 3 },
      connectors: { right: true },
      requires: [{ id: 'council-manors', level: 2 }],
      progress: { current: 80, max: 170, type: 'gems' },
      cost: { culture: 160, food: 220, gold: 180 },
      durationMs: 750000,
      description: 'Опытные жители обучают новых рабочих и ускоряют рост поселения.',
      benefits: ['+1 к населению от жилья', '+5% к морали']
    },
    {
      id: 'culture-mastery',
      category: 'culture',
      title: 'Мастерство культуры',
      icon: 'prestige',
      level: 0,
      maxLevel: 3,
      initialState: 'locked',
      position: { col: 3, row: 3 },
      requires: [{ id: 'mentor-circle', level: 2 }],
      requiredLabel: 'Требуются Наставники',
      description: 'Финальный культурный узел для роста престижа и морали.',
      benefits: ['+18% к культуре', '+10% к престижу']
    }
  ]
};

export const WORLD_MAP_PANEL_DATA = {
  filters: [
    { id: 'all', label: 'Все', icon: 'world' },
    { id: 'nature', label: 'Леса', icon: 'wood' },
    { id: 'ruins', label: 'Руины', icon: 'gems' },
    { id: 'danger', label: 'Опасно', icon: 'prestige' }
  ],
  mapMarkers: [
    { id: 'marker-forest', expeditionId: 'ancient-forest', x: 25, y: 66, tone: 'forest', label: 'Древний лес' },
    { id: 'marker-ruins', expeditionId: 'drowned-ruins', x: 43, y: 43, tone: 'ruins', label: 'Затонувшие руины' },
    { id: 'marker-volcano', expeditionId: 'volcanic-mountains', x: 69, y: 58, tone: 'danger', label: 'Вулканические горы' },
    { id: 'marker-ice', expeditionId: 'ice-wastes', x: 82, y: 36, tone: 'locked', label: 'Ледяные пустоши' }
  ],
  expeditions: [
    {
      id: 'ancient-forest',
      title: 'Древний лес',
      category: 'nature',
      difficulty: 'Лёгкая',
      difficultyTone: 'easy',
      durationMs: 1200000,
      description: 'Богатая флора и дикие существа. Много дерева и трав.',
      icon: 'wood',
      rewards: { wood: 400, food: 200, gems: 1 },
      unlocked: true
    },
    {
      id: 'drowned-ruins',
      title: 'Затонувшие руины',
      category: 'ruins',
      difficulty: 'Средняя',
      difficultyTone: 'medium',
      durationMs: 2100000,
      description: 'Руины старой цивилизации под водой.',
      icon: 'gems',
      rewards: { stone: 600, gold: 300, gems: 1 },
      unlocked: true
    },
    {
      id: 'volcanic-mountains',
      title: 'Вулканические горы',
      category: 'danger',
      difficulty: 'Сложная',
      difficultyTone: 'hard',
      durationMs: 3000000,
      description: 'Опасные земли, но полные редких ресурсов.',
      icon: 'prestige',
      rewards: { stone: 800, gold: 400, prestige: 2 },
      unlocked: true
    },
    {
      id: 'ice-wastes',
      title: 'Ледяные пустоши',
      category: 'danger',
      difficulty: 'Закрыто',
      difficultyTone: 'locked',
      durationMs: 3600000,
      description: 'Северный маршрут откроется после роста поселения.',
      icon: 'world',
      rewards: { gems: 2, culture: 240, prestige: 4 },
      unlocked: false,
      requiredLabel: 'Требуется уровень поселения 15'
    }
  ]
};
