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
import { useExitToHub, useImmersiveGame } from '../../app/gameHooks.js';
import { BUILDINGS, GOALS, PROPS, VILLAGERS, WORKERS } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { canPay, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
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
  { id: 'research', label: 'Совет', icon: ICONS.research }
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
  research: {
    id: 'research',
    label: 'Совет',
    icon: ICONS.research,
    kind: 'council',
    title: 'Совет и исследования',
    eyebrow: 'Совет',
    subline: 'Рекомендации, технологии и развитие'
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
    subline: 'Слои карты, экспедиции и состояние дорог'
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
    subline: 'Доступные регионы, риски и награды'
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

function ResourceIcon({ type, size = 16, className = '' }) {
  const src = RESOURCE_ICONS[type];
  return src ? <AssetIcon src={src} alt="" className={className} size={size} /> : null;
}

function HudFrame({ children, className = '', frame = UI_ASSETS.panel }) {
  return <div className={className} style={frameStyle(frame)}>{children}</div>;
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

function SceneCanvas({ selectedBuildingId, onBuildingSelect, devMode, onDevPointer }) {
  const hostRef = useRef(null);
  const appRef = useRef(null);
  const worldRef = useRef(null);
  const roadRef = useRef(null);
  const spritesRef = useRef({ buildings: new Map(), vfx: new Map(), roads: {} });
  const cameraRef = useRef({ x: 0, y: 0, scale: 0.5 });
  const gestureRef = useRef({ pointers: new Map(), dragging: false, lastX: 0, lastY: 0, pinchStart: 0, pinchScale: 1 });
  const rafRef = useRef(0);
  const selectedRef = useRef(selectedBuildingId);
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
      app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
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
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        app.renderer.resize(width, height);
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
          const selected = id === selectedRef.current;
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
      item.ring.alpha = id === selectedBuildingId ? 0.88 : 0;
    }
  }, [selectedBuildingId]);

  return <div ref={hostRef} className="scene-host" />;
}



function ResourcePill({ label, value, icon, type, showPlus = true }) {
  return (
    <div className="resource-pill" style={frameStyle(UI_ASSETS.resourcePill)}>
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
  const mayorLevel = Math.max(1, Math.floor(stage.computedPrestige / 120) + 1);
  const coreResources = [
    { label: 'Жители', value: population, icon: ICONS.population, type: 'population', showPlus: false },
    { label: 'Еда', value: resources.food, icon: ICONS.food, type: 'food' },
    { label: 'Дерево', value: resources.wood, icon: ICONS.wood, type: 'wood' },
    { label: 'Камень', value: resources.stone, icon: ICONS.stone, type: 'stone' },
    { label: 'Золото', value: resources.gold, icon: ICONS.gold, type: 'gold' }
  ];
  const secondaryResources = [
    { label: 'Товары', value: resources.goods, icon: ICONS.goods, type: 'goods' },
    { label: 'Культура', value: resources.culture, icon: ICONS.culture, type: 'culture' },
    { label: 'Кристаллы', value: resources.gems, icon: ICONS.gems, type: 'gems' },
    { label: 'Престиж', value: stage.computedPrestige, icon: ICONS.prestige, type: 'prestige' }
  ];

  return (
    <header className="top-hud top-hud-final" style={frameStyle(UI_ASSETS.topbar)}>
      <div className="profile-card profile-card-final" style={frameStyle(UI_ASSETS.profile)}>
        <div className="profile-avatar-wrap">
          <AssetIcon src={ICONS.shield} alt="" className="profile-avatar" size={34} />
        </div>
        <div className="profile-meta">
          <div className="profile-head">
            <span className="profile-name">Mayor</span>
            <strong className="profile-level">Lv {mayorLevel}</strong>
          </div>
          <ProgressBar value={morale} max={100} fill="green" label={`${morale}%`} className="profile-progress" />
        </div>
      </div>

      <div className="settlement-title settlement-title-final">
        <span>{stage.title}</span>
        <strong>Зелёная деревня</strong>
      </div>

      <div className="top-resource-zone">
        <div className="top-resources top-resources-core">
          {coreResources.map((resource) => (
            <ResourcePill key={resource.type} {...resource} />
          ))}
        </div>
        <div className="secondary-resource-cluster" style={frameStyle(UI_ASSETS.resourcePill)} aria-label="Дополнительные ресурсы">
          {secondaryResources.map((resource) => (
            <div key={resource.type} className="secondary-resource-item" title={`${resource.label}: ${formatNumber(resource.value)}`}>
              <AssetIcon src={resource.icon} alt="" size={14} />
              <span>{formatNumber(resource.value)}</span>
            </div>
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



function LeftDock({ activePanel, setPanel, onExit }) {
  return (
    <aside className="left-dock" style={frameStyle(UI_ASSETS.leftDock)}>
      <DockButton active={activePanel === 'goals'} icon={ICONS.quest} label="Цели" badge="1" onClick={() => setPanel('goals')} iconSize={28} hideLabel pulse />
      <DockButton active={activePanel === 'inbox'} icon={ICONS.inbox} label="Вести" badge="3" onClick={() => setPanel('inbox')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'construction'} icon={ICONS.build} label="Строить" onClick={() => setPanel('construction')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'map'} icon={ICONS.map} label="Карта" onClick={() => setPanel('map')} iconSize={28} hideLabel />
      <DockButton active={activePanel === 'rank'} icon={ICONS.rank} label="Ранг" onClick={() => setPanel('rank')} iconSize={28} hideLabel />
      <DockButton icon={ICONS.world} label="В сад" onClick={onExit} iconSize={26} hideLabel className="settlement-exit-button" />
    </aside>
  );
}



function BottomNav({ activePanel, setPanel, collect }) {
  return (
    <nav className="bottom-nav" style={frameStyle(UI_ASSETS.bottomFrame)}>
      <DockButton active={activePanel === 'store'} icon={ICONS.store} label="Магазин" onClick={() => setPanel('store')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel />
      <DockButton active={activePanel === 'inventory'} icon={ICONS.inventory} label="Инвентарь" onClick={() => setPanel('inventory')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel />
      <button
        className={`primary-build tooltip-control ${activePanel === 'construction' ? 'active' : ''}`}
        onClick={() => setPanel('construction')}
        style={frameStyle(activePanel === 'construction' ? UI_ASSETS.dockButtonActive : UI_ASSETS.dockButton)}
        title="Строить"
        aria-label="Строить"
        data-tooltip="Строить"
        type="button"
      >
        <AssetIcon src={ICONS.buildLarge} alt="" size={34} />
      </button>
      <DockButton active={activePanel === 'research'} icon={ICONS.research} label="Совет" onClick={() => setPanel('research')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel />
      <DockButton active={activePanel === 'world'} icon={ICONS.world} label="Мир" onClick={() => setPanel('world')} className="bottom-dock-button" variant="bottom" iconSize={30} hideLabel />
      <button className="collect-button tooltip-control" onClick={collect} title="Собрать" aria-label="Собрать" data-tooltip="Собрать" type="button" style={frameStyle(UI_ASSETS.bottomButtonPressed)}>
        <AssetIcon src={ICONS.gold} alt="" size={24} />
      </button>
    </nav>
  );
}


function BuildingPanel({ building, level, resources, onUpgrade }) {
  const cost = upgradeCost(building, level);
  const affordable = canPay(resources, cost);
  const prod = building.produces ?? {};
  const levelPct = Math.min(100, (level / building.max) * 100);
  const nextLevel = Math.min(building.max, level + 1);
  const isMax = level >= building.max;
  const buildingImage = buildingAsset(building.id, level);

  const productionRows = Object.entries(prod);
  const costRows = Object.entries(cost);

  return (
    <div className="building-screen">
      <HudFrame className="building-hero-card" frame={UI_ASSETS.panel}>
        <div className="building-hero-art">
          <img src={buildingImage} alt="" draggable={false} />
          <b>Lv {level}</b>
        </div>
        <div className="building-hero-copy">
          <div className="building-kicker">{CATEGORY_LABELS[building.category] ?? building.category}</div>
          <strong>{building.name}</strong>
          <p>{building.description}</p>
        </div>
      </HudFrame>

      <div className="building-level-row">
        <span>Уровень {level}</span>
        <ProgressBar value={levelPct} max={100} fill="gold" label={`${level}/${building.max}`} className="building-level-progress" />
        <span>{isMax ? 'Максимум' : `Ур. ${nextLevel}`}</span>
      </div>

      <div className="building-data-grid">
        <HudFrame className="building-data-card" frame={UI_ASSETS.panel}>
          <div className="building-card-title">
            <ResourceIcon type="goods" size={15} />
            <span>Производство / мин</span>
          </div>
          <div className="building-stat-list">
            {productionRows.length ? productionRows.map(([key, value]) => (
              <div key={key} className="building-stat-row">
                <ResourceIcon type={key} size={16} />
                <span>{resourceLabel(key)}</span>
                <strong>{value > 0 ? '+' : ''}{value.toFixed(2)}</strong>
              </div>
            )) : (
              <div className="building-stat-row muted">
                <ResourceIcon type="prestige" size={16} />
                <span>Эффект</span>
                <strong>Пассивный</strong>
              </div>
            )}
          </div>
        </HudFrame>

        <HudFrame className="building-data-card" frame={UI_ASSETS.panel}>
          <div className="building-card-title">
            <ResourceIcon type="stone" size={15} />
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
                  <strong>{formatNumber(value)}</strong>
                </div>
              );
            })}
          </div>
        </HudFrame>
      </div>

      <div className="building-action-zone">
        <button className={`building-upgrade-button ${affordable && !isMax ? 'ready' : ''}`} disabled={!affordable || isMax} onClick={() => onUpgrade(building.id)}>
          <AssetIcon src={ICONS.build} alt="" size={18} />
          <span>{isMax ? 'Здание улучшено полностью' : affordable ? 'Улучшить здание' : 'Недостаточно ресурсов'}</span>
          {!isMax ? <b>→ ур. {nextLevel}</b> : null}
        </button>
      </div>
    </div>
  );
}



function GoalsPanel({ state }) {
  const completedGoals = GOALS.filter((goal) => goal.check({ ...state, stage: state.stage }));
  const doneCount = completedGoals.length;
  const dailyTasks = [
    {
      id: 'daily-food',
      title: 'Стабильный запас еды',
      value: Math.min(100, (state.resources.food / 650) * 100),
      meta: `${formatNumber(state.resources.food)} / 650`,
      icon: 'food',
      done: state.resources.food >= 650
    },
    {
      id: 'daily-morale',
      title: 'Поддержать мораль',
      value: Math.min(100, (state.resources.morale / 82) * 100),
      meta: `${Math.round(state.resources.morale)}% / 82%`,
      icon: 'morale',
      done: state.resources.morale >= 82
    },
    {
      id: 'daily-pop',
      title: 'Развить население',
      value: Math.min(100, (state.population / 22) * 100),
      meta: `${state.population} / 22`,
      icon: 'population',
      done: state.population >= 22
    }
  ];
  const dailyDone = dailyTasks.filter((task) => task.done).length;

  return (
    <div className="goals-screen">
      <HudFrame className="goals-summary-card" frame={UI_ASSETS.panel}>
        <div className="goals-summary-icon"><AssetIcon src={ICONS.quest} alt="" size={30} /></div>
        <div className="goals-summary-copy">
          <span>Прогресс поселения</span>
          <strong>{doneCount}/{GOALS.length} крупных целей</strong>
          <ProgressBar value={doneCount} max={GOALS.length} fill="green" label="Цели" className="goals-summary-progress" />
        </div>
        <div className="goals-summary-reward">
          <ResourceIcon type="prestige" size={15} />
          <b>+{doneCount * 8}</b>
        </div>
      </HudFrame>

      <div className="goals-section-head">
        <span>Крупные цели</span>
        <b>{GOALS.length - doneCount} осталось</b>
      </div>
      <div className="goal-card-list">
        {GOALS.map((goal) => {
          const done = goal.check({ ...state, stage: state.stage });
          return (
            <HudFrame key={goal.id} className={`goal-card ${done ? 'done' : ''}`} frame={done ? UI_ASSETS.tabActive : UI_ASSETS.panel}>
              <AssetIcon src={done ? ICONS.achievement : ICONS.quest} alt="" size={20} />
              <div className="goal-card-copy">
                <strong>{goal.title}</strong>
                <span>{done ? 'Выполнено — награда учтена' : 'Активная долгосрочная задача'}</span>
              </div>
              <div className="goal-card-state">{done ? 'OK' : '...'}</div>
            </HudFrame>
          );
        })}
      </div>

      <div className="goals-section-head">
        <span>Ежедневные задачи</span>
        <b>{dailyDone}/{dailyTasks.length}</b>
      </div>
      <div className="daily-task-list">
        {dailyTasks.map((task) => (
          <HudFrame key={task.id} className={`daily-task-card ${task.done ? 'done' : ''}`} frame={UI_ASSETS.panel}>
            <ResourceIcon type={task.icon} size={18} />
            <div className="daily-task-copy">
              <strong>{task.title}</strong>
              <ProgressBar value={task.value} max={100} fill={task.done ? 'green' : 'gold'} label={task.meta} />
            </div>
          </HudFrame>
        ))}
      </div>

      <button className={`goals-claim-button ${dailyDone > 0 || doneCount > 0 ? 'ready' : ''}`} type="button">
        <AssetIcon src={ICONS.gift} alt="" size={18} />
        <span>Забрать награды</span>
        <b>{dailyDone + doneCount}</b>
      </button>
    </div>
  );
}

function InventoryScreen({ resources, population }) {
  const storageCaps = {
    food: 1200,
    wood: 1100,
    stone: 900,
    goods: 700,
    culture: 420,
    gold: 2600,
    gems: 120
  };
  const resourceOrder = ['food', 'wood', 'stone', 'goods', 'culture', 'gold', 'gems'];
  const specialItems = [
    { id: 'crate', title: 'Сундук поселения', meta: 'Открывается после события', icon: ICONS.starterPack, amount: 1 },
    { id: 'gift', title: 'Ежедневный подарок', meta: 'Готов к получению', icon: ICONS.gift, amount: 1 },
    { id: 'token', title: 'Жетоны ярмарки', meta: 'Для сезонного рынка', icon: ICONS.event, amount: 3 }
  ];

  return (
    <div className="inventory-screen">
      <HudFrame className="inventory-summary-card" frame={UI_ASSETS.panel}>
        <AssetIcon src={ICONS.inventory} alt="" size={28} />
        <div>
          <span>Склад поселения</span>
          <strong>{population} жителей · {resourceOrder.length} ресурсов</strong>
        </div>
        <button className="inventory-plus-button" style={frameStyle(UI_ASSETS.iconButton)} type="button">+</button>
      </HudFrame>

      <div className="inventory-resource-list">
        {resourceOrder.map((key) => {
          const value = resources[key] ?? 0;
          const cap = storageCaps[key];
          return (
            <HudFrame key={key} className="inventory-resource-row" frame={UI_ASSETS.panel}>
              <ResourceIcon type={key} size={18} />
              <div className="inventory-resource-copy">
                <div><strong>{resourceLabel(key)}</strong><span>{formatNumber(value)} / {formatNumber(cap)}</span></div>
                <ProgressBar value={value} max={cap} fill={value > cap * 0.8 ? 'gold' : 'green'} label="" />
              </div>
            </HudFrame>
          );
        })}
      </div>

      <div className="inventory-section-head">Особые предметы</div>
      <div className="inventory-item-grid">
        {specialItems.map((item) => (
          <HudFrame key={item.id} className="inventory-item-card" frame={UI_ASSETS.iconButton}>
            <AssetIcon src={item.icon} alt="" size={26} />
            <strong>×{item.amount}</strong>
            <span>{item.title}</span>
          </HudFrame>
        ))}
      </div>

      <button className="inventory-action-button" type="button">
        <AssetIcon src={ICONS.inventory} alt="" size={18} />
        <span>Управление складом</span>
      </button>
    </div>
  );
}

function CouncilScreen({ stage, resources, population, levels }) {
  const stageProgress = Math.min(100, (stage.computedPrestige / 1700) * 100);
  const totalLevels = Object.values(levels).reduce((sum, value) => sum + value, 0);
  const priorities = [
    {
      id: 'food',
      title: resources.food < 650 ? 'Усилить производство еды' : 'Еда стабильна',
      meta: resources.food < 650 ? 'Общий сад даст запас для роста' : 'Можно переключиться на престиж',
      icon: ICONS.food,
      tone: resources.food < 650 ? 'warn' : 'ok'
    },
    {
      id: 'morale',
      title: resources.morale < 82 ? 'Поднять мораль поселения' : 'Мораль под контролем',
      meta: 'Святилище и культура уменьшают риски',
      icon: ICONS.morale,
      tone: resources.morale < 82 ? 'warn' : 'ok'
    },
    {
      id: 'prestige',
      title: 'Развивать ключевые здания',
      meta: `${totalLevels} суммарных уровней зданий`,
      icon: ICONS.achievement,
      tone: 'neutral'
    }
  ];
  const advisorCards = [
    { id: 'builder', title: 'Мастер-строитель', text: 'Сначала улучшайте здания, которые открывают новые циклы производства.', icon: ICONS.build },
    { id: 'merchant', title: 'Казначей', text: 'Следите за золотом: рынок ускоряет все поздние улучшения.', icon: ICONS.gold },
    { id: 'elder', title: 'Старейшина', text: 'Культура и мораль важны перед переходом к новой стадии.', icon: ICONS.research }
  ];

  return (
    <div className="council-screen">
      <HudFrame className="council-stage-card" frame={UI_ASSETS.panel}>
        <AssetIcon src={ICONS.shield} alt="" size={32} />
        <div className="council-stage-copy">
          <span>Текущая стадия</span>
          <strong>{stage.title}</strong>
          <ProgressBar value={stageProgress} max={100} fill="gold" label={`${formatNumber(stage.computedPrestige)} престиж`} />
        </div>
      </HudFrame>

      <div className="council-section-head">Приоритеты совета</div>
      <div className="council-priority-list">
        {priorities.map((priority) => (
          <HudFrame key={priority.id} className={`council-priority-card ${priority.tone}`} frame={UI_ASSETS.panel}>
            <AssetIcon src={priority.icon} alt="" size={20} />
            <div>
              <strong>{priority.title}</strong>
              <span>{priority.meta}</span>
            </div>
          </HudFrame>
        ))}
      </div>

      <div className="council-section-head">Советники</div>
      <div className="advisor-list">
        {advisorCards.map((advisor) => (
          <HudFrame key={advisor.id} className="advisor-card" frame={UI_ASSETS.panel}>
            <AssetIcon src={advisor.icon} alt="" size={22} />
            <div>
              <strong>{advisor.title}</strong>
              <span>{advisor.text}</span>
            </div>
          </HudFrame>
        ))}
      </div>

      <button className="council-action-button" type="button">
        <AssetIcon src={ICONS.research} alt="" size={18} />
        <span>Открыть исследования</span>
      </button>
    </div>
  );
}



function ConstructionScreen({ resources, levels }) {
  const categories = [
    { id: 'production', label: 'Производство', icon: ICONS.goods },
    { id: 'housing', label: 'Жильё', icon: ICONS.population },
    { id: 'civic', label: 'Управление', icon: ICONS.shield },
    { id: 'commerce', label: 'Торговля', icon: ICONS.gold }
  ];
  const visibleBuildings = BUILDINGS.filter((building) => categories.some((cat) => cat.id === building.category)).slice(0, 8);
  const affordableCount = visibleBuildings.filter((building) => canPay(resources, upgradeCost(building, levels[building.id] ?? building.level))).length;

  return (
    <div className="construction-screen">
      <HudFrame className="construction-summary-card" frame={UI_ASSETS.panel}>
        <AssetIcon src={ICONS.buildLarge} alt="" size={34} />
        <div className="construction-summary-copy">
          <span>Каталог строительства</span>
          <strong>{affordableCount} доступно сейчас</strong>
          <p>Выберите тип здания, проверьте стоимость и перейдите к размещению на свободной платформе.</p>
        </div>
      </HudFrame>

      <div className="construction-category-row">
        {categories.map((category) => (
          <button key={category.id} className="construction-category-chip" type="button">
            <AssetIcon src={category.icon} alt="" size={15} />
            <span>{category.label}</span>
          </button>
        ))}
      </div>

      <div className="construction-card-grid">
        {visibleBuildings.map((building) => {
          const level = levels[building.id] ?? building.level;
          const cost = upgradeCost(building, level);
          const affordable = canPay(resources, cost);
          return (
            <HudFrame key={building.id} className={`construction-card ${affordable ? 'available' : 'locked'}`} frame={UI_ASSETS.panel}>
              <div className="construction-card-art">
                <img src={buildingAsset(building.id, level)} alt="" draggable={false} />
              </div>
              <div className="construction-card-copy">
                <strong>{building.short}</strong>
                <span>{CATEGORY_LABELS[building.category] ?? building.category} · ур. {level}</span>
                <div className="construction-cost-row">
                  {Object.entries(cost).slice(0, 2).map(([key, value]) => (
                    <b key={key} className={(resources[key] ?? 0) >= value ? 'ok' : 'need'}>
                      <ResourceIcon type={key} size={12} /> {formatNumber(value)}
                    </b>
                  ))}
                </div>
              </div>
            </HudFrame>
          );
        })}
      </div>

      <div className="construction-placement-hint">
        <AssetIcon src={ICONS.map} alt="" size={16} />
        <span>Placement mode: выберите карточку, затем свободную платформу на карте.</span>
      </div>
    </div>
  );
}


function ResearchTreeScreen({ resources, stage, levels }) {
  const totalLevels = Object.values(levels).reduce((sum, value) => sum + value, 0);
  const techNodes = [
    {
      id: 'logistics',
      title: 'Логистика',
      icon: ICONS.map,
      state: totalLevels >= 18 ? 'done' : 'active',
      progress: Math.min(100, (totalLevels / 18) * 100),
      meta: 'Ускоряет дороги и доставку'
    },
    {
      id: 'agriculture',
      title: 'Агрономия',
      icon: ICONS.food,
      state: resources.food >= 650 ? 'done' : 'active',
      progress: Math.min(100, (resources.food / 650) * 100),
      meta: 'Усиливает производство еды'
    },
    {
      id: 'masonry',
      title: 'Каменное дело',
      icon: ICONS.stone,
      state: resources.stone >= 520 ? 'active' : 'locked',
      progress: Math.min(100, (resources.stone / 520) * 100),
      meta: 'Открывает прочные улучшения'
    },
    {
      id: 'commerce',
      title: 'Торговые связи',
      icon: ICONS.gold,
      state: resources.gold >= 1800 ? 'active' : 'locked',
      progress: Math.min(100, (resources.gold / 1800) * 100),
      meta: 'Увеличивает доход рынка'
    },
    {
      id: 'civic',
      title: 'Городской устав',
      icon: ICONS.research,
      state: stage.computedPrestige >= 800 ? 'active' : 'locked',
      progress: Math.min(100, (stage.computedPrestige / 800) * 100),
      meta: 'Открывает решения совета'
    }
  ];
  const selected = techNodes.find((node) => node.state === 'active') ?? techNodes[0];

  return (
    <div className="research-screen">
      <HudFrame className="research-selected-card" frame={UI_ASSETS.panel}>
        <AssetIcon src={selected.icon} alt="" size={32} />
        <div className="research-selected-copy">
          <span>Выбрано исследование</span>
          <strong>{selected.title}</strong>
          <p>{selected.meta}</p>
          <ProgressBar value={selected.progress} max={100} fill={selected.state === 'done' ? 'green' : 'gold'} label={`${Math.round(selected.progress)}%`} />
        </div>
      </HudFrame>

      <div className="research-tree-grid">
        {techNodes.map((node, index) => (
          <HudFrame key={node.id} className={`research-node ${node.state}`} frame={UI_ASSETS.panel}>
            <div className="research-node-index">{index + 1}</div>
            <AssetIcon src={node.icon} alt="" size={22} />
            <div className="research-node-copy">
              <strong>{node.title}</strong>
              <span>{node.state === 'done' ? 'Изучено' : node.state === 'locked' ? 'Закрыто' : 'Можно изучать'}</span>
            </div>
          </HudFrame>
        ))}
      </div>

      <button className="research-action-button" type="button" disabled={selected.state === 'locked'}>
        <AssetIcon src={ICONS.research} alt="" size={18} />
        <span>{selected.state === 'done' ? 'Уже изучено' : selected.state === 'locked' ? 'Требования не выполнены' : 'Изучить'}</span>
      </button>
    </div>
  );
}


function CouncilResearchScreen({ stage, resources, population, levels }) {
  return (
    <div className="council-research-screen">
      <CouncilScreen stage={stage} resources={resources} population={population} levels={levels} />
      <div className="council-research-divider">Исследования совета</div>
      <ResearchTreeScreen stage={stage} resources={resources} levels={levels} />
    </div>
  );
}


function WorldMapScreen({ stage, resources, population }) {
  const expeditions = [
    {
      id: 'forest',
      title: 'Лесная тропа',
      difficulty: 'Лёгкая',
      time: '12 мин',
      icon: ICONS.map,
      rewards: [['wood', 160], ['food', 90]],
      available: population >= 8
    },
    {
      id: 'river',
      title: 'Речной брод',
      difficulty: 'Средняя',
      time: '24 мин',
      icon: ICONS.world,
      rewards: [['stone', 110], ['gold', 80]],
      available: resources.wood >= 300
    },
    {
      id: 'ruins',
      title: 'Старые руины',
      difficulty: 'Опасная',
      time: '45 мин',
      icon: ICONS.rank,
      rewards: [['culture', 70], ['gems', 4]],
      available: stage.computedPrestige >= 600
    }
  ];

  return (
    <div className="world-screen">
      <HudFrame className="world-map-card" frame={UI_ASSETS.panel}>
        <div className="world-map-visual">
          <span className="world-node node-home">Дом</span>
          <span className="world-node node-forest">Лес</span>
          <span className="world-node node-river">Река</span>
          <span className="world-node node-ruins">Руины</span>
        </div>
        <div className="world-map-copy">
          <span>Регион</span>
          <strong>Зелёная долина</strong>
          <p>Экспедиции дают редкие ресурсы, но требуют подготовки поселения.</p>
        </div>
      </HudFrame>

      <div className="expedition-list">
        {expeditions.map((expedition) => (
          <HudFrame key={expedition.id} className={`expedition-card ${expedition.available ? 'available' : 'locked'}`} frame={UI_ASSETS.panel}>
            <AssetIcon src={expedition.icon} alt="" size={24} />
            <div className="expedition-copy">
              <strong>{expedition.title}</strong>
              <span>{expedition.difficulty} · {expedition.time}</span>
              <div className="expedition-rewards">
                {expedition.rewards.map(([key, value]) => (
                  <b key={key}><ResourceIcon type={key} size={12} /> {formatNumber(value)}</b>
                ))}
              </div>
            </div>
            <button type="button" disabled={!expedition.available}>{expedition.available ? 'Идти' : 'Закрыто'}</button>
          </HudFrame>
        ))}
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



function RightPanelContent({ activePanel, selected, level, resources, levels, population, stage, upgradeBuilding }) {
  const screen = getRightPanelScreen(activePanel);
  if (screen.kind === 'building') {
    return <BuildingPanel building={selected} level={level} resources={resources} onUpgrade={upgradeBuilding} />;
  }
  if (screen.kind === 'goals') {
    return <GoalsPanel state={{ resources, levels, population, stage }} />;
  }
  if (screen.kind === 'inventory') {
    return <InventoryScreen resources={resources} population={population} />;
  }
  if (screen.kind === 'council') {
    return <CouncilResearchScreen stage={stage} resources={resources} population={population} levels={levels} />;
  }
  if (screen.kind === 'construction') {
    return <ConstructionScreen resources={resources} levels={levels} />;
  }
  if (screen.kind === 'world-map') {
    return <WorldMapScreen stage={stage} resources={resources} population={population} />;
  }
  return <GenericPanel activePanel={activePanel} stage={stage} resources={resources} population={population} />;
}


function SidePanel() {
  const activePanel = useSettlementStore((s) => s.activePanel);
  const selectedBuildingId = useSettlementStore((s) => s.selectedBuildingId);
  const levels = useSettlementStore((s) => s.levels);
  const resources = useSettlementStore((s) => s.resources);
  const population = useSettlementStore((s) => s.population);
  const stage = useMemo(() => getStage(resources, levels), [resources, levels]);
  const upgradeBuilding = useSettlementStore((s) => s.upgradeBuilding);
  const setPanel = useSettlementStore((s) => s.setPanel);
  const selected = BUILDINGS.find((b) => b.id === selectedBuildingId) ?? BUILDINGS[0];
  const level = levels[selected.id] ?? 1;
  const prod = useMemo(() => productionFrom(levels), [levels]);
  const sidePanelFrame = UI_ASSETS.sidePanelFancy;
  const panelChrome = getRightPanelChrome({ activePanel, selected, level });
  const activeTabLabel = panelChrome.label;
  const headerEyebrow = panelChrome.eyebrow;
  const headerTitle = panelChrome.title;
  const headerSubline = panelChrome.subline;
  const footerRows = [
    { id: 'food', label: 'Еда', value: prod.food.toFixed(1) },
    { id: 'wood', label: 'Дерево', value: prod.wood.toFixed(1) },
    { id: 'gold', label: 'Золото', value: prod.gold.toFixed(1) }
  ];

  return (
    <section className="right-panel right-panel-fancy" style={frameStyle(sidePanelFrame)}>
      <div className="panel-header fancy-panel-header">
        <div className="panel-header-copy">
          <span>{headerEyebrow}</span>
          <strong>{headerTitle}</strong>
        </div>
        <button className="icon-circle panel-header-action" onClick={() => setPanel('map')} style={frameStyle(UI_ASSETS.close)} aria-label="Закрыть/карта">
          <AssetIcon src={ICONS.settings} alt="" size={16} />
        </button>
      </div>

      <div className="panel-strip">{headerSubline}</div>

      <PanelTabs activePanel={activePanel} setPanel={setPanel} variant="fancy" />

      <div className="panel-body panel-body-fancy">
        <RightPanelContent
          activePanel={activePanel}
          selected={selected}
          level={level}
          resources={resources}
          levels={levels}
          population={population}
          stage={stage}
          upgradeBuilding={upgradeBuilding}
        />
      </div>

      <div className="panel-footer panel-footer-fancy">
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
      </div>
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
  const exitToHub = useExitToHub();
  const resources = useSettlementStore((s) => s.resources);
  const levels = useSettlementStore((s) => s.levels);
  const population = useSettlementStore((s) => s.population);
  const stage = useMemo(() => getStage(resources, levels), [resources, levels]);
  const selectedBuildingId = useSettlementStore((s) => s.selectedBuildingId);
  const activePanel = useSettlementStore((s) => s.activePanel);
  const setPanel = useSettlementStore((s) => s.setPanel);
  const collect = useSettlementStore((s) => s.collect);
  const tick = useSettlementStore((s) => s.tick);
  const selectBuilding = useSettlementStore((s) => s.selectBuilding);
  const shellControls = useMemo(() => ({
    activeRun: false,
    hudState: {
      gold: Math.floor(resources.gold ?? 0),
      population,
      prestige: Math.floor(stage.computedPrestige ?? 0)
    }
  }), [population, resources.gold, stage.computedPrestige]);
  useImmersiveGame('settlement', true, shellControls);

  useEffect(() => {
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  return (
    <div className="settlement-game-root" data-no-nav-swipe="true">
      <main className="settlement-game-shell">
        <SceneCanvas selectedBuildingId={selectedBuildingId} onBuildingSelect={selectBuilding} devMode={devMode} onDevPointer={setDevInfo} />
        <div className="hud-layer">
          <TopHud resources={resources} population={population} stage={stage} />
          <LeftDock activePanel={activePanel} setPanel={setPanel} onExit={exitToHub} />
          <SidePanel />
          <RightPromoRail setPanel={setPanel} />
          <BottomNav activePanel={activePanel} setPanel={setPanel} collect={collect} />
          <NoticeStack />
          <DevToolsOverlay enabled={devMode} setEnabled={setDevMode} info={devInfo} />
          <div className="gesture-hint">Drag / swipe — перемещение карты · wheel / pinch — zoom</div>
        </div>
      </main>
    </div>
  );
}
