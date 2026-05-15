import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Application,
  Assets,
  AnimatedSprite,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  Text
} from 'pixi.js';
import { useImmersiveGame } from '../../app/gameHooks.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { canPay, getResearchNodeStatus, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
import './settlement.css';

// ui-implementation-v18-step1: right-panel screen registry + router foundation
const WORLD = { w: 4096, h: 3072 };
const GROUND = { x: 640, y: 390, w: 2816, h: 2112 };
const STAGE_ROAD_FADE_MS = 550;
const DEFAULT_FRAME_INSET = 3;
const RUNTIME_TEXTURE_CACHE = new Map();
const BUILDING_VISUALS = {
  'hearth-hall': { ringScale: 0.27, ringY: 4, smoke: { x: 56, y: -218 } },
  'cottage-ring': { ringScale: 0.24, ringY: 4, smoke: { x: 34, y: -122 } },
  'common-garden': { ringScale: 0.22, ringY: 5 },
  'lumber-camp': { ringScale: 0.21, ringY: 4 },
  'stone-quarry': { ringScale: 0.2, ringY: 5 },
  'craft-workshop': { ringScale: 0.22, ringY: 4, smoke: { x: 48, y: -144 } },
  'market-green': { ringScale: 0.23, ringY: 4 },
  'way-shrine': { ringScale: 0.18, ringY: 5 },
  'river-bridge': { ringScale: 0.2, ringY: 3 },
  'council-manor': { ringScale: 0.24, ringY: 2, smoke: { x: 44, y: -192 } }
};


const RESOURCE_LABELS = {
  food: 'Еда',
  wood: 'Дерево',
  stone: 'Камень',
  goods: 'Товары',
  culture: 'Культура',
  gold: 'Золото',
  gems: 'Кристаллы',
  prestige: 'Престиж',
  morale: 'Мораль',
  population: 'Жители'
};

const RESOURCE_ICONS = {
  food: ICONS.food,
  wood: ICONS.wood,
  stone: ICONS.stone,
  goods: ICONS.goods,
  culture: ICONS.culture,
  gold: ICONS.gold,
  gems: ICONS.gems,
  prestige: ICONS.prestige,
  morale: ICONS.morale,
  population: ICONS.population
};

const PANEL_TABS = [
  { id: 'build', label: 'Здание', icon: ICONS.build },
  { id: 'goals', label: 'Цели', icon: ICONS.quest },
  { id: 'inventory', label: 'Инвентарь', icon: ICONS.inventory },
  { id: 'council', label: 'Совет', icon: ICONS.research }
];

const EVENT_CARDS = [
  { id: 'event', label: 'Событие', sub: '3д 12ч', icon: ICONS.event },
  { id: 'gift', label: 'Подарок', sub: 'готов', icon: ICONS.gift },
  { id: 'starter', label: 'Набор', sub: '1д 6ч', icon: ICONS.starterPack },
  { id: 'mail', label: 'Почта', sub: '3', icon: ICONS.mail }
];

const CATEGORY_LABELS = {
  civic: 'Управление',
  housing: 'Жильё',
  production: 'Производство',
  commerce: 'Торговля',
  culture: 'Культура',
  infrastructure: 'Инфраструктура'
};

const GOAL_ICON_SOURCES = {
  shield: ICONS.shield,
  'town-hall': buildingAsset('hearth-hall', 3),
  population: ICONS.population,
  prestige: ICONS.prestige,
  wood: ICONS.wood,
  stone: ICONS.stone,
  combat: ICONS.achievement
};

const SPECIAL_ITEM_ICON_SOURCES = {
  starterPack: ICONS.starterPack,
  inventory: ICONS.inventory,
  quest: ICONS.quest,
  world: ICONS.world,
  achievement: ICONS.achievement
};

const COUNCIL_ICON_SOURCES = {
  food: ICONS.food,
  wood: ICONS.wood,
  stone: ICONS.stone,
  shield: ICONS.shield,
  elder: ICONS.research,
  keeper: ICONS.morale,
  guard: ICONS.shield
};

const CONSTRUCTION_CATEGORY_ICONS = {
  production: ICONS.goods,
  storage: ICONS.inventory,
  decor: ICONS.culture,
  special: ICONS.gems
};

const RESEARCH_ICON_SOURCES = {
  achievement: ICONS.achievement,
  build: ICONS.build,
  calendar: ICONS.calendar,
  culture: ICONS.culture,
  food: ICONS.food,
  gems: ICONS.gems,
  gold: ICONS.gold,
  goods: ICONS.goods,
  inventory: ICONS.inventory,
  map: ICONS.map,
  morale: ICONS.morale,
  population: ICONS.population,
  prestige: ICONS.prestige,
  quest: ICONS.quest,
  research: ICONS.research,
  shield: ICONS.shield,
  stone: ICONS.stone,
  store: ICONS.store,
  wood: ICONS.wood,
  world: ICONS.world
};

const WORLD_MAP_ICON_SOURCES = {
  ...RESOURCE_ICONS,
  all: ICONS.world,
  nature: ICONS.wood,
  ruins: ICONS.gems,
  danger: ICONS.prestige,
  locked: ICONS.shield,
  forest: ICONS.wood,
  map: ICONS.map,
  world: ICONS.world
};

function constructionItemAsset(item) {
  return buildingAsset(item.assetBuildingId, item.assetLevel ?? 1);
}


const RIGHT_PANEL_SCREENS = {
  overview: {
    id: 'overview',
    label: 'Обзор',
    icon: ICONS.shield,
    kind: 'overview',
    title: 'Обзор деревни',
    eyebrow: 'Поселение',
    subline: 'Состояние поселения и текущие задачи'
  },
  build: {
    id: 'build',
    label: 'Здание',
    icon: ICONS.build,
    kind: 'building',
    title: 'Здание',
    eyebrow: 'Здание',
    subline: 'Уровень, производство и улучшение'
  },
  goals: {
    id: 'goals',
    label: 'Цели',
    icon: ICONS.quest,
    kind: 'goals',
    title: 'Цели поселения',
    eyebrow: 'Прогресс',
    subline: 'Длинные цели без ускорения темпа'
  },
  inventory: {
    id: 'inventory',
    label: 'Инвентарь',
    icon: ICONS.inventory,
    kind: 'inventory',
    title: 'Инвентарь и склад',
    eyebrow: 'Склад',
    subline: 'Ресурсы, вместимость и особые предметы'
  },
  council: {
    id: 'council',
    label: 'Совет',
    icon: ICONS.research,
    kind: 'council',
    title: 'Совет и исследования',
    eyebrow: 'Совет',
    subline: 'Рекомендации, стадия и приоритеты',
    headerIcon: ICONS.research
  },
  research: {
    id: 'research',
    label: 'Исследования',
    icon: ICONS.research,
    kind: 'research-tree',
    title: 'Исследования',
    eyebrow: 'Технологии',
    subline: 'Исследуйте технологии и открывайте возможности'
  },
  store: {
    id: 'store',
    label: 'Магазин',
    icon: ICONS.store,
    kind: 'store',
    title: 'Магазин',
    eyebrow: 'Предложения',
    subline: 'Награды, подарки и наборы'
  },
  inbox: {
    id: 'inbox',
    label: 'Вести',
    icon: ICONS.inbox,
    kind: 'inbox',
    title: 'Вести деревни',
    eyebrow: 'Сообщения',
    subline: 'Почта, события и новости поселения'
  },
  map: {
    id: 'map',
    label: 'Карта',
    icon: ICONS.map,
    kind: 'world-map',
    title: 'Карта мира',
    eyebrow: 'Мир',
    subline: 'Слои карты, экспедиции и состояние дорог',
    headerIcon: ICONS.map
  },
  rank: {
    id: 'rank',
    label: 'Ранг',
    icon: ICONS.rank,
    kind: 'rank',
    title: 'Ранг поселения',
    eyebrow: 'Престиж',
    subline: 'Репутация, стадия и престиж поселения'
  },
  construction: {
    id: 'construction',
    label: 'Строительство',
    icon: ICONS.buildLarge,
    kind: 'construction',
    title: 'Строительство',
    eyebrow: 'Каталог',
    subline: 'Выбор зданий и свободных площадок'
  },
  world: {
    id: 'world',
    label: 'Мир',
    icon: ICONS.world,
    kind: 'world-map',
    title: 'Карта мира',
    eyebrow: 'Экспедиции',
    subline: 'Доступные регионы, риски и награды',
    headerIcon: ICONS.world
  }
};

function getRightPanelScreen(activePanel) {
  return RIGHT_PANEL_SCREENS[activePanel] ?? RIGHT_PANEL_SCREENS.overview;
}

function getRightPanelChrome({ activePanel, selected, level }) {
  const screen = getRightPanelScreen(activePanel);
  if (screen.kind !== 'building') return screen;
  const category = CATEGORY_LABELS[selected.category] ?? selected.category;
  return {
    ...screen,
    title: selected.name,
    eyebrow: category,
    subline: `Уровень ${level}/${selected.max} · ${category}`
  };
}

function formatNumber(n) {
  const value = Math.floor(n ?? 0);
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 10000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString('ru-RU');
}

function textureFromFrame(base, frame) {
  try {
    return new Texture({ source: base.source, frame });
  } catch (_) {
    return new Texture(base.baseTexture, frame);
  }
}

function splitTexture(texture, { frames = 4, cols = frames, rows = 1, inset = 0 } = {}) {
  const width = texture.width;
  const height = texture.height;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  const out = [];
  for (let i = 0; i < frames; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const frameX = col * cellW + inset;
    const frameY = row * cellH + inset;
    const frameW = Math.max(1, cellW - inset * 2);
    const frameH = Math.max(1, cellH - inset * 2);
    out.push(textureFromFrame(texture, new Rectangle(frameX, frameY, frameW, frameH)));
  }
  return out;
}

function anchorBottom(sprite) {
  sprite.anchor.set(0.5, 1);
  return sprite;
}

function makeSafeSprite(texture) {
  const sprite = new Sprite(texture);
  sprite.eventMode = 'none';
  sprite.roundPixels = false;
  return sprite;
}

async function loadTexture(url, options = {}) {
  const textureUrl = options.trim ? trimmedAsset(url) : url;
  if (RUNTIME_TEXTURE_CACHE.has(textureUrl)) return RUNTIME_TEXTURE_CACHE.get(textureUrl);

  const promise = Assets.load(textureUrl).then((texture) => texture ?? Assets.get(textureUrl) ?? Texture.from(textureUrl));
  RUNTIME_TEXTURE_CACHE.set(textureUrl, promise);
  return promise;
}

function destroyPixiAppSafely(app) {
  if (!app) return;
  try {
    app._vaCleanup?.();
  } catch (_) {
    // Ignore cleanup races during React StrictMode / Vite HMR remounts.
  }
  try {
    if (typeof app._cancelResize !== 'function') app._cancelResize = () => {};
    app.destroy(true, { children: true, texture: false, textureSource: false });
  } catch (error) {
    console.warn('Pixi Application destroy skipped after cleanup race:', error);
  }
}

function boundsForCamera(viewW, viewH, scale) {
  const minX = Math.min(0, viewW - WORLD.w * scale);
  const minY = Math.min(0, viewH - WORLD.h * scale);
  return { minX, maxX: 0, minY, maxY: 0 };
}

function clampCamera(camera, viewW, viewH) {
  const b = boundsForCamera(viewW, viewH, camera.scale);
  camera.x = Math.min(b.maxX, Math.max(b.minX, camera.x));
  camera.y = Math.min(b.maxY, Math.max(b.minY, camera.y));
}

function getInitialCamera(viewW, viewH) {
  const safeW = Math.max(360, viewW);
  const safeH = Math.max(420, viewH);
  const scale = Math.min(safeW / 2350, safeH / 1650, 0.62);
  const x = safeW / 2 - (GROUND.x + GROUND.w / 2) * scale;
  const y = safeH / 2 - (GROUND.y + GROUND.h / 2) * scale + 40;
  const camera = { x, y, scale };
  clampCamera(camera, safeW, safeH);
  return camera;
}

function createTextLabel(label, x, y, variant = 'small') {
  const group = new Container();
  group.x = x;
  group.y = y;
  group.eventMode = 'none';

  const paddingX = variant === 'large' ? 16 : 12;
  const paddingY = variant === 'large' ? 8 : 5;
  const fontSize = variant === 'large' ? 28 : 22;
  const text = new Text({
    text: label,
    style: {
      fontFamily: 'Georgia, serif',
      fontSize,
      fontWeight: '700',
      fill: '#fff0ce',
      stroke: { color: '#1b1309', width: 5 },
      dropShadow: { color: '#000000', alpha: 0.6, blur: 2, distance: 2 }
    }
  });
  text.anchor.set(0.5, 0.5);
  const bg = new Graphics();
  const w = Math.max(72, text.width + paddingX * 2);
  const h = text.height + paddingY * 2;
  bg.roundRect(-w / 2, -h / 2, w, h, 12).fill({ color: 0x22190d, alpha: 0.78 }).stroke({ color: 0xc3963b, width: 1, alpha: 0.55 });
  group.addChild(bg, text);
  return group;
}

function createLevelBadge(level, x, y) {
  return createTextLabel(`Lv ${level}`, x, y, 'small');
}


function resourceLabel(key) {
  return RESOURCE_LABELS[key] ?? key;
}

function formatDecimal(value, digits = 1) {
  return Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatSignedPerMinute(value, digits = 1) {
  const n = Number(value ?? 0);
  return `${n > 0 ? '+' : ''}${formatDecimal(n, digits)}/мин`;
}

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}м ${seconds.toString().padStart(2, '0')}с`;
}

function formatClockDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function ResourceIcon({ type, size = 16, className = '' }) {
  const src = RESOURCE_ICONS[type];
  return src ? <AssetIcon src={src} alt="" className={className} size={size} /> : null;
}

function HudFrame({ children, className = '', frame = UI_ASSETS.panel, ...props }) {
  return <div className={className} style={frameStyle(frame)} {...props}>{children}</div>;
}

function ProgressBar({ value = 0, max = 100, fill = 'green', label, className = '' }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const fillAsset = fill === 'gold' ? UI_ASSETS.progressGold : UI_ASSETS.progressGreen;
  return (
    <div className={`asset-progress ${className}`.trim()}>
      {label ? <span>{label}</span> : null}
      <div className="asset-progress-track" style={frameStyle(UI_ASSETS.progressFrame)}>
        <div className="asset-progress-fill" style={{ ...frameStyle(fillAsset), width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PanelTabs({ activePanel, setPanel, variant = 'default' }) {
  return (
    <div className={`panel-tabs ${variant === 'fancy' ? 'panel-tabs-fancy' : ''}`.trim()}>
      {PANEL_TABS.map((tab) => {
        const isActive = activePanel === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab ${isActive ? 'active' : ''} ${variant === 'fancy' ? 'panel-tab-fancy' : ''}`.trim()}
            onClick={() => setPanel(tab.id)}
            style={variant === 'fancy' ? undefined : frameStyle(isActive ? UI_ASSETS.tabActive : UI_ASSETS.tabIdle)}
          >
            <AssetIcon src={tab.icon} alt="" size={16} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RewardBadge({ type = 'gold', amount, label }) {
  return (
    <div className="reward-badge" style={frameStyle(UI_ASSETS.iconButton)}>
      <ResourceIcon type={type} size={18} />
      <strong>{amount}</strong>
      {label ? <span>{label}</span> : null}
    </div>
  );
}

function GoalIcon({ icon, size = 22 }) {
  const src = GOAL_ICON_SOURCES[icon] ?? ICONS.quest;
  return <AssetIcon src={src} alt="" size={size} />;
}


function frameStyle(url, size = '100% 100%') {
  if (!url) return {};
  return {
    backgroundImage: `url(${url})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: size
  };
}

function AssetIcon({ src, alt = '', className = '', size = 20 }) {
  return <img src={src} alt={alt} className={`asset-icon ${className}`.trim()} style={{ width: size, height: size }} draggable={false} />;
}

function SceneCanvas({ selectedBuildingId, activePanel, selectedConstructionItem, onBuildingSelect, onConfirmConstruction, devMode, onDevPointer }) {
  const hostRef = useRef(null);
  const appRef = useRef(null);
  const worldRef = useRef(null);
  const roadRef = useRef(null);
  const spritesRef = useRef({ buildings: new Map(), vfx: new Map(), roads: {} });
  const cameraRef = useRef({ x: 0, y: 0, scale: 0.5 });
  const gestureRef = useRef({ pointers: new Map(), dragging: false, lastX: 0, lastY: 0, pinchStart: 0, pinchScale: 1 });
  const rafRef = useRef(0);
  const selectedRef = useRef(selectedBuildingId);
  const activePanelRef = useRef(activePanel);
  const selectedConstructionItemRef = useRef(selectedConstructionItem);
  const confirmConstructionRef = useRef(onConfirmConstruction);
  const devModeRef = useRef(Boolean(devMode));
  const devLatestInfoRef = useRef(null);
  const devInfoFrameRef = useRef(0);

  const levels = useSettlementStore((s) => s.levels);
  const resources = useSettlementStore((s) => s.resources);
  const stage = useMemo(() => getStage(resources, levels), [resources, levels]);
  const storeSelect = useSettlementStore((s) => s.selectBuilding);

  useEffect(() => {
    selectedRef.current = selectedBuildingId;
  }, [selectedBuildingId]);

  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);

  useEffect(() => {
    selectedConstructionItemRef.current = selectedConstructionItem;
  }, [selectedConstructionItem]);

  useEffect(() => {
    confirmConstructionRef.current = onConfirmConstruction;
  }, [onConfirmConstruction]);

  useEffect(() => {
    devModeRef.current = Boolean(devMode);
    const devLayer = spritesRef.current.devLayer;
    if (devLayer) devLayer.visible = Boolean(devMode);
    if (!devMode) onDevPointer?.(null);
  }, [devMode, onDevPointer]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return undefined;

    const app = new Application();
    appRef.current = app;

    async function init() {
      await app.init({
        background: '#07130c',
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
        powerPreference: 'high-performance'
      });
      if (cancelled) {
        destroyPixiAppSafely(app);
        return;
      }
      function syncRendererSize() {
        const width = Math.max(1, Math.round(host.clientWidth));
        const height = Math.max(1, Math.round(host.clientHeight));
        app.renderer.resize(width, height);
        app.canvas.style.width = `${width}px`;
        app.canvas.style.height = `${height}px`;
        return { width, height };
      }

      syncRendererSize();
      app.ticker.maxFPS = 40;
      app.ticker.minFPS = 20;
      host.appendChild(app.canvas);
      app.canvas.className = 'settlement-canvas';
      app.canvas.setAttribute('aria-label', 'Village Ascend playable map');

      const staticTextureUrls = [
        MAP_ASSETS.background,
        MAP_ASSETS.ground,
        ...Object.values(MAP_ASSETS.roads),
        VFX_ASSETS.marketSparkle,
        VFX_ASSETS.waterGlint,
        VFX_ASSETS.buildDust,
        VFX_ASSETS.questReady,
        VFX_ASSETS.goldPop,
        VFX_ASSETS.foodPop,
      ];
      const trimmedTextureUrls = [
        ...BUILDINGS.map((building) => buildingAsset(building.id, levels[building.id] ?? 1)),
        ...CONSTRUCTION_PANEL_DATA.items.map((item) => constructionItemAsset(item)),
        ...PROPS.map((prop) => prop.image),
        VFX_ASSETS.selectionRing,
        VFX_ASSETS.levelupRays,
        VFX_ASSETS.buildingUpgradeGlow,
      ];
      const animatedTextureUrls = [
        ...VILLAGERS.map((villager) => villager.image),
        ...WORKERS.map((worker) => worker.image),
        VFX_ASSETS.chimneySmoke
      ];

      await Promise.all([
        ...staticTextureUrls.map((url) => loadTexture(url)),
        ...trimmedTextureUrls.map((url) => loadTexture(url, { trim: true })),
        ...animatedTextureUrls.map((url) => loadTexture(url))
      ]);

      if (cancelled) return;

      const world = new Container();
      world.sortableChildren = true;
      worldRef.current = world;
      app.stage.addChild(world);

      const bg = makeSafeSprite(await loadTexture(MAP_ASSETS.background));
      bg.width = WORLD.w;
      bg.height = WORLD.h;
      bg.zIndex = 0;
      world.addChild(bg);

      const groundLayer = new Container();
      groundLayer.x = GROUND.x;
      groundLayer.y = GROUND.y;
      groundLayer.zIndex = 10;
      groundLayer.sortableChildren = true;
      world.addChild(groundLayer);

      const ground = makeSafeSprite(await loadTexture(MAP_ASSETS.ground));
      if (cancelled) return;
      ground.width = GROUND.w;
      ground.height = GROUND.h;
      ground.zIndex = 0;
      groundLayer.addChild(ground);

      const roadContainer = new Container();
      roadContainer.zIndex = 3;
      groundLayer.addChild(roadContainer);
      roadRef.current = roadContainer;

      for (const [key, url] of Object.entries(MAP_ASSETS.roads)) {
        const road = makeSafeSprite(await loadTexture(url));
        if (cancelled) return;
        road.width = GROUND.w;
        road.height = GROUND.h;
        road.alpha = key === stage.road ? 1 : 0;
        road.zIndex = 1;
        roadContainer.addChild(road);
        spritesRef.current.roads[key] = road;
      }


      const propLayer = new Container();
      propLayer.zIndex = 20;
      propLayer.sortableChildren = true;
      groundLayer.addChild(propLayer);

      const buildingLayer = new Container();
      buildingLayer.zIndex = 40;
      buildingLayer.sortableChildren = true;
      groundLayer.addChild(buildingLayer);

      const villagerLayer = new Container();
      villagerLayer.zIndex = 60;
      villagerLayer.sortableChildren = true;
      groundLayer.addChild(villagerLayer);

      const vfxLayer = new Container();
      vfxLayer.zIndex = 80;
      vfxLayer.sortableChildren = true;
      groundLayer.addChild(vfxLayer);

      const devLayer = new Container();
      devLayer.zIndex = 140;
      devLayer.eventMode = 'none';
      devLayer.visible = devModeRef.current;
      const devGrid = new Graphics();
      for (let x = 0; x <= GROUND.w; x += 100) {
        const major = x % 500 === 0;
        devGrid.moveTo(x, 0).lineTo(x, GROUND.h).stroke({ color: major ? 0xffdf7a : 0xffdf7a, alpha: major ? 0.26 : 0.1, width: major ? 2 : 1 });
      }
      for (let y = 0; y <= GROUND.h; y += 100) {
        const major = y % 500 === 0;
        devGrid.moveTo(0, y).lineTo(GROUND.w, y).stroke({ color: major ? 0xffdf7a : 0xffdf7a, alpha: major ? 0.26 : 0.1, width: major ? 2 : 1 });
      }
      devLayer.addChild(devGrid);
      for (let x = 0; x <= GROUND.w; x += 500) {
        const label = new Text({
          text: `x ${x}`,
          style: { fontFamily: 'monospace', fontSize: 22, fontWeight: '700', fill: '#fff2ad', stroke: { color: '#000000', width: 4 } }
        });
        label.x = x + 8;
        label.y = 8;
        devLayer.addChild(label);
      }
      for (let y = 0; y <= GROUND.h; y += 500) {
        const label = new Text({
          text: `y ${y}`,
          style: { fontFamily: 'monospace', fontSize: 22, fontWeight: '700', fill: '#fff2ad', stroke: { color: '#000000', width: 4 } }
        });
        label.x = 8;
        label.y = y + 8;
        devLayer.addChild(label);
      }
      const anchorGraphics = new Graphics();
      for (const building of BUILDINGS) {
        anchorGraphics.circle(building.x, building.y, 9).fill({ color: 0xff5544, alpha: 0.9 });
        anchorGraphics.moveTo(building.x - 18, building.y).lineTo(building.x + 18, building.y).stroke({ color: 0xffffff, alpha: 0.95, width: 3 });
        anchorGraphics.moveTo(building.x, building.y - 18).lineTo(building.x, building.y + 18).stroke({ color: 0xffffff, alpha: 0.95, width: 3 });
        const label = new Text({
          text: `${building.short} ${Math.round(building.x)},${Math.round(building.y)}`,
          style: { fontFamily: 'monospace', fontSize: 20, fontWeight: '800', fill: '#ffffff', stroke: { color: '#000000', width: 5 } }
        });
        label.x = building.x + 22;
        label.y = building.y - 30;
        devLayer.addChild(label);
      }
      devLayer.addChild(anchorGraphics);
      groundLayer.addChild(devLayer);
      spritesRef.current.devLayer = devLayer;

      for (const prop of PROPS) {
        const texture = await loadTexture(prop.image, { trim: true });
        if (cancelled) return;
        if (!texture) continue;
        const sprite = anchorBottom(makeSafeSprite(texture));
        sprite.x = prop.x;
        sprite.y = prop.y;
        sprite.scale.set(prop.scale);
        sprite.zIndex = prop.y;
        propLayer.addChild(sprite);
      }

      const ringTexture = await loadTexture(VFX_ASSETS.selectionRing, { trim: true });
      if (cancelled) return;
      const upgradeGlowTexture = await loadTexture(VFX_ASSETS.buildingUpgradeGlow, { trim: true });
      if (cancelled) return;
      const levelupRaysTexture = await loadTexture(VFX_ASSETS.levelupRays, { trim: true });
      if (cancelled) return;

      for (const building of BUILDINGS) {
        const texture = await loadTexture(buildingAsset(building.id, levels[building.id] ?? 1), { trim: true });
        if (cancelled) return;
        if (!texture) continue;
        const visual = BUILDING_VISUALS[building.id] ?? {};

        const wrapper = new Container();
        wrapper.x = building.x;
        wrapper.y = building.y;
        wrapper.zIndex = building.y;
        wrapper.eventMode = 'static';
        wrapper.cursor = 'pointer';
        wrapper.hitArea = new Rectangle(-210, -300, 420, 360);
        wrapper.on('pointertap', () => {
          storeSelect(building.id);
          onBuildingSelect?.(building.id);
        });

        const sprite = anchorBottom(makeSafeSprite(texture));
        sprite.name = 'building-sprite';
        sprite.scale.set(building.scale);
        wrapper.addChild(sprite);

        const ring = anchorBottom(makeSafeSprite(ringTexture));
        ring.name = 'selection-ring';
        ring.y = visual.ringY ?? 4;
        ring.scale.set(visual.ringScale ?? Math.max(0.18, building.scale * 0.55));
        ring.alpha = building.id === selectedRef.current ? 0.88 : 0;
        ring.zIndex = -1;
        wrapper.addChildAt(ring, 0);

        const upgradeGlow = anchorBottom(makeSafeSprite(upgradeGlowTexture));
        upgradeGlow.name = 'upgrade-glow';
        upgradeGlow.y = visual.ringY ?? 4;
        upgradeGlow.scale.set((visual.ringScale ?? Math.max(0.18, building.scale * 0.55)) * 1.16);
        upgradeGlow.alpha = building.id === selectedRef.current ? 0.32 : 0;
        upgradeGlow.blendMode = 'add';
        wrapper.addChildAt(upgradeGlow, 1);

        const levelupRays = anchorBottom(makeSafeSprite(levelupRaysTexture));
        levelupRays.name = 'levelup-rays';
        levelupRays.y = -18;
        levelupRays.scale.set((visual.ringScale ?? Math.max(0.18, building.scale * 0.55)) * 1.4);
        levelupRays.alpha = building.id === selectedRef.current ? 0.22 : 0;
        levelupRays.blendMode = 'add';
        wrapper.addChild(levelupRays);

        const smokeAnchor = new Container();
        smokeAnchor.name = 'smoke-anchor';
        smokeAnchor.x = visual.smoke?.x ?? 42;
        smokeAnchor.y = visual.smoke?.y ?? -150;
        wrapper.addChild(smokeAnchor);

        const levelBadge = createLevelBadge(levels[building.id] ?? 1, 0, -sprite.height * building.scale - 18);
        levelBadge.name = 'level-badge';
        wrapper.addChild(levelBadge);
        const nameBadge = createTextLabel(building.short, 0, 14, 'small');
        nameBadge.name = 'name-badge';
        wrapper.addChild(nameBadge);

        buildingLayer.addChild(wrapper);
        spritesRef.current.buildings.set(building.id, { wrapper, sprite, ring, upgradeGlow, levelupRays, levelBadge, nameBadge, smokeAnchor });
      }

      const placementSlot = CONSTRUCTION_PANEL_DATA.placementSlots[0];
      const initialConstructionItem = selectedConstructionItemRef.current ?? CONSTRUCTION_PANEL_DATA.items[0];
      if (placementSlot && initialConstructionItem) {
        const ghostContainer = new Container();
        ghostContainer.name = 'construction-placement-ghost';
        ghostContainer.x = placementSlot.x;
        ghostContainer.y = placementSlot.y;
        ghostContainer.zIndex = placementSlot.y + 4;
        ghostContainer.eventMode = 'static';
        ghostContainer.cursor = 'pointer';
        ghostContainer.hitArea = new Rectangle(-190, -270, 380, 320);
        ghostContainer.visible = activePanelRef.current === 'construction';
        ghostContainer.on('pointertap', () => {
          confirmConstructionRef.current?.();
        });

        const pad = new Graphics();
        pad.name = 'construction-pad';
        pad.ellipse(0, 4, 150, 60)
          .fill({ color: 0x66ff82, alpha: 0.18 })
          .stroke({ color: 0xcfff9d, width: 6, alpha: 0.62 });
        pad.zIndex = -3;
        ghostContainer.addChild(pad);

        const ghostRing = anchorBottom(makeSafeSprite(ringTexture));
        ghostRing.name = 'construction-ring';
        ghostRing.tint = 0xa5ff8d;
        ghostRing.alpha = 0.84;
        ghostRing.scale.set(0.25);
        ghostRing.zIndex = -2;
        ghostContainer.addChild(ghostRing);

        const ghostSprite = anchorBottom(makeSafeSprite(await loadTexture(constructionItemAsset(initialConstructionItem), { trim: true })));
        ghostSprite.name = 'construction-preview';
        ghostSprite.tint = 0xa8ff9a;
        ghostSprite.alpha = 0.56;
        ghostSprite.scale.set(placementSlot.scale);
        ghostSprite.blendMode = 'screen';
        ghostContainer.addChild(ghostSprite);

        const check = new Container();
        check.name = 'construction-confirm';
        check.x = 82;
        check.y = 8;
        check.eventMode = 'static';
        check.cursor = 'pointer';
        const checkBg = new Graphics();
        checkBg.circle(0, 0, 32)
          .fill({ color: 0x4c9d20, alpha: 0.96 })
          .stroke({ color: 0xf1e58d, width: 5, alpha: 0.9 });
        const checkMark = new Text({
          text: '✓',
          style: {
            fontFamily: 'Georgia, serif',
            fontSize: 44,
            fontWeight: '900',
            fill: '#f7ffd1',
            stroke: { color: '#193900', width: 5 }
          }
        });
        checkMark.anchor.set(0.5, 0.58);
        check.addChild(checkBg, checkMark);
        ghostContainer.addChild(check);

        const ghostLabel = createTextLabel(initialConstructionItem.name, 0, 34, 'small');
        ghostLabel.name = 'construction-label';
        ghostLabel.alpha = 0.92;
        ghostContainer.addChild(ghostLabel);

        buildingLayer.addChild(ghostContainer);
        spritesRef.current.constructionGhost = { container: ghostContainer, sprite: ghostSprite, ring: ghostRing, label: ghostLabel, slot: placementSlot };
      }

      for (const villager of VILLAGERS) {
        const texture = await loadTexture(villager.image);
        if (cancelled) return;
        if (!texture) continue;
        const frames = splitTexture(texture, { ...(villager.layout ?? { frames: 4, cols: 4, rows: 1 }), inset: villager.layout?.inset ?? DEFAULT_FRAME_INSET });
        const anim = new AnimatedSprite(frames);
        anim.anchor.set(0.5, 1);
        anim.scale.set(villager.scale);
        anim.animationSpeed = 0.075;
        anim.play();
        anim.x = villager.x;
        anim.y = villager.y;
        anim.zIndex = villager.y + 10;
        anim.eventMode = 'none';
        anim.roundPixels = false;
        anim._vaPath = villager.path;
        anim._vaSeed = Math.random() * 1000;
        villagerLayer.addChild(anim);
      }

      for (const worker of WORKERS) {
        const texture = await loadTexture(worker.image);
        if (cancelled) return;
        if (!texture) continue;
        const anim = new AnimatedSprite(splitTexture(texture, { frames: 4, cols: 4, rows: 1, inset: DEFAULT_FRAME_INSET }));
        anim.anchor.set(0.5, 1);
        anim.scale.set(worker.scale);
        anim.animationSpeed = 0.065;
        anim.play();
        anim.x = worker.x;
        anim.y = worker.y;
        anim.zIndex = worker.y + 12;
        anim.eventMode = 'none';
        villagerLayer.addChild(anim);
      }

      const smokeFrames = splitTexture(await loadTexture(VFX_ASSETS.chimneySmoke), { frames: 6, cols: 6, rows: 1, inset: 2 });
      if (cancelled) return;
      for (const id of ['hearth-hall', 'cottage-ring', 'craft-workshop', 'council-manor']) {
        const item = spritesRef.current.buildings.get(id);
        if (!item) continue;
        const smoke = new AnimatedSprite(smokeFrames);
        smoke.anchor.set(0.5, 1);
        smoke.scale.set(0.12);
        smoke.animationSpeed = 0.035;
        smoke.alpha = 0.42;
        smoke.play();
        item.smokeAnchor.addChild(smoke);
      }

      const dustFrames = splitTexture(await loadTexture(VFX_ASSETS.buildDust), { frames: 6, cols: 6, rows: 1, inset: 2 });
      if (cancelled) return;
      for (const point of [[948, 505], [2348, 967], [1410, 1085]]) {
        const dust = new AnimatedSprite(dustFrames);
        dust.anchor.set(0.5, 1);
        dust.x = point[0];
        dust.y = point[1] + 12;
        dust.scale.set(0.18);
        dust.animationSpeed = 0.026 + Math.random() * 0.012;
        dust.alpha = 0.28;
        dust.play();
        dust.zIndex = point[1] + 2;
        vfxLayer.addChild(dust);
      }

      const glintFrames = splitTexture(await loadTexture(VFX_ASSETS.waterGlint), { frames: 6, cols: 6, rows: 1, inset: 2 });
      if (cancelled) return;
      for (const point of [[1810, 1430], [1760, 1530], [1880, 1270]]) {
        const glint = new AnimatedSprite(glintFrames);
        glint.anchor.set(0.5);
        glint.x = point[0];
        glint.y = point[1];
        glint.scale.set(0.2);
        glint.animationSpeed = 0.025 + Math.random() * 0.02;
        glint.alpha = 0.62;
        glint.play();
        glint.zIndex = point[1] + 1;
        vfxLayer.addChild(glint);
      }

      const marketSparkle = new AnimatedSprite(splitTexture(await loadTexture(VFX_ASSETS.marketSparkle), { frames: 6, cols: 6, rows: 1, inset: 2 }));
      if (cancelled) return;
      marketSparkle.anchor.set(0.5);
      marketSparkle.scale.set(0.22);
      marketSparkle.animationSpeed = 0.045;
      marketSparkle.alpha = 0.75;
      marketSparkle.play();
      const marketBuildingItem = spritesRef.current.buildings.get('market-green');
      if (marketBuildingItem) {
        marketSparkle.x = 18;
        marketSparkle.y = -82;
        marketBuildingItem.wrapper.addChild(marketSparkle);
      } else {
        marketSparkle.x = 1290;
        marketSparkle.y = 1185;
        vfxLayer.addChild(marketSparkle);
      }

      const camera = getInitialCamera(host.clientWidth, host.clientHeight);
      cameraRef.current = camera;
      world.position.set(camera.x, camera.y);
      world.scale.set(camera.scale);

      function applyCamera() {
        rafRef.current = 0;
        const c = cameraRef.current;
        clampCamera(c, host.clientWidth, host.clientHeight);
        world.position.set(c.x, c.y);
        world.scale.set(c.scale);
      }
      function scheduleCameraApply() {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(applyCamera);
      }

      const pointerTarget = app.canvas;
      pointerTarget.style.touchAction = 'none';

      function getCanvasPoint(e) {
        const rect = pointerTarget.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }

      function getMapPoint(canvasPoint) {
        const c = cameraRef.current;
        const worldX = (canvasPoint.x - c.x) / c.scale;
        const worldY = (canvasPoint.y - c.y) / c.scale;
        return {
          worldX,
          worldY,
          mapX: worldX - GROUND.x,
          mapY: worldY - GROUND.y,
          scale: c.scale
        };
      }

      function emitDevPointer(e, canvasPoint) {
        if (!devModeRef.current) return;
        const point = getMapPoint(canvasPoint);
        const mapX = Math.round(point.mapX);
        const mapY = Math.round(point.mapY);
        devLatestInfoRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          canvasX: Math.round(canvasPoint.x),
          canvasY: Math.round(canvasPoint.y),
          worldX: Math.round(point.worldX),
          worldY: Math.round(point.worldY),
          mapX,
          mapY,
          snap25X: Math.round(mapX / 25) * 25,
          snap25Y: Math.round(mapY / 25) * 25,
          inGround: mapX >= 0 && mapY >= 0 && mapX <= GROUND.w && mapY <= GROUND.h,
          scale: Number(point.scale.toFixed(3))
        };
        if (devInfoFrameRef.current) return;
        devInfoFrameRef.current = requestAnimationFrame(() => {
          devInfoFrameRef.current = 0;
          onDevPointer?.(devLatestInfoRef.current);
        });
      }

      function onPointerDown(e) {
        pointerTarget.setPointerCapture?.(e.pointerId);
        const p = getCanvasPoint(e);
        emitDevPointer(e, p);
        gestureRef.current.pointers.set(e.pointerId, p);
        gestureRef.current.dragging = true;
        gestureRef.current.lastX = p.x;
        gestureRef.current.lastY = p.y;
        if (gestureRef.current.pointers.size === 2) {
          const [a, b] = [...gestureRef.current.pointers.values()];
          gestureRef.current.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
          gestureRef.current.pinchScale = cameraRef.current.scale;
        }
      }

      function onPointerMove(e) {
        const p = getCanvasPoint(e);
        emitDevPointer(e, p);
        if (!gestureRef.current.pointers.has(e.pointerId)) return;
        gestureRef.current.pointers.set(e.pointerId, p);
        const c = cameraRef.current;
        if (gestureRef.current.pointers.size === 2) {
          const [a, b] = [...gestureRef.current.pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const start = gestureRef.current.pinchStart || dist;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const beforeWorldX = (midX - c.x) / c.scale;
          const beforeWorldY = (midY - c.y) / c.scale;
          c.scale = Math.max(0.32, Math.min(1.12, gestureRef.current.pinchScale * (dist / start)));
          c.x = midX - beforeWorldX * c.scale;
          c.y = midY - beforeWorldY * c.scale;
          scheduleCameraApply();
          return;
        }
        if (gestureRef.current.dragging) {
          const dx = p.x - gestureRef.current.lastX;
          const dy = p.y - gestureRef.current.lastY;
          gestureRef.current.lastX = p.x;
          gestureRef.current.lastY = p.y;
          c.x += dx;
          c.y += dy;
          scheduleCameraApply();
        }
      }

      function onPointerUp(e) {
        pointerTarget.releasePointerCapture?.(e.pointerId);
        gestureRef.current.pointers.delete(e.pointerId);
        gestureRef.current.dragging = gestureRef.current.pointers.size > 0;
        if (gestureRef.current.pointers.size === 1) {
          const [remaining] = gestureRef.current.pointers.values();
          gestureRef.current.lastX = remaining.x;
          gestureRef.current.lastY = remaining.y;
        }
      }

      function clearPointerSession() {
        gestureRef.current.pointers.clear();
        gestureRef.current.dragging = false;
        gestureRef.current.pinchStart = 0;
        gestureRef.current.pinchScale = cameraRef.current.scale;
        if (devModeRef.current) onDevPointer?.(null);
      }

      function onPointerLeave() {
        if (devModeRef.current) onDevPointer?.(null);
      }

      function onWheel(e) {
        e.preventDefault();
        const p = getCanvasPoint(e);
        const c = cameraRef.current;
        const beforeWorldX = (p.x - c.x) / c.scale;
        const beforeWorldY = (p.y - c.y) / c.scale;
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        c.scale = Math.max(0.32, Math.min(1.12, c.scale * factor));
        c.x = p.x - beforeWorldX * c.scale;
        c.y = p.y - beforeWorldY * c.scale;
        scheduleCameraApply();
      }

      function onResize() {
        const { width, height } = syncRendererSize();
        clampCamera(cameraRef.current, width, height);
        scheduleCameraApply();
      }

      pointerTarget.addEventListener('pointerdown', onPointerDown);
      pointerTarget.addEventListener('pointermove', onPointerMove);
      pointerTarget.addEventListener('pointerup', onPointerUp);
      pointerTarget.addEventListener('pointercancel', onPointerUp);
      pointerTarget.addEventListener('pointerleave', onPointerLeave);
      pointerTarget.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', onResize);
      window.visualViewport?.addEventListener('resize', onResize);
      window.addEventListener('blur', clearPointerSession);
      document.addEventListener('visibilitychange', clearPointerSession);
      const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
      resizeObserver?.observe(host);

      app.ticker.add(() => {
        const t = performance.now() / 1000;
        for (const child of villagerLayer.children) {
          if (!child._vaPath) continue;
          const path = child._vaPath;
          const speed = 0.07;
          const cursor = (t * speed + child._vaSeed) % path.length;
          const idx = Math.floor(cursor);
          const nextIdx = (idx + 1) % path.length;
          const local = cursor - idx;
          const a = path[idx];
          const b = path[nextIdx];
          child.x = a[0] + (b[0] - a[0]) * local;
          child.y = a[1] + (b[1] - a[1]) * local + Math.sin(t * 3 + child._vaSeed) * 2;
          child.zIndex = child.y + 10;
          child.scale.x = Math.abs(child.scale.x) * (b[0] < a[0] ? -1 : 1);
        }
        const pulse = 0.55 + Math.sin(t * 2.8) * 0.18;
        for (const [id, item] of spritesRef.current.buildings) {
          const selected = activePanelRef.current !== 'construction' && id === selectedRef.current;
          item.ring.alpha = selected ? 0.88 + Math.sin(t * 3) * 0.07 : 0;
          const baseScale = BUILDING_VISUALS[id]?.ringScale ?? 0.22;
          item.ring.scale.set(baseScale + pulse * 0.01, baseScale + pulse * 0.01);
          if (item.upgradeGlow) {
            item.upgradeGlow.alpha = selected ? 0.22 + Math.sin(t * 2.4) * 0.07 : 0;
            item.upgradeGlow.rotation += selected ? 0.002 : 0;
          }
          if (item.levelupRays) {
            item.levelupRays.alpha = selected ? 0.14 + Math.sin(t * 1.7) * 0.06 : 0;
            item.levelupRays.rotation -= selected ? 0.0015 : 0;
          }
        }
        const ghost = spritesRef.current.constructionGhost;
        if (ghost?.container) {
          const visible = activePanelRef.current === 'construction';
          ghost.container.visible = visible;
          if (visible) {
            ghost.container.alpha = 0.9 + Math.sin(t * 2.2) * 0.06;
            ghost.ring.alpha = 0.74 + Math.sin(t * 2.8) * 0.08;
            ghost.ring.rotation += 0.002;
          }
        }
      });

      app._vaCleanup = () => {
        pointerTarget.removeEventListener('pointerdown', onPointerDown);
        pointerTarget.removeEventListener('pointermove', onPointerMove);
        pointerTarget.removeEventListener('pointerup', onPointerUp);
        pointerTarget.removeEventListener('pointercancel', onPointerUp);
        pointerTarget.removeEventListener('pointerleave', onPointerLeave);
        pointerTarget.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', onResize);
        window.visualViewport?.removeEventListener('resize', onResize);
        window.removeEventListener('blur', clearPointerSession);
        document.removeEventListener('visibilitychange', clearPointerSession);
        resizeObserver?.disconnect();
      };
    }

    init().catch((error) => {
      if (!cancelled) console.error('Pixi scene failed to initialize', error);
    });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const app = appRef.current;
      destroyPixiAppSafely(app);
      appRef.current = null;
      spritesRef.current = { buildings: new Map(), vfx: new Map(), roads: {}, devLayer: null };
    };
  // Scene is intentionally initialized once. Live updates are handled by targeted effects below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadedBuildings = spritesRef.current.buildings;
    if (!loadedBuildings.size) return;
    Promise.all(BUILDINGS.map(async (building) => ({
      building,
      texture: await loadTexture(buildingAsset(building.id, levels[building.id] ?? 1), { trim: true })
    }))).then((results) => {
      for (const { building, texture } of results) {
        const item = loadedBuildings.get(building.id);
        if (!item || !texture) continue;
        item.sprite.texture = texture;
        item.sprite.scale.set(building.scale);
        item.levelBadge.destroy({ children: true });
        const freshBadge = createLevelBadge(levels[building.id] ?? 1, 0, -item.sprite.height * building.scale - 18);
        freshBadge.name = 'level-badge';
        item.wrapper.addChild(freshBadge);
        item.levelBadge = freshBadge;
      }
    });
  }, [levels]);

  useEffect(() => {
    for (const [key, sprite] of Object.entries(spritesRef.current.roads)) {
      const target = key === stage.road ? 1 : 0;
      const start = sprite.alpha;
      const started = performance.now();
      const tick = () => {
        const progress = Math.min(1, (performance.now() - started) / STAGE_ROAD_FADE_MS);
        sprite.alpha = start + (target - start) * progress;
        if (progress < 1) requestAnimationFrame(tick);
      };
      tick();
    }
  }, [stage.road]);

  useEffect(() => {
    for (const [id, item] of spritesRef.current.buildings) {
      item.ring.alpha = activePanel === 'construction' ? 0 : id === selectedBuildingId ? 0.88 : 0;
    }
    const ghost = spritesRef.current.constructionGhost;
    if (ghost?.container) ghost.container.visible = activePanel === 'construction';
  }, [activePanel, selectedBuildingId]);

  useEffect(() => {
    const ghost = spritesRef.current.constructionGhost;
    if (!ghost || !selectedConstructionItem) return;
    let cancelled = false;
    loadTexture(constructionItemAsset(selectedConstructionItem), { trim: true }).then((texture) => {
      if (cancelled || !texture) return;
      ghost.sprite.texture = texture;
      ghost.sprite.scale.set(ghost.slot.scale);
      if (ghost.label) ghost.label.destroy({ children: true });
      const freshLabel = createTextLabel(selectedConstructionItem.name, 0, 34, 'small');
      freshLabel.name = 'construction-label';
      freshLabel.alpha = 0.92;
      ghost.container.addChild(freshLabel);
      ghost.label = freshLabel;
    });
    return () => {
      cancelled = true;
    };
  }, [selectedConstructionItem]);

  return <div ref={hostRef} className="scene-host" />;
}



function ResourcePill({ label, value, icon, type, showPlus = false }) {
  return (
    <div className={`resource-pill resource-pill-${type ?? 'generic'}`} style={frameStyle(UI_ASSETS.resourcePill)}>
      {icon ? <AssetIcon src={icon} alt="" className="resource-pill-icon" size={19} /> : null}
      <span className="resource-label">{label}</span>
      <strong>{formatNumber(value)}</strong>
      {showPlus ? (
        <button className="resource-plus tooltip-control" type="button" aria-label={`Пополнить ${label}`} data-tooltip={`Пополнить ${label}`} style={frameStyle(UI_ASSETS.plus)}>
          +
        </button>
      ) : null}
    </div>
  );
}



function TopHud({ resources, population, stage }) {
  const morale = Math.round(resources.morale ?? 0);
  const resourceValues = {
    ...resources,
    population,
    prestige: stage.computedPrestige
  };

  return (
    <header className="top-hud top-hud-final" style={frameStyle(UI_ASSETS.topbar)}>
      <div className="profile-card profile-card-final" style={frameStyle(UI_ASSETS.profile)}>
        <div className="profile-avatar-wrap">
          <AssetIcon src={ICONS.shield} alt="" className="profile-avatar" size={34} />
        </div>
        <div className="profile-meta">
          <div className="profile-head">
            <span className="profile-name">{SETTLEMENT_PROFILE.mayorName}</span>
            <strong className="profile-level">Уровень {SETTLEMENT_PROFILE.mayorLevel}</strong>
          </div>
          <ProgressBar value={morale} max={100} fill="green" label={`Мораль ${morale}%`} className="profile-progress" />
        </div>
      </div>

      <div className="settlement-title settlement-title-final">
        <span>Поселение · {stage.title}</span>
        <strong>{SETTLEMENT_PROFILE.name}</strong>
      </div>

      <div className="top-resource-zone">
        <div className="top-resources top-resources-core">
          {RESOURCES.map((resource) => (
            <ResourcePill
              key={resource.id}
              label={resource.label}
              value={resourceValues[resource.id] ?? 0}
              icon={resource.icon}
              type={resource.id}
              showPlus={false}
            />
          ))}
        </div>
      </div>
    </header>
  );
}



function DockButton({
  active,
  icon,
  label,
  onClick,
  badge,
  className = '',
  variant = 'dock',
  iconSize = 24,
  hideLabel = false,
  pulse = false
}) {
  const frame = variant === 'bottom'
    ? active
      ? UI_ASSETS.bottomButtonActive
      : UI_ASSETS.bottomButton
    : active
      ? UI_ASSETS.dockButtonActive
      : UI_ASSETS.dockButton;

  return (
    <button
      className={`dock-button tooltip-control ${active ? 'active' : ''} ${hideLabel ? 'icon-only' : ''} ${pulse ? 'has-pulse' : ''} ${className}`.trim()}
      onClick={onClick}
      title={label}
      aria-label={label}
      data-tooltip={label}
      style={frameStyle(frame)}
      type="button"
    >
      {pulse ? <img className="dock-pulse" src={VFX_ASSETS.questReady} alt="" draggable={false} /> : null}
      {icon ? <AssetIcon src={icon} alt="" className="dock-icon" size={iconSize} /> : null}
      {!hideLabel ? <span>{label}</span> : null}
      {badge ? <b className="red-badge" style={frameStyle(UI_ASSETS.badge)}>{badge}</b> : null}
    </button>
  );
}



function LeftDock({ activePanel, setPanel }) {
  return (
    <aside className="left-dock" style={frameStyle(UI_ASSETS.leftDock)}>
      <DockButton active={activePanel === 'goals'} icon={ICONS.quest} label="Цели" badge="3" onClick={() => setPanel('goals')} iconSize={28} hideLabel pulse />
      <DockButton active={activePanel === 'inbox'} icon={ICONS.inbox} label="Вести" badge="2" onClick={() => setPanel('inbox')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'construction'} icon={ICONS.build} label="Строить" onClick={() => setPanel('construction')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'map'} icon={ICONS.map} label="Карта" onClick={() => setPanel('map')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'rank'} icon={ICONS.rank} label="Ранг" onClick={() => setPanel('rank')} iconSize={28} hideLabel />
    </aside>
  );
}



function BottomNav({ activePanel, setPanel, collect }) {
  const buildFamilyActive = activePanel === 'construction' || activePanel === 'build';
  const showGoalsSlot = activePanel === 'goals';
  return (
    <nav className="bottom-nav" style={frameStyle(UI_ASSETS.bottomFrame)}>
      <DockButton active={activePanel === 'store'} icon={ICONS.store} label="Магазин" onClick={() => setPanel('store')} className="bottom-dock-button" variant="bottom" iconSize={30} />
      <DockButton active={activePanel === 'inventory'} icon={ICONS.inventory} label="Инвентарь" onClick={() => setPanel('inventory')} className="bottom-dock-button" variant="bottom" iconSize={30} />
      <button
        className={`primary-build tooltip-control ${buildFamilyActive ? 'active' : ''}`}
        onClick={() => setPanel('construction')}
        style={frameStyle(buildFamilyActive ? UI_ASSETS.dockButtonActive : UI_ASSETS.dockButton)}
        title="Строить"
        aria-label="Строить"
        data-tooltip="Строить"
        type="button"
      >
        <AssetIcon src={ICONS.buildLarge} alt="" size={34} />
        <span>Строить</span>
      </button>
      <DockButton active={activePanel === 'research'} icon={ICONS.research} label="Исследования" onClick={() => setPanel('research')} className="bottom-dock-button" variant="bottom" iconSize={30} />
      <DockButton active={activePanel === 'world'} icon={ICONS.world} label="Карта мира" onClick={() => setPanel('world')} className="bottom-dock-button" variant="bottom" iconSize={30} />
      {showGoalsSlot ? (
        <DockButton active icon={ICONS.rank} label="Цели" onClick={() => setPanel('goals')} className="bottom-dock-button goals-dock-button" variant="bottom" iconSize={30} badge="3" />
      ) : (
        <button className="collect-button tooltip-control" onClick={collect} title="Собрать" aria-label="Собрать" data-tooltip="Собрать" type="button" style={frameStyle(UI_ASSETS.bottomButtonPressed)}>
          <AssetIcon src={ICONS.starterPack} alt="" size={24} />
          <span>Собрать</span>
          <b className="red-badge" style={frameStyle(UI_ASSETS.badge)}>4</b>
        </button>
      )}
    </nav>
  );
}

function OverviewPanel({ resources, levels, population, stage, setPanel }) {
  const passiveRows = useMemo(() => {
    const production = productionFrom(levels);
    return ['food', 'wood', 'stone', 'goods', 'culture', 'gold'].map((key) => ({
      id: key,
      label: resourceLabel(key),
      value: Math.max(0, Math.round((production[key] ?? 0) * 60))
    }));
  }, [levels]);
  const morale = Math.round(resources.morale ?? 0);
  const hallLevel = levels['hearth-hall'] ?? 1;
  const cottageProgress = Math.max(0, (levels['cottage-ring'] ?? 1) - 1);
  const goals = [
    {
      id: 'lumber',
      title: 'Постройте Лесопилку',
      icon: ICONS.wood,
      value: 0,
      max: 1,
      rewardType: 'gems',
      reward: 150
    },
    {
      id: 'house',
      title: 'Улучшите Дом до ур. 3',
      icon: ICONS.store,
      value: Math.min(3, cottageProgress),
      max: 3,
      rewardType: 'gems',
      reward: 250
    }
  ];

  return (
    <div className="overview-screen">
      <HudFrame className="overview-intro-card" frame={UI_ASSETS.panel}>
        <AssetIcon src={ICONS.shield} alt="" size={38} />
        <div>
          <strong>Наша деревня растёт и процветает!</strong>
          <span>Жители трудятся, ресурсы поступают, а будущее становится светлее с каждым днём.</span>
        </div>
      </HudFrame>

      <section className="overview-section">
        <h3>Пассивный доход</h3>
        <div className="overview-income-grid">
          {passiveRows.map((row) => (
            <div key={row.id} className="overview-income-row">
              <ResourceIcon type={row.id} size={18} />
              <span>{row.label}</span>
              <strong>+{row.value}/ч</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="overview-section overview-morale-section">
        <h3>Мораль жителей</h3>
        <div className="overview-morale-row">
          <ResourceIcon type="morale" size={36} />
          <strong>{morale}%</strong>
          <div>
            <span>Счастливые жители работают эффективнее и создают больше!</span>
            <ProgressBar value={morale} max={100} fill="green" label="" />
          </div>
          <button type="button" onClick={() => setPanel('council')}>Подробнее</button>
        </div>
      </section>

      <section className="overview-section overview-goals-section">
        <h3>Текущие цели</h3>
        <div className="overview-goal-list">
          {goals.map((goal) => (
            <div key={goal.id} className="overview-goal-row">
              <AssetIcon src={goal.icon} alt="" size={22} />
              <div>
                <span>{goal.title}</span>
                <ProgressBar value={goal.value} max={goal.max} fill="green" label={`${goal.value} / ${goal.max}`} />
              </div>
              <RewardBadge type={goal.rewardType} amount={goal.reward} />
            </div>
          ))}
        </div>
        <button className="overview-all-goals-button" type="button" onClick={() => setPanel('goals')}>
          Все цели
        </button>
      </section>

      <div className="overview-stage-note">
        <ResourceIcon type="prestige" size={16} />
        <span>{stage.title} · Очажный зал {hallLevel} ур.</span>
        <strong>{formatNumber(stage.computedPrestige)}</strong>
      </div>
    </div>
  );
}


function BuildingPanel({ building, level, resources, activeUpgrade, onUpgrade }) {
  const detail = building.detail ?? {};
  const cost = upgradeCost(building, level);
  const affordable = canPay(resources, cost);
  const progress = detail.levelProgress ?? { current: level, max: building.max };
  const prod = detail.productionPerMinute ?? building.produces ?? {};
  const nextLevel = Math.min(building.max, level + 1);
  const isMax = level >= building.max;
  const isUpgrading = activeUpgrade?.buildingId === building.id;
  const remainingMs = isUpgrading ? Math.max(0, activeUpgrade.completesAt - Date.now()) : (detail.upgradeDurationMs ?? 0);

  const productionRows = Object.entries(prod);
  const costRows = Object.entries(cost);

  return (
    <div className="building-screen">
      <p className="building-description">{detail.body ?? building.description}</p>

      <div className="building-level-row">
        <span>Уровень {level}</span>
        <ProgressBar
          value={progress.current}
          max={progress.max}
          fill="green"
          label={`${formatNumber(progress.current)} / ${formatNumber(progress.max)}`}
          className="building-level-progress"
        />
        <span>{isMax ? 'Максимум' : `Уровень ${nextLevel}`}</span>
      </div>

      <div className="building-data-grid">
        <section className="building-data-card" style={frameStyle(UI_ASSETS.panel)}>
          <div className="building-card-title">
            <span>Производство в минуту</span>
          </div>
          <div className="building-stat-list">
            {productionRows.length ? productionRows.map(([key, value]) => (
              <div key={key} className="building-stat-row">
                <ResourceIcon type={key} size={16} />
                <span>{resourceLabel(key)}</span>
                <strong>{formatSignedPerMinute(value)}</strong>
              </div>
            )) : (
              <div className="building-stat-row muted">
                <ResourceIcon type="prestige" size={16} />
                <span>Эффект</span>
                <strong>Пассивный</strong>
              </div>
            )}
          </div>
        </section>

        <section className="building-data-card" style={frameStyle(UI_ASSETS.panel)}>
          <div className="building-card-title">
            <span>Стоимость улучшения</span>
          </div>
          <div className="building-stat-list">
            {isMax ? (
              <div className="building-stat-row complete">
                <ResourceIcon type="prestige" size={16} />
                <span>Статус</span>
                <strong>Максимум</strong>
              </div>
            ) : costRows.map(([key, value]) => {
              const hasEnough = (resources[key] ?? 0) >= value;
              return (
                <div key={key} className={`building-stat-row ${hasEnough ? 'ok' : 'need'}`}>
                  <ResourceIcon type={key} size={16} />
                  <span>{resourceLabel(key)}</span>
                  <strong>{formatNumber(resources[key] ?? 0)} / {formatNumber(value)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="building-action-zone">
        <button
          className={`building-upgrade-button ${affordable && !isMax ? 'ready' : ''} ${isUpgrading ? 'in-progress' : ''}`}
          disabled={!affordable || isMax || isUpgrading}
          onClick={() => onUpgrade(building.id)}
          type="button"
        >
          <AssetIcon src={ICONS.build} alt="" size={18} />
          <span>{isMax ? 'Здание улучшено полностью' : affordable ? 'Улучшить здание' : 'Недостаточно ресурсов'}</span>
          {!isMax ? <b>↑</b> : null}
        </button>
        {!isMax ? (
          <div className="building-upgrade-timer">
            <span>◷</span>
            <strong>{formatDurationMs(remainingMs)}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BuildingBenefitFooter({ building }) {
  const benefits = building.detail?.benefits ?? {};
  const passiveGold = benefits.passiveGoldPerMinute ?? 0;
  const morale = benefits.morale ?? 0;

  return (
    <div className="panel-footer panel-footer-fancy building-footer-fancy">
      <div className="building-benefit-card" style={frameStyle(UI_ASSETS.panel)}>
        <span>Пассивный доход</span>
        <strong><ResourceIcon type="gold" size={18} /> +{formatNumber(passiveGold)}/мин</strong>
      </div>
      <div className="building-benefit-card" style={frameStyle(UI_ASSETS.panel)}>
        <span>Мораль</span>
        <strong><ResourceIcon type="morale" size={18} /> +{formatNumber(morale)}</strong>
      </div>
    </div>
  );
}



function GoalsPanel({ claimedGoalRewardIds = [], onClaimRewards }) {
  const claimed = new Set(claimedGoalRewardIds);
  const longTermGoals = GOAL_PANEL_DATA.longTermGoals;
  const dailyTasks = GOAL_PANEL_DATA.dailyTasks.map((task) => ({
    ...task,
    claimed: claimed.has(task.id),
    ready: task.progress.current >= task.progress.max,
    rewardLabel: `${formatNumber(task.progress.current)} / ${formatNumber(task.progress.max)}`
  }));
  const claimableDailyTasks = dailyTasks.filter((task) => task.ready && !task.claimed);
  const readyCount = claimableDailyTasks.length;

  return (
    <div className="goals-screen goals-screen-v2">
      <HudFrame className="goals-summary-card goals-summary-card-v2" frame={UI_ASSETS.panel}>
        <div className="goals-summary-icon"><AssetIcon src={ICONS.quest} alt="" size={30} /></div>
        <div className="goals-summary-copy">
          <span>Цели поселения</span>
          <strong>{readyCount} награды готовы к сбору</strong>
          <ProgressBar value={readyCount} max={Math.max(1, GOAL_PANEL_DATA.dailyTasks.length)} fill="green" label={`${readyCount} / ${GOAL_PANEL_DATA.dailyTasks.length}`} className="goals-summary-progress" />
        </div>
        <div className="goals-summary-reward">
          <ResourceIcon type="prestige" size={15} />
          <b>{readyCount}</b>
        </div>
      </HudFrame>

      <div className="goals-section-head">
        <span>Долгосрочные цели</span>
        <b>{longTermGoals.length} задачи</b>
      </div>
      <div className="goal-card-list goals-longterm-list">
        {longTermGoals.map((goal) => (
          <HudFrame key={goal.id} className="goal-card goal-card-v2" frame={UI_ASSETS.panel}>
            <div className="goal-card-icon">
              <GoalIcon icon={goal.icon} />
            </div>
            <div className="goal-card-copy">
              <strong>{goal.title}</strong>
              <span>{goal.description}</span>
              <ProgressBar
                value={goal.progress.current}
                max={goal.progress.max}
                fill="green"
                label={`${formatNumber(goal.progress.current)} / ${formatNumber(goal.progress.max)}`}
              />
            </div>
            <div className="goal-card-reward">
              <span>Награда</span>
              <RewardBadge type={goal.reward.type} amount={goal.reward.amount} />
            </div>
          </HudFrame>
        ))}
      </div>

      <div className="goals-section-head">
        <span>Ежедневные задачи</span>
        <b>Обновление через: {GOAL_PANEL_DATA.dailyRefreshLabel}</b>
      </div>
      <div className="daily-task-list daily-task-list-v2">
        {dailyTasks.map((task) => (
          <HudFrame key={task.id} className={`daily-task-card daily-task-card-v2 ${task.ready ? 'done' : ''} ${task.claimed ? 'claimed' : ''}`} frame={UI_ASSETS.panel}>
            <div className="daily-task-icon">
              <GoalIcon icon={task.icon} size={20} />
            </div>
            <div className="daily-task-copy">
              <strong>{task.title}</strong>
              <span>{task.description}</span>
              <ProgressBar value={task.progress.current} max={task.progress.max} fill="green" label={task.rewardLabel} />
            </div>
            <div className="daily-task-reward">
              <span>Награда</span>
              <RewardBadge type={task.reward.type} amount={task.reward.amount} />
            </div>
          </HudFrame>
        ))}
      </div>

      <button className={`goals-claim-button ${readyCount > 0 ? 'ready' : ''}`} type="button" onClick={onClaimRewards} disabled={!readyCount}>
        <AssetIcon src={ICONS.gift} alt="" size={18} />
        <span>Забрать награды</span>
        <b>{readyCount}</b>
      </button>
    </div>
  );
}

function InventoryScreen({ resources, inventoryCaps, selectedResourceId, onFocusResource, onAdjustCap, onBoostCap }) {
  const resourceRows = INVENTORY_PANEL_DATA.resourceRows;
  const selectedResource = resourceRows.find((row) => row.id === selectedResourceId) ?? resourceRows[0];
  const totalStored = resourceRows.reduce((sum, row) => sum + (resources[row.id] ?? 0), 0);
  const totalCap = resourceRows.reduce((sum, row) => sum + (inventoryCaps[row.id] ?? row.initialCap), 0);
  const selectedCap = inventoryCaps[selectedResource.id] ?? selectedResource.initialCap;
  const selectedAtMax = selectedCap >= selectedResource.maxCap;

  return (
    <div className="inventory-screen inventory-screen-v2">
      <div className="inventory-section-head inventory-section-head-v2">
        <span>Ресурсы</span>
        <b>{formatNumber(totalStored)} / {formatNumber(totalCap)}</b>
      </div>

      <div className="inventory-resource-list inventory-resource-list-v2">
        {resourceRows.map((row) => {
          const value = resources[row.id] ?? 0;
          const cap = inventoryCaps[row.id] ?? row.initialCap;
          const ratio = value / Math.max(1, cap);
          const isSelected = selectedResource.id === row.id;
          return (
            <HudFrame key={row.id} className={`inventory-resource-row inventory-resource-row-v2 ${isSelected ? 'selected' : ''} ${ratio >= 0.9 ? 'warning' : ''}`.trim()} frame={UI_ASSETS.panel}>
              <ResourceIcon type={row.id} size={22} />
              <div className="inventory-resource-copy inventory-resource-copy-v2">
                <strong>{row.label}</strong>
                <span>{formatNumber(value)} / {formatNumber(cap)}</span>
              </div>
              <div className="inventory-row-controls">
                <button type="button" className="inventory-row-control" onClick={() => onAdjustCap(row.id, -row.step)} disabled={cap <= row.minCap} aria-label={`Уменьшить вместимость: ${row.label}`}>−</button>
                <button type="button" className="inventory-row-control" onClick={() => onAdjustCap(row.id, row.step)} disabled={cap >= row.maxCap} aria-label={`Увеличить вместимость: ${row.label}`}>+</button>
                <button type="button" className="inventory-row-control next" onClick={() => onFocusResource(row.id)} aria-label={`Выбрать ресурс: ${row.label}`}>›</button>
              </div>
            </HudFrame>
          );
        })}
      </div>

      <div className="inventory-section-head inventory-section-head-v2">Изделия и особые предметы</div>
      <div className="inventory-item-grid inventory-item-grid-v2">
        {INVENTORY_PANEL_DATA.specialItems.map((item) => (
          <HudFrame key={item.id} className="inventory-item-card inventory-item-card-v2" frame={UI_ASSETS.iconButton}>
            <AssetIcon src={SPECIAL_ITEM_ICON_SOURCES[item.icon] ?? ICONS.gift} alt="" size={30} />
            <strong>{item.amount}</strong>
          </HudFrame>
        ))}
      </div>

      <button className="inventory-action-button inventory-action-button-v2" type="button" onClick={() => onBoostCap(selectedResource.id)} disabled={selectedAtMax}>
        <AssetIcon src={ICONS.inventory} alt="" size={18} />
        <span>Управление складом</span>
      </button>
    </div>
  );
}

function CouncilScreen({ setPanel, selectBuilding }) {
  const stage = COUNCIL_PANEL_DATA.stage;
  const followAdvice = (recommendation) => {
    if (recommendation.action.kind === 'building') {
      selectBuilding(recommendation.action.buildingId);
      return;
    }
    if (recommendation.action.kind === 'panel') {
      setPanel(recommendation.action.panel);
    }
  };

  return (
    <div className="council-screen council-screen-v2">
      <div className="council-section-head council-section-head-v2">Рекомендации совета</div>
      <div className="council-recommendation-list">
        {COUNCIL_PANEL_DATA.recommendations.map((recommendation) => (
          <HudFrame key={recommendation.id} className="council-recommendation-card" frame={UI_ASSETS.panel}>
            <div className={`council-advisor-portrait ${recommendation.portrait}`}>
              <AssetIcon src={COUNCIL_ICON_SOURCES[recommendation.portrait] ?? ICONS.research} alt="" size={42} />
            </div>
            <div className="council-recommendation-icon">
              <AssetIcon src={COUNCIL_ICON_SOURCES[recommendation.icon] ?? ICONS.achievement} alt="" size={30} />
            </div>
            <div className="council-recommendation-copy">
              <strong>{recommendation.title}</strong>
              <span>{recommendation.description}</span>
            </div>
            <button type="button" className="council-follow-button" onClick={() => followAdvice(recommendation)}>
              {recommendation.action.label}
            </button>
          </HudFrame>
        ))}
      </div>

      <div className="council-bottom-grid">
        <HudFrame className="council-stage-card council-stage-card-v2" frame={UI_ASSETS.panel}>
          <div className="council-section-head council-section-head-v2">Стадия поселения</div>
          <div className="council-stage-main">
            <AssetIcon src={ICONS.shield} alt="" size={42} />
            <div className="council-stage-copy">
              <strong>{stage.title}</strong>
              <span>{stage.phaseLabel}</span>
            </div>
          </div>
          <ProgressBar value={stage.progress.current} max={stage.progress.max} fill="green" label={`${formatNumber(stage.progress.current)} / ${formatNumber(stage.progress.max)}`} />
          <p>{stage.description}</p>
        </HudFrame>

        <HudFrame className="council-build-card" frame={UI_ASSETS.panel}>
          <div className="council-section-head council-section-head-v2">Что построить дальше?</div>
          <div className="council-build-list">
            {COUNCIL_PANEL_DATA.buildPriorities.map((priority) => (
              <button key={priority.id} type="button" className="council-build-row" onClick={() => priority.id === 'watchtower' ? setPanel('construction') : selectBuilding(priority.id)}>
                <AssetIcon src={COUNCIL_ICON_SOURCES[priority.icon] ?? ICONS.build} alt="" size={26} />
                <span><strong>{priority.title}</strong><b>{priority.priority}</b></span>
                <i>{priority.trend === 'up' ? '▲' : '−'}</i>
              </button>
            ))}
          </div>
        </HudFrame>
      </div>

      <button className="council-action-button council-action-button-v2" type="button" onClick={() => setPanel('research')}>
        <AssetIcon src={ICONS.research} alt="" size={18} />
        <span>Открыть исследования</span>
      </button>
    </div>
  );
}



function ConstructionScreen({ resources, categoryId, page, selectedId, onCategoryChange, onPageChange, onSelectItem }) {
  const pageSize = CONSTRUCTION_PANEL_DATA.pageSize;
  const categories = CONSTRUCTION_PANEL_DATA.categories;
  const activeCategory = categories.some((category) => category.id === categoryId) ? categoryId : categories[0]?.id;
  const categoryItems = CONSTRUCTION_PANEL_DATA.items.filter((item) => item.category === activeCategory);
  const pageCount = Math.max(1, Math.ceil(categoryItems.length / pageSize));
  const safePage = Math.max(0, Math.min(pageCount - 1, page ?? 0));
  const visibleItems = categoryItems.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const selectedItem = CONSTRUCTION_PANEL_DATA.items.find((item) => item.id === selectedId) ?? visibleItems[0];

  return (
    <div className="construction-screen construction-screen-v2">
      <div className="construction-category-row construction-category-row-v2" role="tablist" aria-label="Категории строительства">
        {categories.map((category) => {
          const active = category.id === activeCategory;
          return (
            <button
              key={category.id}
              className={`construction-category-chip construction-category-chip-v2 ${active ? 'active' : ''}`.trim()}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(category.id)}
            >
              <AssetIcon src={CONSTRUCTION_CATEGORY_ICONS[category.icon] ?? ICONS.build} alt="" size={30} />
              <span>{category.label}</span>
            </button>
          );
        })}
      </div>

      <div className="construction-card-grid construction-card-grid-v2">
        {visibleItems.map((item) => {
          const affordable = canPay(resources, item.cost);
          const selected = item.id === selectedItem?.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`construction-card construction-card-v2 ${affordable ? 'available' : 'locked'} ${selected ? 'selected' : ''}`.trim()}
              style={frameStyle(UI_ASSETS.panel)}
              onClick={() => onSelectItem(item.id)}
              aria-pressed={selected}
            >
              <div className="construction-card-name">{item.name}</div>
              <div className="construction-card-art construction-card-art-v2">
                <img src={constructionItemAsset(item)} alt="" draggable={false} />
              </div>
              <div className="construction-cost-row construction-cost-row-v2">
                {Object.entries(item.cost).slice(0, 2).map(([key, value]) => (
                  <b key={key} className={(resources[key] ?? 0) >= value ? 'ok' : 'need'}>
                    <ResourceIcon type={key} size={14} />
                    <span>{formatNumber(value)}</span>
                  </b>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="construction-pager" aria-label="Страницы каталога">
        <button type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 0} aria-label="Предыдущая страница">‹</button>
        <strong>{safePage + 1}/{pageCount}</strong>
        <button type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= pageCount - 1} aria-label="Следующая страница">›</button>
      </div>

      {selectedItem ? (
        <div className="construction-placement-hint construction-placement-hint-v2">
          <AssetIcon src={ICONS.map} alt="" size={16} />
          <span>{selectedItem.name}: выберите подсвеченную площадку на карте и подтвердите зелёной кнопкой.</span>
        </div>
      ) : null}
    </div>
  );
}


function ResearchTreeScreen({ resources, researchCategoryId, selectedResearchId, researchLevels, activeResearch, onCategoryChange, onSelectNode, onStudy }) {
  const categories = RESEARCH_PANEL_DATA.categories;
  const activeCategory = categories.some((category) => category.id === researchCategoryId) ? researchCategoryId : categories[0]?.id;
  const nodes = RESEARCH_PANEL_DATA.nodes.filter((node) => node.category === activeCategory);
  const selectedNode = nodes.find((node) => node.id === selectedResearchId)
    ?? nodes.find((node) => node.id === categories.find((category) => category.id === activeCategory)?.defaultNodeId)
    ?? nodes[0];
  const selectedStatus = getResearchNodeStatus(selectedNode, researchLevels, activeResearch);
  const selectedLevel = researchLevels?.[selectedNode?.id] ?? selectedNode?.level ?? 0;
  const selectedActive = activeResearch?.nodeId === selectedNode?.id;
  const remainingMs = selectedActive ? Math.max(0, activeResearch.completesAt - Date.now()) : selectedNode?.durationMs ?? 0;
  const selectedProgress = selectedActive
    ? Math.max(0, Math.min(100, ((activeResearch.durationMs - remainingMs) / Math.max(1, activeResearch.durationMs)) * 100))
    : selectedNode?.progress
      ? Math.max(0, Math.min(100, (selectedNode.progress.current / Math.max(1, selectedNode.progress.max)) * 100))
      : selectedStatus === 'complete' || selectedStatus === 'done'
        ? 100
        : 0;
  const selectedCost = selectedNode?.cost ?? {};
  const actionDisabled = !selectedNode || selectedStatus === 'locked' || selectedStatus === 'complete' || selectedStatus === 'done' || Boolean(activeResearch && !selectedActive) || !canPay(resources, selectedCost);
  const actionLabel = selectedStatus === 'locked'
    ? 'Недоступно'
    : selectedStatus === 'complete' || selectedStatus === 'done'
      ? 'Изучено'
      : selectedActive
        ? 'Изучается'
        : 'Изучить';

  return (
    <div className="research-screen research-screen-v2">
      <p className="research-intro">Исследуйте новые технологии, развивайте поселение и открывайте уникальные возможности.</p>

      <div className="research-category-row" role="tablist" aria-label="Категории исследований">
        {categories.map((category) => {
          const active = category.id === activeCategory;
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`research-category-tab ${active ? 'active' : ''}`.trim()}
              onClick={() => onCategoryChange(category.id)}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <div className="research-tree-board" aria-label="Древо технологий">
        {nodes.map((node) => {
          const state = getResearchNodeStatus(node, researchLevels, activeResearch);
          const level = researchLevels?.[node.id] ?? node.level ?? 0;
          const isSelected = node.id === selectedNode?.id;
          const progress = node.progress;
          const progressPct = progress ? Math.max(0, Math.min(100, (progress.current / Math.max(1, progress.max)) * 100)) : 0;
          const nodeIcon = RESEARCH_ICON_SOURCES[node.icon] ?? ICONS.research;
          return (
            <button
              key={node.id}
              type="button"
              className={`research-tech-node ${state} ${isSelected ? 'selected' : ''} ${node.connectors?.right ? 'connect-right' : ''} ${node.connectors?.down ? 'connect-down' : ''}`.trim()}
              style={{ gridColumn: node.position.col, gridRow: node.position.row }}
              onClick={() => onSelectNode(node.id)}
              aria-pressed={isSelected}
            >
              <strong>{node.title}</strong>
              <span>Уровень {level}/{node.maxLevel}</span>
              <AssetIcon src={nodeIcon} alt="" size={34} />
              {state === 'locked' ? (
                <div className="research-lock-badge" aria-hidden="true"><i /></div>
              ) : state === 'complete' || state === 'done' ? (
                <div className="research-check-badge" aria-hidden="true">✓</div>
              ) : progress ? (
                <div className="research-node-progress">
                  <div style={{ width: `${progressPct}%` }} />
                  <b>{progress.current}/{progress.max}</b>
                  <ResourceIcon type={progress.type} size={11} />
                </div>
              ) : null}
              {state === 'locked' ? <em>{node.requiredLabel ?? 'Требования не выполнены'}</em> : null}
            </button>
          );
        })}
      </div>

      {selectedNode ? (
        <HudFrame className="research-detail-card-v2" frame={UI_ASSETS.panel}>
          <div className="research-detail-copy">
            <strong>{selectedNode.title}</strong>
            <p>{selectedNode.description}</p>
          </div>
          <div className="research-detail-effects">
            <span>Уровень {selectedLevel} → {Math.min(selectedNode.maxLevel, selectedLevel + 1)}</span>
            {selectedNode.benefits.slice(0, 2).map((benefit) => <b key={benefit}>{benefit}</b>)}
          </div>
        </HudFrame>
      ) : null}

      <div className="research-action-row">
        <div className="research-cost-list" aria-label="Стоимость исследования">
          {Object.entries(selectedCost).map(([key, value]) => (
            <b key={key} className={(resources[key] ?? 0) >= value ? 'ok' : 'need'}>
              <ResourceIcon type={key} size={16} />
              <span>{formatNumber(value)}</span>
            </b>
          ))}
        </div>
        <button className="research-action-button research-action-button-v2" type="button" disabled={actionDisabled} onClick={onStudy}>
          <span>{actionLabel}</span>
          {selectedNode?.durationMs ? <b>⌛ {formatClockDuration(remainingMs)}</b> : null}
        </button>
      </div>
    </div>
  );
}


function WorldMapScreen({ filterId, selectedExpeditionId, activeExpedition, onFilterChange, onSelectExpedition, onStartExpedition }) {
  const normalizedFilterId = WORLD_MAP_PANEL_DATA.filters.some((filter) => filter.id === filterId) ? filterId : WORLD_MAP_PANEL_DATA.filters[0]?.id;
  const visibleExpeditions = normalizedFilterId === 'all'
    ? WORLD_MAP_PANEL_DATA.expeditions
    : WORLD_MAP_PANEL_DATA.expeditions.filter((expedition) => expedition.category === normalizedFilterId);
  const selectedExpedition = WORLD_MAP_PANEL_DATA.expeditions.find((expedition) => expedition.id === selectedExpeditionId)
    ?? visibleExpeditions[0]
    ?? WORLD_MAP_PANEL_DATA.expeditions[0];
  const activeId = activeExpedition?.expeditionId ?? null;

  const handleCardKeyDown = (event, expeditionId) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelectExpedition(expeditionId);
  };

  const startExpedition = (event, expeditionId) => {
    event.stopPropagation();
    onSelectExpedition(expeditionId);
    onStartExpedition();
  };

  return (
    <div className="world-screen world-screen-v2">
      <div className="world-map-scroll-v2">
        <HudFrame className="world-map-card world-map-card-v2" frame={UI_ASSETS.panel}>
          <div className="world-map-visual world-map-visual-v2" aria-label="Карта архипелага">
            <span className="world-compass" aria-hidden="true" />
            <span className="world-island world-island-a" aria-hidden="true" />
            <span className="world-island world-island-b" aria-hidden="true" />
            <span className="world-island world-island-c" aria-hidden="true" />
            <span className="world-island world-island-d" aria-hidden="true" />
            {WORLD_MAP_PANEL_DATA.mapMarkers.map((marker) => {
              const expedition = WORLD_MAP_PANEL_DATA.expeditions.find((item) => item.id === marker.expeditionId);
              const locked = expedition?.unlocked === false;
              const selected = marker.expeditionId === selectedExpedition?.id;
              const icon = locked ? WORLD_MAP_ICON_SOURCES.locked : WORLD_MAP_ICON_SOURCES[expedition?.icon] ?? ICONS.world;
              return (
                <button
                  key={marker.id}
                  type="button"
                  className={`world-map-marker ${marker.tone} ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`.trim()}
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                  aria-label={`${expedition?.title ?? 'Маршрут'}${locked ? ', закрыто' : ''}`}
                  onClick={() => onSelectExpedition(marker.expeditionId)}
                >
                  <AssetIcon src={icon} alt="" size={22} />
                </button>
              );
            })}
          </div>
        </HudFrame>

        <div className="world-filter-row-v2" role="tablist" aria-label="Фильтры экспедиций">
          {WORLD_MAP_PANEL_DATA.filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={filter.id === normalizedFilterId}
              className={`world-filter-button-v2 ${filter.id === normalizedFilterId ? 'active' : ''}`}
              onClick={() => onFilterChange(filter.id)}
              title={filter.label}
            >
              <AssetIcon src={WORLD_MAP_ICON_SOURCES[filter.icon] ?? ICONS.world} alt="" size={23} />
            </button>
          ))}
        </div>

        <div className="world-expedition-heading-v2">Доступные экспедиции</div>

        <div className="world-expedition-list-v2">
          {visibleExpeditions.map((expedition) => {
            const selected = expedition.id === selectedExpedition?.id;
            const locked = expedition.unlocked === false;
            const active = activeId === expedition.id;
            const busy = Boolean(activeId && !active);
            const remainingMs = active ? Math.max(0, activeExpedition.completesAt - Date.now()) : expedition.durationMs;
            const rewards = Object.entries(expedition.rewards ?? {});
            return (
              <HudFrame
                key={expedition.id}
                className={`world-expedition-card-v2 ${selected ? 'selected' : ''} ${locked ? 'locked' : 'available'} ${active ? 'active' : ''}`.trim()}
                frame={UI_ASSETS.panel}
                role="button"
                tabIndex={0}
                onClick={() => onSelectExpedition(expedition.id)}
                onKeyDown={(event) => handleCardKeyDown(event, expedition.id)}
              >
                <div className="world-expedition-thumb-v2">
                  <AssetIcon src={WORLD_MAP_ICON_SOURCES[expedition.icon] ?? ICONS.world} alt="" size={36} />
                </div>
                <div className="world-expedition-copy-v2">
                  <div className="world-expedition-title-row-v2">
                    <strong>{expedition.title}</strong>
                    <span className={`world-difficulty-badge-v2 ${expedition.difficultyTone}`}>{expedition.difficulty}</span>
                  </div>
                  <p>{expedition.description}</p>
                  {locked ? (
                    <em>{expedition.requiredLabel ?? 'Маршрут закрыт'}</em>
                  ) : (
                    <div className="world-expedition-rewards-v2" aria-label="Награды">
                      <span>Награды:</span>
                      {rewards.map(([key, value]) => (
                        <b key={key}>
                          <ResourceIcon type={key} size={16} />
                          <span>{formatNumber(value)}</span>
                        </b>
                      ))}
                    </div>
                  )}
                </div>
                {locked ? (
                  <div className="world-expedition-lock-v2" aria-hidden="true">🔒</div>
                ) : (
                  <button
                    type="button"
                    className="world-expedition-action-v2"
                    disabled={busy || active}
                    onClick={(event) => startExpedition(event, expedition.id)}
                  >
                    <span>{active ? 'В пути' : 'Отправить экспедицию'}</span>
                    <b>⌛ {formatClockDuration(remainingMs)}</b>
                  </button>
                )}
              </HudFrame>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function GenericPanel({ activePanel, stage, resources, population }) {
  if (activePanel === 'inbox') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.mail} alt="" size={16} /><span>Вести деревни</span></div>
        <div className="message-list">
          <HudFrame className="message-card" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.calendar} alt="" size={24} />
            <div className="card-copy"><strong>Сезонный рынок</strong><span>Караван прибудет после накопления товаров.</span></div>
          </HudFrame>
          <HudFrame className="message-card" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.gift} alt="" size={24} />
            <div className="card-copy"><strong>Подарок готов</strong><span>Можно забрать малый бонус ресурсов.</span></div>
          </HudFrame>
          <HudFrame className="message-card" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.event} alt="" size={24} />
            <div className="card-copy"><strong>Событие деревни</strong><span>Следите за моралью и культурой.</span></div>
          </HudFrame>
        </div>
      </div>
    );
  }

  if (activePanel === 'inventory') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.inventory} alt="" size={16} /><span>Инвентарь поселения</span></div>
        <div className="inventory-grid">
          <RewardBadge type="food" amount={formatNumber(resources.food)} label="еда" />
          <RewardBadge type="wood" amount={formatNumber(resources.wood)} label="дерево" />
          <RewardBadge type="stone" amount={formatNumber(resources.stone)} label="камень" />
          <RewardBadge type="goods" amount={formatNumber(resources.goods)} label="товары" />
          <RewardBadge type="culture" amount={formatNumber(resources.culture)} label="культура" />
          <RewardBadge type="gems" amount={formatNumber(resources.gems)} label="кристаллы" />
        </div>
      </div>
    );
  }

  if (activePanel === 'store') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.store} alt="" size={16} /><span>Магазин и предложения</span></div>
        <div className="offer-list">
          <HudFrame className="offer-card" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.starterPack} alt="" size={32} />
            <div className="card-copy"><strong>Starter pack</strong><span>Сундук, золото, товары</span></div>
            <button type="button" className="offer-action" style={frameStyle(UI_ASSETS.iconButton)}>+</button>
          </HudFrame>
          <HudFrame className="offer-card" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.gift} alt="" size={32} />
            <div className="card-copy"><strong>Daily gift</strong><span>Бесплатная награда</span></div>
            <button type="button" className="offer-action" style={frameStyle(UI_ASSETS.iconButton)}>+</button>
          </HudFrame>
        </div>
      </div>
    );
  }

  if (activePanel === 'research') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.research} alt="" size={16} /><span>Совет и исследования</span></div>
        <div className="research-stack">
          <HudFrame className="research-row" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.shield} alt="" size={24} />
            <div className="card-copy"><strong>Безопасность</strong><ProgressBar value={population} max={32} fill="green" label={`${population}/32`} /></div>
          </HudFrame>
          <HudFrame className="research-row" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.achievement} alt="" size={24} />
            <div className="card-copy"><strong>Престиж</strong><ProgressBar value={stage.computedPrestige} max={1700} fill="gold" label={formatNumber(stage.computedPrestige)} /></div>
          </HudFrame>
          <HudFrame className="research-row" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.morale} alt="" size={24} />
            <div className="card-copy"><strong>Мораль</strong><ProgressBar value={resources.morale} max={100} fill="green" label={`${Math.round(resources.morale)}%`} /></div>
          </HudFrame>
        </div>
      </div>
    );
  }

  if (activePanel === 'rank') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.rank} alt="" size={16} /><span>Ранг поселения</span></div>
        <HudFrame className="rank-card" frame={UI_ASSETS.panel}>
          <AssetIcon src={ICONS.shield} alt="" size={42} />
          <div className="card-copy">
            <strong>{stage.title}</strong>
            <span>Престиж: {formatNumber(stage.computedPrestige)}</span>
            <ProgressBar value={stage.computedPrestige} max={1700} fill="gold" label="Прогресс" />
          </div>
        </HudFrame>
      </div>
    );
  }

  if (activePanel === 'map') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.map} alt="" size={16} /><span>Карта</span></div>
        <p>Текущая стадия дорог: {stage.road}. Дороги, остров и здания рендерятся раздельными слоями.</p>
        <div className="map-tags">
          <span style={frameStyle(UI_ASSETS.tabActive)}>ground</span>
          <span style={frameStyle(UI_ASSETS.tabIdle)}>roads</span>
          <span style={frameStyle(UI_ASSETS.tabIdle)}>props</span>
          <span style={frameStyle(UI_ASSETS.tabIdle)}>vfx</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.achievement} alt="" size={16} /><span>Поселение</span></div>
      <p>Выберите здание или раздел меню.</p>
    </div>
  );
}



function RightPanelContent({ activePanel, selected, level, resources, levels, population, stage, activeUpgrade, upgradeBuilding, setPanel, selectBuilding, claimedGoalRewardIds, claimGoalRewards, inventoryCaps, inventorySelectedResourceId, focusInventoryResource, adjustInventoryCap, boostInventoryCap, constructionCategoryId, constructionPage, selectedConstructionId, setConstructionCategory, setConstructionPage, selectConstructionItem, researchCategoryId, selectedResearchId, researchLevels, activeResearch, setResearchCategory, selectResearchNode, studySelectedResearch, worldMapFilterId, selectedExpeditionId, activeExpedition, setWorldMapFilter, selectExpedition, startSelectedExpedition }) {
  const screen = getRightPanelScreen(activePanel);
  if (screen.kind === 'overview') {
    return <OverviewPanel resources={resources} levels={levels} population={population} stage={stage} setPanel={setPanel} />;
  }
  if (screen.kind === 'building') {
    return <BuildingPanel building={selected} level={level} resources={resources} activeUpgrade={activeUpgrade} onUpgrade={upgradeBuilding} />;
  }
  if (screen.kind === 'goals') {
    return <GoalsPanel claimedGoalRewardIds={claimedGoalRewardIds} onClaimRewards={claimGoalRewards} />;
  }
  if (screen.kind === 'inventory') {
    return <InventoryScreen resources={resources} inventoryCaps={inventoryCaps} selectedResourceId={inventorySelectedResourceId} onFocusResource={focusInventoryResource} onAdjustCap={adjustInventoryCap} onBoostCap={boostInventoryCap} />;
  }
  if (screen.kind === 'council') {
    return <CouncilScreen setPanel={setPanel} selectBuilding={selectBuilding} />;
  }
  if (screen.kind === 'research-tree') {
    return (
      <ResearchTreeScreen
        resources={resources}
        researchCategoryId={researchCategoryId}
        selectedResearchId={selectedResearchId}
        researchLevels={researchLevels}
        activeResearch={activeResearch}
        onCategoryChange={setResearchCategory}
        onSelectNode={selectResearchNode}
        onStudy={studySelectedResearch}
      />
    );
  }
  if (screen.kind === 'construction') {
    return (
      <ConstructionScreen
        resources={resources}
        categoryId={constructionCategoryId}
        page={constructionPage}
        selectedId={selectedConstructionId}
        onCategoryChange={setConstructionCategory}
        onPageChange={setConstructionPage}
        onSelectItem={selectConstructionItem}
      />
    );
  }
  if (screen.kind === 'world-map') {
    return (
      <WorldMapScreen
        filterId={worldMapFilterId}
        selectedExpeditionId={selectedExpeditionId}
        activeExpedition={activeExpedition}
        onFilterChange={setWorldMapFilter}
        onSelectExpedition={selectExpedition}
        onStartExpedition={startSelectedExpedition}
      />
    );
  }
  return <GenericPanel activePanel={activePanel} stage={stage} resources={resources} population={population} />;
}


function SidePanel() {
  const activePanel = useSettlementStore((s) => s.activePanel);
  const rightPanelOpen = useSettlementStore((s) => s.rightPanelOpen);
  const selectedBuildingId = useSettlementStore((s) => s.selectedBuildingId);
  const levels = useSettlementStore((s) => s.levels);
  const resources = useSettlementStore((s) => s.resources);
  const population = useSettlementStore((s) => s.population);
  const stage = useMemo(() => getStage(resources, levels), [resources, levels]);
  const upgradeBuilding = useSettlementStore((s) => s.upgradeBuilding);
  const activeUpgrade = useSettlementStore((s) => s.activeUpgrade);
  const claimedGoalRewardIds = useSettlementStore((s) => s.claimedGoalRewardIds);
  const claimGoalRewards = useSettlementStore((s) => s.claimGoalRewards);
  const inventoryCaps = useSettlementStore((s) => s.inventoryCaps);
  const inventorySelectedResourceId = useSettlementStore((s) => s.inventorySelectedResourceId);
  const focusInventoryResource = useSettlementStore((s) => s.focusInventoryResource);
  const adjustInventoryCap = useSettlementStore((s) => s.adjustInventoryCap);
  const boostInventoryCap = useSettlementStore((s) => s.boostInventoryCap);
  const constructionCategoryId = useSettlementStore((s) => s.constructionCategoryId);
  const constructionPage = useSettlementStore((s) => s.constructionPage);
  const selectedConstructionId = useSettlementStore((s) => s.selectedConstructionId);
  const setConstructionCategory = useSettlementStore((s) => s.setConstructionCategory);
  const setConstructionPage = useSettlementStore((s) => s.setConstructionPage);
  const selectConstructionItem = useSettlementStore((s) => s.selectConstructionItem);
  const researchCategoryId = useSettlementStore((s) => s.researchCategoryId);
  const selectedResearchId = useSettlementStore((s) => s.selectedResearchId);
  const researchLevels = useSettlementStore((s) => s.researchLevels);
  const activeResearch = useSettlementStore((s) => s.activeResearch);
  const setResearchCategory = useSettlementStore((s) => s.setResearchCategory);
  const selectResearchNode = useSettlementStore((s) => s.selectResearchNode);
  const studySelectedResearch = useSettlementStore((s) => s.studySelectedResearch);
  const worldMapFilterId = useSettlementStore((s) => s.worldMapFilterId);
  const selectedExpeditionId = useSettlementStore((s) => s.selectedExpeditionId);
  const activeExpedition = useSettlementStore((s) => s.activeExpedition);
  const setWorldMapFilter = useSettlementStore((s) => s.setWorldMapFilter);
  const selectExpedition = useSettlementStore((s) => s.selectExpedition);
  const startSelectedExpedition = useSettlementStore((s) => s.startSelectedExpedition);
  const setPanel = useSettlementStore((s) => s.setPanel);
  const closePanel = useSettlementStore((s) => s.closePanel);
  const selectBuilding = useSettlementStore((s) => s.selectBuilding);
  const selected = BUILDINGS.find((b) => b.id === selectedBuildingId) ?? BUILDINGS[0];
  const level = levels[selected.id] ?? 1;
  const prod = useMemo(() => productionFrom(levels), [levels]);
  const sidePanelFrame = UI_ASSETS.sidePanelFancy;
  const panelChrome = getRightPanelChrome({ activePanel, selected, level });
  const activeTabLabel = panelChrome.label;
  const headerEyebrow = panelChrome.eyebrow;
  const headerTitle = panelChrome.title;
  const headerSubline = panelChrome.subline;
  const headerIcon = panelChrome.headerIcon ?? null;
  const isOverview = panelChrome.kind === 'overview';
  const isBuilding = panelChrome.kind === 'building';
  const isGoals = panelChrome.kind === 'goals';
  const isInventory = panelChrome.kind === 'inventory';
  const isCouncil = panelChrome.kind === 'council';
  const isResearchTree = panelChrome.kind === 'research-tree';
  const isConstruction = panelChrome.kind === 'construction';
  const isWorldMap = panelChrome.kind === 'world-map';
  const showGenericFooter = !isOverview && !isGoals && !isInventory && !isCouncil && !isResearchTree && !isConstruction && !isWorldMap;
  const footerRows = [
    { id: 'food', label: 'Еда', value: prod.food.toFixed(1) },
    { id: 'wood', label: 'Дерево', value: prod.wood.toFixed(1) },
    { id: 'gold', label: 'Золото', value: prod.gold.toFixed(1) }
  ];
  const buildingHeaderImage = isBuilding ? buildingAsset(selected.id, level) : null;

  if (!rightPanelOpen) return null;

  return (
    <section className={`right-panel right-panel-fancy ${isOverview ? 'right-panel-overview' : ''} ${isBuilding ? 'right-panel-building' : ''} ${isInventory ? 'right-panel-inventory' : ''} ${isCouncil ? 'right-panel-council' : ''} ${isResearchTree ? 'right-panel-research-tree' : ''} ${isConstruction ? 'right-panel-construction' : ''} ${isWorldMap ? 'right-panel-world-map' : ''}`.trim()} style={frameStyle(sidePanelFrame)}>
      <div className="panel-header fancy-panel-header">
        {isBuilding ? (
          <div className="building-header-icon">
            <img src={buildingHeaderImage} alt="" draggable={false} />
          </div>
        ) : headerIcon ? (
          <div className="panel-header-icon">
            <AssetIcon src={headerIcon} alt="" size={34} />
          </div>
        ) : null}
        <div className="panel-header-copy">
          <span>{headerEyebrow}</span>
          <strong>{headerTitle}</strong>
        </div>
        {!isOverview ? (
          <button type="button" className="icon-circle panel-header-action" onClick={closePanel} style={frameStyle(UI_ASSETS.close)} aria-label="Закрыть панель">
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>

      {!isOverview && !isConstruction && !isResearchTree && !isWorldMap ? <div className="panel-strip">{headerSubline}</div> : null}

      {!isOverview && !isConstruction && !isResearchTree && !isWorldMap ? <PanelTabs activePanel={activePanel} setPanel={setPanel} variant="fancy" /> : null}

      <div className="panel-body panel-body-fancy">
        <RightPanelContent
          activePanel={activePanel}
          selected={selected}
          level={level}
          resources={resources}
          levels={levels}
          population={population}
          stage={stage}
          activeUpgrade={activeUpgrade}
          upgradeBuilding={upgradeBuilding}
          setPanel={setPanel}
          selectBuilding={selectBuilding}
          claimedGoalRewardIds={claimedGoalRewardIds}
          claimGoalRewards={claimGoalRewards}
          inventoryCaps={inventoryCaps}
          inventorySelectedResourceId={inventorySelectedResourceId}
          focusInventoryResource={focusInventoryResource}
          adjustInventoryCap={adjustInventoryCap}
          boostInventoryCap={boostInventoryCap}
          constructionCategoryId={constructionCategoryId}
          constructionPage={constructionPage}
          selectedConstructionId={selectedConstructionId}
          setConstructionCategory={setConstructionCategory}
          setConstructionPage={setConstructionPage}
          selectConstructionItem={selectConstructionItem}
          researchCategoryId={researchCategoryId}
          selectedResearchId={selectedResearchId}
          researchLevels={researchLevels}
          activeResearch={activeResearch}
          setResearchCategory={setResearchCategory}
          selectResearchNode={selectResearchNode}
          studySelectedResearch={studySelectedResearch}
          worldMapFilterId={worldMapFilterId}
          selectedExpeditionId={selectedExpeditionId}
          activeExpedition={activeExpedition}
          setWorldMapFilter={setWorldMapFilter}
          selectExpedition={selectExpedition}
          startSelectedExpedition={startSelectedExpedition}
        />
      </div>

      {!isOverview ? isBuilding ? (
        <BuildingBenefitFooter building={selected} />
      ) : !showGenericFooter ? null : <div className="panel-footer panel-footer-fancy">
        <div className="panel-footer-rows">
          {footerRows.map((row) => (
            <div key={row.id} className="fancy-footer-row">
              <ResourceIcon type={row.id} size={15} />
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
        <div className="panel-footer-bottom">
          <div className="fancy-footer-box footer-summary-box">
            <span>Пассивно / мин</span>
            <strong>Ресурсы поселения</strong>
          </div>
          <div className="fancy-footer-box footer-morale-box">
            <span>Мораль</span>
            <div className="footer-morale-value"><ResourceIcon type="morale" size={14} /><strong>{Math.round(resources.morale)}%</strong></div>
          </div>
          <div className="fancy-footer-box footer-panel-state-box">
            <span>Раздел</span>
            <strong>{activeTabLabel}</strong>
          </div>
        </div>
      </div> : null}
    </section>
  );
}


function NoticeStack() {
  const notices = useSettlementStore((s) => s.notices);
  const dismissNotice = useSettlementStore((s) => s.dismissNotice);
  const visibleNotices = useMemo(() => notices.slice(0, 3), [notices]);

  useEffect(() => {
    if (!visibleNotices.length) return undefined;
    const timers = visibleNotices.map((notice, index) => setTimeout(() => dismissNotice(notice.id), 3000 + index * 180));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [visibleNotices, dismissNotice]);

  const iconForNotice = (notice) => {
    if (notice.type === 'upgrade') return ICONS.achievement;
    if (notice.type === 'warn') return ICONS.morale;
    if (notice.type === 'collect') return ICONS.gold;
    return ICONS.gift;
  };
  const popForNotice = (notice) => notice.type === 'collect' ? VFX_ASSETS.goldPop : notice.type === 'warn' ? VFX_ASSETS.foodPop : VFX_ASSETS.levelupRays;

  return (
    <div className="notices notices-v2" aria-live="polite">
      {visibleNotices.map((notice, index) => (
        <button
          key={notice.id}
          type="button"
          className={`notice notice-v2 ${notice.type ?? 'info'}`}
          style={{ ...frameStyle(UI_ASSETS.panel), animationDelay: `${index * 45}ms` }}
          onClick={() => dismissNotice(notice.id)}
          title="Закрыть уведомление"
        >
          <img className="notice-pop" src={popForNotice(notice)} alt="" draggable={false} />
          <AssetIcon src={iconForNotice(notice)} alt="" size={18} />
          <span>{notice.text}</span>
          {(notice.count ?? 1) > 1 ? <b className="notice-count">×{notice.count}</b> : null}
        </button>
      ))}
    </div>
  );
}

function CollectionToast({ collect }) {
  return (
    <div className="collection-toast" style={frameStyle(UI_ASSETS.panel)} role="status" aria-live="polite">
      <AssetIcon src={ICONS.goods} alt="" size={24} />
      <div>
        <strong>Товары готовы к сбору!</strong>
        <span>Склад заполнен.</span>
      </div>
      <button type="button" onClick={collect}>Собрать</button>
    </div>
  );
}

function UpgradeToast({ activeUpgrade }) {
  const [dismissedKey, setDismissedKey] = useState(null);
  if (!activeUpgrade) return null;
  const building = BUILDINGS.find((item) => item.id === activeUpgrade.buildingId);
  if (!building) return null;
  const toastKey = `${activeUpgrade.buildingId}:${activeUpgrade.startedAt}`;
  if (dismissedKey === toastKey) return null;
  const remainingMs = Math.max(0, activeUpgrade.completesAt - Date.now());

  return (
    <div className="upgrade-toast" style={frameStyle(UI_ASSETS.panel)} role="status" aria-live="polite">
      <AssetIcon src={ICONS.shield} alt="" size={34} />
      <div>
        <strong>{building.name}: улучшение начато</strong>
        <span>Завершится через {formatDurationMs(remainingMs)}.</span>
      </div>
      <button type="button" onClick={() => setDismissedKey(toastKey)} aria-label="Закрыть уведомление">×</button>
    </div>
  );
}

function OrientationPrompt({ activePanel, rightPanelOpen }) {
  if (!rightPanelOpen || activePanel === 'overview') return null;
  return (
    <div className="orientation-prompt" role="status" aria-live="polite" style={frameStyle(UI_ASSETS.panel)}>
      <strong>Поверните экран</strong>
      <span>Для этого раздела лучше подходит горизонтальный режим.</span>
    </div>
  );
}


function RightPromoRail({ setPanel }) {
  return (
    <aside className="right-promo-rail">
      {EVENT_CARDS.map((card) => (
        <button
          key={card.id}
          type="button"
          className="promo-button tooltip-control"
          data-tooltip={`${card.label}: ${card.sub}`}
          aria-label={card.label}
          onClick={() => setPanel(card.id === 'mail' ? 'inbox' : 'store')}
          style={frameStyle(UI_ASSETS.iconButton)}
        >
          <AssetIcon src={card.icon} alt="" size={28} />
          <span>{card.sub}</span>
        </button>
      ))}
    </aside>
  );
}

function DevToolsOverlay({ enabled, setEnabled, info }) {
  const copyCoordinates = () => {
    if (!info) return;
    const payload = `x: ${info.mapX}, y: ${info.mapY}`;
    navigator.clipboard?.writeText(payload).catch(() => {});
  };
  const readoutStyle = info
    ? {
        left: `min(${info.clientX + 16}px, calc(100vw - 250px))`,
        top: `min(${info.clientY + 16}px, calc(100vh - 154px))`
      }
    : undefined;

  return (
    <>
      <button
        className={`dev-toggle ${enabled ? 'active' : ''}`}
        type="button"
        onClick={() => setEnabled((value) => !value)}
        title="Включить координатную сетку разработчика"
      >
        DEV {enabled ? 'ON' : 'OFF'}
      </button>
      {enabled ? (
        <div className="dev-help">
          Сетка: 100 px · жирные линии: 500 px · координаты ниже = значения для <code>gameData.js</code>
        </div>
      ) : null}
      {enabled && info ? (
        <div className={`dev-cursor-readout ${info.inGround ? '' : 'outside'}`} style={readoutStyle}>
          <div className="dev-readout-title">Map / gameData coords</div>
          <strong>x: {info.mapX}, y: {info.mapY}</strong>
          <span>snap25: {info.snap25X}, {info.snap25Y}</span>
          <span>world: {info.worldX}, {info.worldY}</span>
          <span>zoom: {info.scale}</span>
          <button type="button" onClick={copyCoordinates}>Copy x/y</button>
        </div>
      ) : null}
    </>
  );
}

export default function SettlementGame() {
  const [devMode, setDevMode] = useState(false);
  const [devInfo, setDevInfo] = useState(null);
  const resources = useSettlementStore((s) => s.resources);
  const levels = useSettlementStore((s) => s.levels);
  const population = useSettlementStore((s) => s.population);
  const stage = useMemo(() => getStage(resources, levels), [resources, levels]);
  const selectedBuildingId = useSettlementStore((s) => s.selectedBuildingId);
  const activePanel = useSettlementStore((s) => s.activePanel);
  const rightPanelOpen = useSettlementStore((s) => s.rightPanelOpen);
  const activeUpgrade = useSettlementStore((s) => s.activeUpgrade);
  const claimedGoalRewardIds = useSettlementStore((s) => s.claimedGoalRewardIds);
  const selectedConstructionId = useSettlementStore((s) => s.selectedConstructionId);
  const confirmConstructionPlacement = useSettlementStore((s) => s.confirmConstructionPlacement);
  const setPanel = useSettlementStore((s) => s.setPanel);
  const collect = useSettlementStore((s) => s.collect);
  const claimGoalRewards = useSettlementStore((s) => s.claimGoalRewards);
  const tick = useSettlementStore((s) => s.tick);
  const selectBuilding = useSettlementStore((s) => s.selectBuilding);
  const selectedConstructionItem = useMemo(
    () => CONSTRUCTION_PANEL_DATA.items.find((item) => item.id === selectedConstructionId) ?? CONSTRUCTION_PANEL_DATA.items[0],
    [selectedConstructionId]
  );
  const shellControls = useMemo(() => ({
    activeRun: false,
    hudState: {
      gold: Math.floor(resources.gold ?? 0),
      population,
      prestige: Math.floor(stage.computedPrestige ?? 0)
    }
  }), [population, resources.gold, stage.computedPrestige]);
  const showDevTools = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URL(window.location.href).searchParams.get('dev') === '1';
  }, []);
  useImmersiveGame('settlement', true, shellControls);

  useEffect(() => {
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  return (
    <div className="settlement-game-root" data-no-nav-swipe="true" data-active-panel={activePanel} data-selected-building={selectedBuildingId} data-selected-construction={selectedConstructionId ?? ''} data-right-panel-open={rightPanelOpen ? 'true' : 'false'}>
      <main className="settlement-game-shell">
        <SceneCanvas
          selectedBuildingId={selectedBuildingId}
          activePanel={activePanel}
          selectedConstructionItem={selectedConstructionItem}
          onBuildingSelect={selectBuilding}
          onConfirmConstruction={confirmConstructionPlacement}
          devMode={devMode}
          onDevPointer={setDevInfo}
        />
        <div className="hud-layer">
          <TopHud resources={resources} population={population} stage={stage} />
          <LeftDock activePanel={activePanel} setPanel={setPanel} />
          <SidePanel />
          <BottomNav activePanel={activePanel} setPanel={setPanel} collect={collect} />
          <CollectionToast collect={collect} />
          <UpgradeToast activeUpgrade={activeUpgrade} />
          <OrientationPrompt activePanel={activePanel} rightPanelOpen={rightPanelOpen} />
          <NoticeStack />
          {showDevTools ? <DevToolsOverlay enabled={devMode} setEnabled={setDevMode} info={devInfo} /> : null}
        </div>
      </main>
    </div>
  );
}
