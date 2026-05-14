const ROOT = '/games/settlement/';
const preferWebp = true;

export function asset(file) {
  return ROOT + file;
}

export function sprite(fileBase) {
  return asset(preferWebp ? `${fileBase}.webp` : `${fileBase}.png`);
}

export function png(fileBase) {
  return asset(`${fileBase}.png`);
}

export function trimmedAsset(url) {
  if (!url?.startsWith(ROOT) || !url.endsWith('.webp')) return url;
  const fileBase = url.slice(ROOT.length, -'.webp'.length);
  return asset(`processed/${fileBase}.trim.webp`);
}

export const MAP_ASSETS = {
  background: asset('map-background-forest-valley.webp'),
  ground: asset('map-ground-settlement-base.webp'),
  roads: {
    village: asset('road-network-village.webp'),
    town: asset('road-network-town.webp'),
    city: asset('road-network-city.webp'),
    capital: asset('road-network-capital.webp')
  }
};

export const UI_ASSETS = {
  topbar: sprite('ui-topbar-frame-9slice'),
  profile: sprite('ui-player-profile-frame'),
  resourcePill: sprite('ui-resource-pill-9slice'),
  plus: sprite('ui-resource-plus-button'),
  iconButton: sprite('ui-small-icon-button-9slice'),
  leftDock: sprite('ui-left-dock-frame'),
  dockButton: sprite('ui-dock-button-idle'),
  dockButtonActive: sprite('ui-dock-button-active'),
  badge: sprite('ui-dock-badge-red'),
  bottomFrame: sprite('ui-bottom-nav-frame-9slice'),
  bottomButton: sprite('ui-bottom-nav-button-idle'),
  bottomButtonActive: sprite('ui-bottom-nav-button-active'),
  bottomButtonPressed: sprite('ui-bottom-nav-button-pressed'),
  tabIdle: sprite('ui-tab-idle'),
  tabActive: sprite('ui-tab-active'),
  panel: sprite('ui-panel-large-9slice'),
  smallPanel: sprite('ui-panel-small-9slice'),
  sidePanelFancy: sprite('ui-side-panel-fancy'),
  ribbon: sprite('ui-panel-header-ribbon'),
  close: sprite('ui-close-button'),
  progressFrame: sprite('ui-progress-bar-frame'),
  progressGold: sprite('ui-progress-bar-fill-gold'),
  progressGreen: sprite('ui-progress-bar-fill-green')
};

export const ICONS = {
  quest: sprite('icon-quest-scroll'),
  inbox: sprite('icon-inbox-envelope'),
  build: sprite('icon-build-hammer'),
  map: sprite('icon-map-folded'),
  rank: sprite('icon-rank-trophy'),
  store: sprite('icon-store-building'),
  inventory: sprite('icon-inventory-bag'),
  buildLarge: sprite('icon-build-hammer-large'),
  research: sprite('icon-research-flask'),
  world: sprite('icon-world-compass'),
  food: sprite('icon-resource-food'),
  wood: sprite('icon-resource-wood'),
  stone: sprite('icon-resource-stone'),
  goods: sprite('icon-resource-goods'),
  culture: sprite('icon-resource-culture'),
  gold: sprite('icon-resource-gold'),
  gems: sprite('icon-resource-gems'),
  prestige: sprite('icon-resource-prestige'),
  population: sprite('icon-resource-population'),
  morale: sprite('icon-resource-morale'),
  settings: sprite('icon-settings-gear'),
  mail: sprite('icon-mail'),
  gift: sprite('icon-gift'),
  calendar: sprite('icon-calendar'),
  event: sprite('icon-event-present'),
  starterPack: sprite('icon-starter-pack-chest'),
  achievement: sprite('icon-achievement-star'),
  shield: sprite('icon-shield-rank')
};

export function buildingAsset(id, level) {
  const milestone = level >= 12 ? '12' : level >= 8 ? '08' : level >= 4 ? '04' : '01';
  return sprite(`building-${id}-level-${milestone}`);
}


export const BUILDING_IDS = [
  'hearth-hall',
  'cottage-ring',
  'common-garden',
  'lumber-camp',
  'stone-quarry',
  'craft-workshop',
  'market-green',
  'way-shrine',
  'river-bridge',
  'council-manor'
];
export const BUILDING_MILESTONES = ['01', '04', '08', '12'];
export const BUILDING_ASSETS = BUILDING_IDS.flatMap((id) =>
  BUILDING_MILESTONES.map((level) => sprite(`building-${id}-level-${level}`))
);

export const PROP_ASSETS = {
  oakSmall: sprite('prop-tree-oak-small'),
  oakLarge: sprite('prop-tree-oak-large'),
  pineSmall: sprite('prop-tree-pine-small'),
  pineLarge: sprite('prop-tree-pine-large'),
  birchSmall: sprite('prop-tree-birch-small'),
  bush: sprite('prop-bush-round'),
  flowerWhite: sprite('prop-flower-patch-white'),
  flowerYellow: sprite('prop-flower-patch-yellow'),
  flowerBlue: sprite('prop-flower-patch-blue'),
  hedge: sprite('prop-hedge-segment'),
  well: sprite('prop-well-small'),
  bench: sprite('prop-bench-small'),
  barrel: sprite('prop-barrel-small'),
  crate: sprite('prop-crate-small'),
  sack: sprite('prop-sack-small'),
  cart: sprite('prop-cart-small'),
  lantern: sprite('prop-lantern-post-small'),
  signpost: sprite('prop-signpost-small'),
  fence: sprite('prop-fence-segment-small'),
  stone: sprite('prop-stone-small'),
  rocks: sprite('prop-rock-cluster-small'),
  oakHero: sprite('prop-tree-oak-1'),
  pineHero: sprite('prop-tree-pine-1'),
  birchHero: sprite('prop-tree-birch-1'),
  rockLarge: sprite('prop-rock-large-1'),
  rockSmall: sprite('prop-rock-small-1'),
  crateStack: sprite('prop-crate-stack'),
  flowerBed: sprite('prop-flower-bed'),
  wellFull: sprite('prop-well'),
  benchFull: sprite('prop-bench'),
  barrelFull: sprite('prop-barrel'),
  sackFull: sprite('prop-sack'),
  cartFull: sprite('prop-cart'),
  lanternFull: sprite('prop-lantern-post'),
  signpostFull: sprite('prop-signpost')
};

export const VILLAGER_ASSETS = {
  farmerWalk: sprite('villager-farmer-walk-4f'),
  lumberjackWalk: sprite('villager-lumberjack-walk-4f'),
  masonWalk: sprite('villager-mason-walk-4f'),
  merchantWalk: sprite('villager-merchant-walk-4f'),
  builderCarry: sprite('villager-builder-carry-4f'),
  courierWalk: sprite('villager-courier-walk-4f'),
  elderWalk: sprite('villager-elder-walk-4f'),
  guardWalk: sprite('villager-guard-walk-4f'),
  childWalk: sprite('villager-child-walk-4f'),
  traderCartWalk: sprite('villager-trader-cart-walk-4f'),
  farmerHarvest: sprite('villager-farmer-harvest-4f'),
  builderHammer: sprite('villager-builder-hammer-4f'),
  merchantWave: sprite('villager-merchant-wave-4f'),
  masonChipstone: sprite('villager-mason-chipstone-4f'),
  lumberjackSaw: sprite('villager-lumberjack-saw-4f')
};

export const VFX_ASSETS = {
  chimneySmoke: sprite('vfx-chimney-smoke-6f'),
  marketSparkle: sprite('vfx-market-sparkle-6f'),
  buildDust: sprite('vfx-build-dust-6f'),
  levelupRays: sprite('vfx-levelup-rays'),
  questReady: sprite('vfx-quest-ready-pulse'),
  goldPop: sprite('vfx-resource-pop-gold'),
  foodPop: sprite('vfx-resource-pop-food'),
  waterGlint: sprite('vfx-water-glint-6f'),
  selectionRing: sprite('vfx-selection-ring'),
  buildingUpgradeGlow: sprite('vfx-building-upgrade-glow')
};

export const ALL_PIXI_ASSETS = [
  MAP_ASSETS.background,
  MAP_ASSETS.ground,
  ...Object.values(MAP_ASSETS.roads),
  ...BUILDING_ASSETS,
  ...Object.values(PROP_ASSETS),
  ...Object.values(VILLAGER_ASSETS),
  ...Object.values(VFX_ASSETS)
];
