import { ICONS, PROP_ASSETS, VILLAGER_ASSETS } from './assetRegistry.js';

export const RESOURCES = [
  { id: 'food', label: 'Еда', icon: ICONS.food },
  { id: 'wood', label: 'Дерево', icon: ICONS.wood },
  { id: 'stone', label: 'Камень', icon: ICONS.stone },
  { id: 'goods', label: 'Товары', icon: ICONS.goods },
  { id: 'culture', label: 'Культура', icon: ICONS.culture },
  { id: 'gold', label: 'Золото', icon: ICONS.gold }
];


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
    produces: { culture: 0.22, gold: 0.12 },
    cost: { wood: 140, stone: 90, gold: 150 }
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
    produces: { food: -0.04, gold: 0.05 },
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
    produces: { food: 1.35 },
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
    produces: { wood: 1.15 },
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
    produces: { stone: 0.75 },
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
    produces: { goods: 0.6, wood: -0.12, stone: -0.06 },
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
    produces: { gold: 0.95, goods: -0.08 },
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
    produces: { culture: 0.9, gold: -0.03 },
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
    produces: { goods: 0.12, culture: 0.08 },
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
    produces: { culture: 0.34, gold: 0.18 },
    cost: { wood: 130, stone: 120, gold: 160 }
  }
];

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
  { id: 'village', title: 'Деревня', prestige: 0, road: 'village' },
  { id: 'town', title: 'Городок', prestige: 320, road: 'town' },
  { id: 'city', title: 'Город', prestige: 900, road: 'city' },
  { id: 'capital', title: 'Столица', prestige: 1700, road: 'capital' }
];

export const GOALS = [
  { id: 'collect-food', title: 'Собрать 1000 еды', check: (s) => s.resources.food >= 1000 },
  { id: 'hall-4', title: 'Улучшить Очажный зал до 4 ур.', check: (s) => s.levels['hearth-hall'] >= 4 },
  { id: 'population-20', title: 'Довести население до 20', check: (s) => s.population >= 20 },
  { id: 'culture-250', title: 'Накопить 250 культуры', check: (s) => s.resources.culture >= 250 },
  { id: 'first-town', title: 'Открыть стадию Городок', check: (s) => s.stage.id !== 'village' }
];
