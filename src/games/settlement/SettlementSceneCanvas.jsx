import { useSettlementText } from './useSettlementText.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { HudEditableRegion, HudRegion, useHudLayout, useHudRegion } from '../../app/hud-layout/index.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { DEVELOPMENTS, batchYield } from './settlementCycle.js';
import { canPay, getResearchNodeStatus, getStage, productionFrom, upgradeCost, useSettlementStore } from './useSettlementStore.js';
import { CONSTRUCTION_ITEMS_BY_ID_UI, constructionItemAsset } from './settlementViewShared.jsx';

const SOURCE_GROUND = { w: 2816, h: 2112 };

const WORLD = { w: 4096, h: 2304 };

const GROUND = { x: 0, y: 0, w: WORLD.w, h: WORLD.h };

const REGION_SCALE = { x: WORLD.w / SOURCE_GROUND.w, y: WORLD.h / SOURCE_GROUND.h };

const REGION_OBJECT_SCALE = 1.14;

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

function regionX(x) {
  return x * REGION_SCALE.x;
}

function regionY(y) {
  return y * REGION_SCALE.y;
}

function regionPoint(point) {
  return [regionX(point[0]), regionY(point[1])];
}

function regionPosition(source) {
  return { x: regionX(source.x), y: regionY(source.y) };
}

function regionScale(scale) {
  return scale * REGION_OBJECT_SCALE;
}

const CONSTRUCTION_SLOT_HIT_AREA = { x: -220, y: -300, width: 440, height: 360 };

function applyConstructionSlotLayout(item, slot) {
  if (!item || !slot) return;
  const placementPosition = regionPosition(slot);
  item.container.x = placementPosition.x;
  item.container.y = placementPosition.y;
  item.container.zIndex = placementPosition.y + 4;
  item.container.hitArea = new Rectangle(
    CONSTRUCTION_SLOT_HIT_AREA.x,
    CONSTRUCTION_SLOT_HIT_AREA.y,
    CONSTRUCTION_SLOT_HIT_AREA.width,
    CONSTRUCTION_SLOT_HIT_AREA.height,
  );
  item.ringIdle.scale.set(regionScale(slot.scale * 0.95));
  item.ringSelected.scale.set(regionScale(slot.scale * 1.03));
  item.ghostOverlay.scale.set(regionScale(slot.scale * 0.92));
  item.ghostSprite.scale.set(regionScale(slot.scale));
  item.builtSprite.scale.set(regionScale(slot.scale));
  item.slot = slot;
}

function constructionSlotScreenBox(slot, camera) {
  const scale = Number(camera?.scale) || 1;
  const x = (Number(camera?.x) || 0) + regionX(slot.x) * scale;
  const y = (Number(camera?.y) || 0) + regionY(slot.y) * scale;
  const left = x + CONSTRUCTION_SLOT_HIT_AREA.x * scale;
  const top = y + CONSTRUCTION_SLOT_HIT_AREA.y * scale;
  const width = CONSTRUCTION_SLOT_HIT_AREA.width * scale;
  const height = CONSTRUCTION_SLOT_HIT_AREA.height * scale;
  return { left, top, width, height };
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
  // Fit the actual host: a 420px floor pushes slots below compact landscape.
  const safeH = Math.max(1, viewH);
  const portrait = safeH > safeW;
  const scale = portrait
    ? Math.min(Math.max(safeW / 1550, safeH / WORLD.h), 0.62)
    : Math.min(safeW / 2350, safeH / 1650, 0.62);
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

function SceneCanvas({ selectedBuildingId, activePanel, selectedConstructionItem, selectedConstructionSlotId, constructedBuildings, onBuildingSelect, onConfirmConstruction, onConstructionSlotSelect, devMode, onDevPointer }) {
  const t = useSettlementText();
  const [sceneRevision, setSceneRevision] = useState(0);
  const [cameraSnapshot, setCameraSnapshot] = useState(() => ({ x: 0, y: 0, scale: 0.5, width: 1, height: 1 }));
  const hostRef = useRef(null);
  const hudLayout = useHudLayout();
  const canvasRegion = useHudRegion('settlementCanvas', { ref: hostRef });
  const appRef = useRef(null);
  const sceneReadyRef = useRef(false);
  const worldRef = useRef(null);
  const spritesRef = useRef({ buildings: new Map(), constructionSlots: new Map(), vfx: new Map() });
  const cameraRef = useRef({ x: 0, y: 0, scale: 0.5 });
  const gestureRef = useRef({ pointers: new Map(), dragging: false, lastX: 0, lastY: 0, pinchStart: 0, pinchScale: 1 });
  const rafRef = useRef(0);
  const selectedRef = useRef(selectedBuildingId);
  const activePanelRef = useRef(activePanel);
  const selectedConstructionItemRef = useRef(selectedConstructionItem);
  const selectedConstructionSlotIdRef = useRef(selectedConstructionSlotId);
  const constructedBuildingsRef = useRef(constructedBuildings ?? {});
  const confirmConstructionRef = useRef(onConfirmConstruction);
  const constructionSlotSelectRef = useRef(onConstructionSlotSelect);
  const devModeRef = useRef(Boolean(devMode));
  const hudEditorEnabledRef = useRef(Boolean(hudLayout.editorEnabled));
  const devLatestInfoRef = useRef(null);
  const devInfoFrameRef = useRef(0);

  const levels = useSettlementStore((s) => s.levels);
  const development = useSettlementStore((s) => s.settlementCycle.development);
  const focusedDevelopmentRef = useRef(null);
  const storeSelect = useSettlementStore((s) => s.selectBuilding);
  const slotLayouts = useMemo(() => (
    CONSTRUCTION_PANEL_DATA.placementSlots.map((slot) => getSettlementPlacementSlotLayout(slot, hudLayout.resolvedLayout?.regions || {}))
  ), [hudLayout.resolvedLayout]);
  const slotRegions = useMemo(() => {
    const cameraScale = Math.max(0.001, Number(cameraSnapshot.scale) || 1);
    const dragCoordinateScaleX = 1 / (cameraScale * REGION_SCALE.x);
    const dragCoordinateScaleY = 1 / (cameraScale * REGION_SCALE.y);
    return slotLayouts.map((slot) => ({
      slot,
      box: constructionSlotScreenBox(slot, cameraSnapshot),
      capabilities: {
        draggable: true,
        resizable: false,
        canChangeVisibility: true,
        measured: true,
        mode: "custom",
        placement: true,
        coordinateSpace: "settlementMap",
        dragCoordinateScaleX,
        dragCoordinateScaleY,
      },
    }));
  }, [cameraSnapshot, slotLayouts]);

  const updateCameraSnapshot = useCallback(() => {
    if (!hudEditorEnabledRef.current) return;
    const host = hostRef.current;
    const camera = cameraRef.current;
    setCameraSnapshot((current) => {
      const next = {
        x: Math.round((Number(camera.x) || 0) * 100) / 100,
        y: Math.round((Number(camera.y) || 0) * 100) / 100,
        scale: Math.round((Number(camera.scale) || 1) * 1000) / 1000,
        width: Math.max(1, Math.round(host?.clientWidth || 1)),
        height: Math.max(1, Math.round(host?.clientHeight || 1)),
      };
      return current.x === next.x && current.y === next.y && current.scale === next.scale && current.width === next.width && current.height === next.height
        ? current
        : next;
    });
  }, []);

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
    selectedConstructionSlotIdRef.current = selectedConstructionSlotId;
  }, [selectedConstructionSlotId]);

  useEffect(() => {
    constructedBuildingsRef.current = constructedBuildings ?? {};
  }, [constructedBuildings]);

  useEffect(() => {
    confirmConstructionRef.current = onConfirmConstruction;
  }, [onConfirmConstruction]);

  useEffect(() => {
    constructionSlotSelectRef.current = onConstructionSlotSelect;
  }, [onConstructionSlotSelect]);

  useEffect(() => {
    devModeRef.current = Boolean(devMode);
    const devLayer = spritesRef.current.devLayer;
    if (devLayer) devLayer.visible = Boolean(devMode);
    if (!devMode) onDevPointer?.(null);
  }, [devMode, onDevPointer]);

  useEffect(() => {
    hudEditorEnabledRef.current = Boolean(hudLayout.editorEnabled);
    updateCameraSnapshot();
  }, [hudLayout.editorEnabled, updateCameraSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return undefined;

    host.dataset.settlementSceneState = 'loading';
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
        MAP_ASSETS.region,
        VFX_ASSETS.marketSparkle,
        VFX_ASSETS.waterGlint,
        VFX_ASSETS.buildDust,
        VFX_ASSETS.questReady,
        VFX_ASSETS.goldPop,
        VFX_ASSETS.foodPop,
        UI_ASSETS.constructionPlotRingIdle,
        UI_ASSETS.constructionPlotRingSelected,
        UI_ASSETS.constructionGhostOverlay,
        UI_ASSETS.constructionConfirmIdle,
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

      const region = makeSafeSprite(await loadTexture(MAP_ASSETS.region));
      region.width = WORLD.w;
      region.height = WORLD.h;
      region.zIndex = 0;
      world.addChild(region);

      const groundLayer = new Container();
      groundLayer.x = GROUND.x;
      groundLayer.y = GROUND.y;
      groundLayer.zIndex = 10;
      groundLayer.sortableChildren = true;
      world.addChild(groundLayer);

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
        const anchor = regionPosition(building);
        anchorGraphics.circle(anchor.x, anchor.y, 9).fill({ color: 0xff5544, alpha: 0.9 });
        anchorGraphics.moveTo(anchor.x - 18, anchor.y).lineTo(anchor.x + 18, anchor.y).stroke({ color: 0xffffff, alpha: 0.95, width: 3 });
        anchorGraphics.moveTo(anchor.x, anchor.y - 18).lineTo(anchor.x, anchor.y + 18).stroke({ color: 0xffffff, alpha: 0.95, width: 3 });
        const label = new Text({
          text: `${building.short} ${Math.round(anchor.x)},${Math.round(anchor.y)}`,
          style: { fontFamily: 'monospace', fontSize: 20, fontWeight: '800', fill: '#ffffff', stroke: { color: '#000000', width: 5 } }
        });
        label.x = anchor.x + 22;
        label.y = anchor.y - 30;
        devLayer.addChild(label);
      }
      devLayer.addChild(anchorGraphics);
      groundLayer.addChild(devLayer);
      spritesRef.current.devLayer = devLayer;

      for (const prop of PROPS) {
        const texture = await loadTexture(prop.image, { trim: true });
        if (cancelled) return;
        if (!texture) continue;
        const position = regionPosition(prop);
        const sprite = anchorBottom(makeSafeSprite(texture));
        sprite.x = position.x;
        sprite.y = position.y;
        sprite.scale.set(regionScale(prop.scale));
        sprite.zIndex = position.y;
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
        const position = regionPosition(building);

        const wrapper = new Container();
        wrapper.x = position.x;
        wrapper.y = position.y;
        wrapper.zIndex = position.y;
        wrapper.eventMode = 'static';
        wrapper.cursor = 'pointer';
        wrapper.hitArea = new Rectangle(-210, -300, 420, 360);
        wrapper.on('pointertap', () => {
          storeSelect(building.id);
          onBuildingSelect?.(building.id);
        });

        const sprite = anchorBottom(makeSafeSprite(texture));
        sprite.name = 'building-sprite';
        sprite.scale.set(regionScale(building.scale));
        wrapper.addChild(sprite);

        const ring = anchorBottom(makeSafeSprite(ringTexture));
        ring.name = 'selection-ring';
        ring.y = visual.ringY ?? 4;
        const ringBaseScale = regionScale(visual.ringScale ?? Math.max(0.18, building.scale * 0.55));
        ring.scale.set(ringBaseScale);
        ring.alpha = building.id === selectedRef.current ? 0.88 : 0;
        ring.zIndex = -1;
        wrapper.addChildAt(ring, 0);

        const upgradeGlow = anchorBottom(makeSafeSprite(upgradeGlowTexture));
        upgradeGlow.name = 'upgrade-glow';
        upgradeGlow.y = visual.ringY ?? 4;
        upgradeGlow.scale.set(ringBaseScale * 1.16);
        upgradeGlow.alpha = building.id === selectedRef.current ? 0.32 : 0;
        upgradeGlow.blendMode = 'add';
        wrapper.addChildAt(upgradeGlow, 1);

        const levelupRays = anchorBottom(makeSafeSprite(levelupRaysTexture));
        levelupRays.name = 'levelup-rays';
        levelupRays.y = -18;
        levelupRays.scale.set(ringBaseScale * 1.4);
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
        const nameBadge = createTextLabel(t(building.short), 0, 14, 'small');
        nameBadge.name = 'name-badge';
        wrapper.addChild(nameBadge);

        buildingLayer.addChild(wrapper);
        spritesRef.current.buildings.set(building.id, { wrapper, sprite, ring, ringBaseScale, upgradeGlow, levelupRays, levelBadge, nameBadge, smokeAnchor });
      }

      const plotRingIdleTexture = await loadTexture(UI_ASSETS.constructionPlotRingIdle);
      if (cancelled) return;
      const plotRingSelectedTexture = await loadTexture(UI_ASSETS.constructionPlotRingSelected);
      if (cancelled) return;
      const ghostOverlayTexture = await loadTexture(UI_ASSETS.constructionGhostOverlay);
      if (cancelled) return;
      const confirmTexture = await loadTexture(UI_ASSETS.constructionConfirmIdle);
      if (cancelled) return;
      const initialConstructionItem = selectedConstructionItemRef.current ?? CONSTRUCTION_PANEL_DATA.items[0];
      const initialConstructionTexture = initialConstructionItem ? await loadTexture(constructionItemAsset(initialConstructionItem), { trim: true }) : null;
      if (cancelled) return;

      for (const authoredSlot of CONSTRUCTION_PANEL_DATA.placementSlots) {
        const slot = getSettlementPlacementSlotLayout(authoredSlot, hudLayout.resolvedLayout?.regions || {});
        const placementPosition = regionPosition(slot);
        const slotContainer = new Container();
        slotContainer.name = `construction-slot-${slot.id}`;
        slotContainer.x = placementPosition.x;
        slotContainer.y = placementPosition.y;
        slotContainer.zIndex = placementPosition.y + 4;
        slotContainer.eventMode = 'static';
        slotContainer.cursor = 'pointer';
        slotContainer.hitArea = new Rectangle(
          CONSTRUCTION_SLOT_HIT_AREA.x,
          CONSTRUCTION_SLOT_HIT_AREA.y,
          CONSTRUCTION_SLOT_HIT_AREA.width,
          CONSTRUCTION_SLOT_HIT_AREA.height,
        );
        slotContainer.visible = false;
        slotContainer.on('pointertap', () => {
          const built = constructedBuildingsRef.current?.[slot.id];
          if (built) {
            storeSelect(built.id);
            onBuildingSelect?.(built.id);
            return;
          }
          constructionSlotSelectRef.current?.(slot.id);
        });

        const ringIdle = makeSafeSprite(plotRingIdleTexture);
        ringIdle.name = 'construction-ring-idle';
        ringIdle.anchor.set(0.5, 0.5);
        ringIdle.y = 6;
        ringIdle.scale.set(regionScale(slot.scale * 0.95));
        ringIdle.alpha = 0.82;
        ringIdle.zIndex = -4;
        slotContainer.addChild(ringIdle);

        const ringSelected = makeSafeSprite(plotRingSelectedTexture);
        ringSelected.name = 'construction-ring-selected';
        ringSelected.anchor.set(0.5, 0.5);
        ringSelected.y = 6;
        ringSelected.scale.set(regionScale(slot.scale * 1.03));
        ringSelected.alpha = 0;
        ringSelected.zIndex = -3;
        slotContainer.addChild(ringSelected);

        const ghostOverlay = anchorBottom(makeSafeSprite(ghostOverlayTexture));
        ghostOverlay.name = 'construction-ghost-overlay';
        ghostOverlay.y = 2;
        ghostOverlay.scale.set(regionScale(slot.scale * 0.92));
        ghostOverlay.alpha = 0.7;
        ghostOverlay.zIndex = -1;
        slotContainer.addChild(ghostOverlay);

        const ghostSprite = initialConstructionTexture ? anchorBottom(makeSafeSprite(initialConstructionTexture)) : new Sprite();
        ghostSprite.name = 'construction-preview';
        ghostSprite.tint = 0xd8ffbf;
        ghostSprite.alpha = 0.78;
        ghostSprite.scale.set(regionScale(slot.scale));
        ghostSprite.blendMode = 'screen';
        slotContainer.addChild(ghostSprite);

        const builtSprite = initialConstructionTexture ? anchorBottom(makeSafeSprite(initialConstructionTexture)) : new Sprite();
        builtSprite.name = 'constructed-building';
        builtSprite.scale.set(regionScale(slot.scale));
        builtSprite.visible = false;
        slotContainer.addChild(builtSprite);

        const confirm = makeSafeSprite(confirmTexture);
        confirm.name = 'construction-confirm';
        confirm.anchor.set(0.5);
        confirm.x = 96;
        confirm.y = -28;
        confirm.scale.set(0.48);
        confirm.eventMode = 'static';
        confirm.cursor = 'pointer';
        confirm.visible = false;
        confirm.on('pointertap', (event) => {
          event.stopPropagation?.();
          confirmConstructionRef.current?.(slot.id);
        });
        const checkMark = new Text({
          text: '✓',
          style: {
            fontFamily: 'Georgia, serif',
            fontSize: 38,
            fontWeight: '900',
            fill: '#f7ffd1',
            stroke: { color: '#193900', width: 5 }
          }
        });
        checkMark.anchor.set(0.5, 0.56);
        confirm.addChild(checkMark);
        slotContainer.addChild(confirm);

        const slotLabel = createTextLabel(t(slot.label), 0, 42, 'small');
        slotLabel.name = 'construction-label';
        slotLabel.alpha = 0.95;
        slotContainer.addChild(slotLabel);

        buildingLayer.addChild(slotContainer);
        spritesRef.current.constructionSlots.set(slot.id, {
          container: slotContainer,
          ringIdle,
          ringSelected,
          ghostOverlay,
          ghostSprite,
          builtSprite,
          confirm,
          label: slotLabel,
          slot,
          ghostItemId: initialConstructionItem?.id ?? null,
          builtItemId: null
        });
      }
      for (const villager of VILLAGERS) {
        const texture = await loadTexture(villager.image);
        if (cancelled) return;
        if (!texture) continue;
        const frames = splitTexture(texture, { ...(villager.layout ?? { frames: 4, cols: 4, rows: 1 }), inset: villager.layout?.inset ?? DEFAULT_FRAME_INSET });
        const anim = new AnimatedSprite(frames);
        const position = regionPosition(villager);
        anim.anchor.set(0.5, 1);
        anim.scale.set(regionScale(villager.scale));
        anim.animationSpeed = 0.075;
        anim.play();
        anim.x = position.x;
        anim.y = position.y;
        anim.zIndex = position.y + 10;
        anim.eventMode = 'none';
        anim.roundPixels = false;
        anim._vaPath = villager.path?.map(regionPoint);
        anim._vaSeed = Math.random() * 1000;
        villagerLayer.addChild(anim);
      }

      for (const worker of WORKERS) {
        const texture = await loadTexture(worker.image);
        if (cancelled) return;
        if (!texture) continue;
        const anim = new AnimatedSprite(splitTexture(texture, { frames: 4, cols: 4, rows: 1, inset: DEFAULT_FRAME_INSET }));
        const position = regionPosition(worker);
        anim.anchor.set(0.5, 1);
        anim.scale.set(regionScale(worker.scale));
        anim.animationSpeed = 0.065;
        anim.play();
        anim.x = position.x;
        anim.y = position.y;
        anim.zIndex = position.y + 12;
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
        const [x, y] = regionPoint(point);
        const dust = new AnimatedSprite(dustFrames);
        dust.anchor.set(0.5, 1);
        dust.x = x;
        dust.y = y + 12;
        dust.scale.set(regionScale(0.18));
        dust.animationSpeed = 0.026 + Math.random() * 0.012;
        dust.alpha = 0.28;
        dust.play();
        dust.zIndex = y + 2;
        vfxLayer.addChild(dust);
      }

      const glintFrames = splitTexture(await loadTexture(VFX_ASSETS.waterGlint), { frames: 6, cols: 6, rows: 1, inset: 2 });
      if (cancelled) return;
      for (const point of [[620, 620], [870, 1760], [3180, 1720]]) {
        const glint = new AnimatedSprite(glintFrames);
        glint.anchor.set(0.5);
        glint.x = point[0];
        glint.y = point[1];
        glint.scale.set(regionScale(0.2));
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
      updateCameraSnapshot();
      sceneReadyRef.current = true;
      setSceneRevision((value) => value + 1);

      function applyCamera() {
        rafRef.current = 0;
        const c = cameraRef.current;
        clampCamera(c, host.clientWidth, host.clientHeight);
        world.position.set(c.x, c.y);
        world.scale.set(c.scale);
        updateCameraSnapshot();
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
        updateCameraSnapshot();
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
          const baseScale = item.ringBaseScale ?? regionScale(BUILDING_VISUALS[id]?.ringScale ?? 0.22);
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
        for (const [slotId, slot] of spritesRef.current.constructionSlots ?? []) {
          if (!slot.container.visible) continue;
          const selectedSlot = selectedConstructionSlotIdRef.current === slotId;
          const built = constructedBuildingsRef.current?.[slotId];
          slot.container.alpha = built ? 1 : 0.92 + Math.sin(t * 2.2) * 0.04;
          slot.ringSelected.rotation += selectedSlot ? 0.0025 : 0.001;
          slot.ringSelected.alpha = selectedSlot ? 0.86 + Math.sin(t * 2.8) * 0.08 : slot.ringSelected.alpha;
          if (slot.ghostSprite.visible) {
            slot.ghostSprite.alpha = 0.72 + Math.sin(t * 2.5) * 0.06;
          }
          if (slot.confirm.visible) {
            const scale = 0.48 + Math.sin(t * 3.1) * 0.018;
            slot.confirm.scale.set(scale);
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
      // Publish readiness only after textures, scene layers and camera exist.
      app.render();
      host.dataset.settlementSceneState = 'ready';
    }

    init().catch((error) => {
      if (!cancelled) {
        host.dataset.settlementSceneState = 'error';
        console.error('Pixi scene failed to initialize', error);
      }
    });

    return () => {
      cancelled = true;
      delete host.dataset.settlementSceneState;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const app = appRef.current;
      destroyPixiAppSafely(app);
      appRef.current = null;
      sceneReadyRef.current = false;
      spritesRef.current = { buildings: new Map(), constructionSlots: new Map(), vfx: new Map(), devLayer: null };
    };
  // Scene is intentionally initialized once. Live updates are handled by targeted effects below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadedBuildings = spritesRef.current.buildings;
    if (!loadedBuildings.size) return;
    let cancelled = false;
    Promise.all(BUILDINGS.map(async (building) => ({
      building,
      texture: await loadTexture(buildingAsset(building.id, levels[building.id] ?? 1), { trim: true })
    }))).then((results) => {
      if (cancelled) return;
      for (const { building, texture } of results) {
        const item = loadedBuildings.get(building.id);
        if (!item || !texture) continue;
        item.sprite.texture = texture;
        item.sprite.scale.set(regionScale(building.scale));
        item.levelBadge.destroy({ children: true });
        const freshBadge = createLevelBadge(levels[building.id] ?? 1, 0, -item.sprite.height * building.scale - 18);
        freshBadge.name = 'level-badge';
        item.wrapper.addChild(freshBadge);
        item.levelBadge = freshBadge;
      }
      // Show the changed artwork in the open map area, above the compact card.
      // Reserves and card geometry belong to the registered layout profiles.
      if (sceneReadyRef.current && development > 0 && focusedDevelopmentRef.current !== development) {
        const item = loadedBuildings.get(DEVELOPMENTS[development - 1]?.buildingId);
        const host = hostRef.current;
        const world = worldRef.current;
        if (item && host && world) {
          const regions = hudLayout.resolvedLayout?.regions ?? {};
          const top = regions.pixiPlayfieldReserve?.topReserve ?? 0;
          const card = regions.settlementCompactDetail ?? {};
          const bottom = (card.offset ?? 0) + (card.thickness ?? 0);
          const camera = cameraRef.current;
          const besideCard = card.alignment === 'right';
          const cardLeft = host.clientWidth - Math.min(card.maxWidth ?? host.clientWidth, host.clientWidth - 20) - 10;
          const targetX = besideCard ? (cardLeft + (regions.pixiPlayfieldReserve?.leftReserve ?? 0)) / 2 : host.clientWidth / 2;
          const targetY = (top + Math.max(top, host.clientHeight - (besideCard ? regions.settlementBottomNav?.reserve ?? 0 : bottom))) / 2;
          const centerY = item.wrapper.y - item.sprite.height / 2;
          // A portrait camera that fits the full map cannot pan vertically.
          // Zoom enough to put the developed building above the overlay card.
          if (!besideCard) camera.scale = Math.max(camera.scale, Math.min(0.62, (host.clientHeight - targetY) / Math.max(1, WORLD.h - centerY)));
          camera.x = targetX - item.wrapper.x * camera.scale;
          camera.y = targetY - centerY * camera.scale;
          clampCamera(camera, host.clientWidth, host.clientHeight);
          world.position.set(camera.x, camera.y);
          world.scale.set(camera.scale);
          focusedDevelopmentRef.current = development;
          updateCameraSnapshot();
        }
      }
    }).catch((error) => {
      if (!cancelled) console.error('Settlement building update failed', error);
    });
    return () => { cancelled = true; };
  }, [levels, sceneRevision, development, hudLayout.resolvedLayout, updateCameraSnapshot]);

  useEffect(() => {
    for (const [id, item] of spritesRef.current.buildings) {
      item.ring.alpha = activePanel === 'construction' ? 0 : id === selectedBuildingId ? 0.88 : 0;
    }
  }, [activePanel, selectedBuildingId]);

  useEffect(() => {
    for (const [id, item] of spritesRef.current.buildings) {
      const building = BUILDINGS.find(candidate => candidate.id === id);
      if (!building) continue;
      item.nameBadge?.destroy({ children: true });
      item.nameBadge = createTextLabel(t(building.short), 0, 14, 'small');
      item.nameBadge.name = 'name-badge';
      item.wrapper.addChild(item.nameBadge);
    }
  }, [t, sceneRevision]);

  useEffect(() => {
    const slotSprites = spritesRef.current.constructionSlots;
    if (!slotSprites?.size) return;
    for (const slot of slotLayouts) {
      const item = slotSprites.get(slot.id);
      if (!item) continue;
      applyConstructionSlotLayout(item, slot);
    }
    updateCameraSnapshot();
  }, [sceneRevision, slotLayouts, updateCameraSnapshot]);

  useEffect(() => {
    const slotSprites = spritesRef.current.constructionSlots;
    if (!slotSprites?.size) return;
    let cancelled = false;
    for (const [slotId, item] of slotSprites) {
      const record = constructedBuildings?.[slotId] ?? null;
      const builtItem = record ? CONSTRUCTION_ITEMS_BY_ID_UI[record.itemId] : null;
      const previewItem = builtItem ?? selectedConstructionItem;
      const isConstructionOpen = activePanel === 'construction';
      const isSelectedSlot = selectedConstructionSlotId === slotId;
      const isSelectedBuilt = record?.id === selectedBuildingId;
      const showEmptySlot = isConstructionOpen && !record;
      const showBuilt = Boolean(record && builtItem);
      const slotVisible = item.slot?.visible !== false;
      item.container.visible = slotVisible && (showEmptySlot || showBuilt || isSelectedSlot || isSelectedBuilt);
      item.container.cursor = showBuilt ? 'pointer' : isConstructionOpen ? 'pointer' : 'default';
      item.ringIdle.visible = showEmptySlot || showBuilt || isSelectedBuilt;
      item.ringIdle.alpha = showEmptySlot ? 0.72 : showBuilt ? 0.22 : 0;
      item.ringSelected.visible = showEmptySlot || showBuilt || isSelectedBuilt;
      item.ringSelected.alpha = isSelectedSlot || isSelectedBuilt ? 0.95 : showEmptySlot ? 0.2 : 0;
      item.ghostOverlay.visible = showEmptySlot;
      item.ghostSprite.visible = showEmptySlot;
      item.confirm.visible = showEmptySlot && isSelectedSlot;
      item.builtSprite.visible = showBuilt;

      const labelText = t(showBuilt ? builtItem.name : isSelectedSlot ? `${item.slot.label}: выбрано` : item.slot.label);
      if (item.labelText !== labelText) {
        item.label?.destroy({ children: true });
        const freshLabel = createTextLabel(labelText, 0, showBuilt ? 24 : 42, 'small');
        freshLabel.name = 'construction-label';
        freshLabel.alpha = showBuilt ? 0.88 : 0.95;
        item.container.addChild(freshLabel);
        item.label = freshLabel;
        item.labelText = labelText;
      }

      if (!previewItem) continue;
      const targetKey = showBuilt ? 'builtItemId' : 'ghostItemId';
      if (item[targetKey] === previewItem.id) continue;
      item[targetKey] = previewItem.id;
      loadTexture(constructionItemAsset(previewItem), { trim: true }).then((texture) => {
        if (cancelled || !texture) return;
        if (showBuilt) {
          item.builtSprite.texture = texture;
          item.builtSprite.scale.set(regionScale(item.slot.scale));
        } else {
          item.ghostSprite.texture = texture;
          item.ghostSprite.scale.set(regionScale(item.slot.scale));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [activePanel, selectedBuildingId, selectedConstructionItem, selectedConstructionSlotId, constructedBuildings, sceneRevision, t]);

  return (
    <div ref={canvasRegion.ref} className="scene-host" data-hud-region="settlementCanvas">
      {hudLayout.editorEnabled && (
        <div className="settlement-placement-region-layer" aria-hidden="true">
          {slotRegions.map(({ slot, box, capabilities }) => (
            <HudEditableRegion
              key={slot.regionId}
              id={slot.regionId}
              as="div"
              applyLayout={false}
              capabilities={capabilities}
              className="settlement-placement-region-probe"
              style={{
                left: `${box.left}px`,
                top: `${box.top}px`,
                width: `${Math.max(44, box.width)}px`,
                height: `${Math.max(44, box.height)}px`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SceneCanvas;

export { SceneCanvas };
