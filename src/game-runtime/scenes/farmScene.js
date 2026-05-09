import {
  Container,
  createPointerSession,
  PANEL,
  MUTED,
  MINT,
  AMBER,
  CORAL,
  viewWidth,
  viewHeight,
  clear,
  label,
  rect,
  spriteFit,
  coverSprite,
  gameAsset,
  makeInteractive,
  fit,
  cellFromPoint,
  cropProgress,
  makeSparkles,
  setupStage,
  FARM_CROP_SLUGS,
  FARM_ASSET_KEYS,
  tickParticles,
} from './shared/runtime.js';

const FARM_THEME_ASSET_BY_ID = {
  default: "default",
  neon: "moon",
  autumn: "flower",
  crystal: "stone",
};

export function buildFarmScene(app, initial = {}) {
  const root = new Container();
  const effects = new Container();
  app.stage.addChild(root, effects);
  let data = initial;
  let hold = null;
  let layout = null;
  let suppressTap = false;

  function finishHold(cancelled = false) {
    if (!hold) return;
    window.clearTimeout(hold.timer);
    const completed = hold.completed;
    hold = null;
    if (!cancelled && completed) data.onFarmLongPress?.(completed.index, completed.plot);
  }

  const pointer = createPointerSession({
    tapDistance: 12,
    onMove: (next) => {
      if (hold && next.distance > 14) finishHold(true);
    },
    onTap: (done) => {
      if (suppressTap) {
        suppressTap = false;
        return;
      }
      const item = done.data || {};
      data.onFarmPlot?.(item.index, item.plot);
      const effectKey = item.ready
        ? FARM_ASSET_KEYS.harvestPop
        : item.plot?.crop && !item.plot?.watered
          ? FARM_ASSET_KEYS.waterSplash
          : FARM_ASSET_KEYS.plantPuff;
      const fx = spriteFit(gameAsset(effectKey), item.x, item.y, item.ready ? 58 : 44, item.ready ? 58 : 44, 0.76);
      fx._tween = { fromX: fx.x, fromY: fx.y, toX: fx.x, toY: fx.y - 16, duration: 20, fade: true, scaleFrom: 0.72, scaleTo: 1.18 };
      effects.addChild(fx);
      makeSparkles(effects, item.x, item.y, item.ready ? AMBER : MINT, 6);
      draw();
    },
    onDragEnd: () => finishHold(true),
    onCancel: () => finishHold(true),
  });

  function cropSlug(cropId) {
    return FARM_CROP_SLUGS[cropId] || cropId;
  }

  function cropPhase(progress) {
    if (progress >= 1) return "ready";
    if (progress >= 0.62) return "growing";
    if (progress >= 0.24) return "sprout";
    return "seed";
  }

  function cropAssetKey(cropId, progress) {
    return `farm.crops.${cropSlug(cropId)}_${cropPhase(progress)}`;
  }

  function plotThemeAsset(farm) {
    const active = farm?.cosmetics?.activePlotTheme || "default";
    const theme = FARM_THEME_ASSET_BY_ID[active] || "default";
    return FARM_ASSET_KEYS.plotThemes[theme] || FARM_ASSET_KEYS.plotEmpty;
  }

  function draw() {
    clear(root);
    const snapshot = data.snapshot || {};
    const farm = snapshot.farm || {};
    const plots = farm.plots || [];
    const labels = data.farmLabels || {};
    const now = Number(snapshot.serverTime) || Date.now();
    const cols = 4;
    const rows = Math.max(2, Math.ceil(Math.max(plots.length, 6) / cols));
    const fitted = fit(app, cols, rows, 16, 10);
    layout = { ...fitted, cols, rows };
    const { cell, left, top } = fitted;
    const stageWidth = viewWidth(app);
    const stageHeight = viewHeight(app);
    root.addChild(coverSprite(gameAsset(FARM_ASSET_KEYS.backgroundField), stageWidth / 2, stageHeight / 2, stageWidth, stageHeight, 1536 / 1024, 0.96));
    root.addChild(rect(left - 10, top - 10, cell * cols + 20, cell * rows + 20, PANEL, 14, 0.16));
    const themeAsset = plotThemeAsset(farm);

    for (let i = 0; i < rows * cols; i++) {
      const plot = plots[i];
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = left + c * cell + 5;
      const y = top + r * cell + 5;
      const w = cell - 10;
      const progress = cropProgress(plot, now);
      const planted = !!plot?.crop;
      const ready = planted && progress >= 1;
      const isHolding = hold?.index === i;
      root.addChild(spriteFit(gameAsset(FARM_ASSET_KEYS.plotShadow), x + w / 2, y + w / 2 + w * 0.07, w * 1.02, w * 0.88, 0.42));
      const baseAsset = !plot ? FARM_ASSET_KEYS.plotLocked : planted ? themeAsset : FARM_ASSET_KEYS.plotEmpty;
      const tile = spriteFit(gameAsset(baseAsset), x + w / 2, y + w / 2, w, w, !plot ? 0.72 : 1);
      makeInteractive(tile, {
        pointerdown: (event) => {
          if (!plot) return;
          suppressTap = false;
          const timer = window.setTimeout(() => {
            if (!hold || hold.index !== i || !plot.crop || ready) return;
            hold.completed = { index: i, plot };
            suppressTap = true;
            data.onFarmLongPress?.(i, plot);
            makeSparkles(effects, x + w / 2, y + w / 2, CORAL, 8);
            draw();
          }, 1200);
          hold = { index: i, plot, timer, completed: null };
          pointer.start(event, { kind: "farm-plot", index: i, plot, x: x + w / 2, y: y + w / 2, ready });
        },
      });
      root.addChild(tile);
      if (isHolding) {
        root.addChild(spriteFit(gameAsset(FARM_ASSET_KEYS.plotSelected), x + w / 2, y + w / 2, w, w, 0.88));
      }

      if (!plot) {
        continue;
      }
      if (!planted) {
        root.addChild(label(labels.soil || "soil", x + w / 2, y + w * 0.55, Math.max(10, cell * 0.12), 0x7b5a33));
        continue;
      }

      const cropView = spriteFit(gameAsset(cropAssetKey(plot.crop, progress)), x + w / 2, y + w * 0.5, w * 0.84, w * 0.76, 0.98);
      root.addChild(cropView);
      if (plot.watered && !ready) {
        root.addChild(spriteFit(gameAsset(FARM_ASSET_KEYS.plotWateredOverlay), x + w / 2, y + w / 2, w, w, 0.76));
      }
      if (ready) {
        root.addChild(spriteFit(gameAsset(FARM_ASSET_KEYS.plotReadyOverlay), x + w / 2, y + w / 2, w, w, 0.82));
        root.addChild(spriteFit(gameAsset(FARM_ASSET_KEYS.growthGlow), x + w / 2, y + w * 0.46, w * 0.86, w * 0.86, 0.46));
      }
      root.addChild(rect(x + w * 0.15, y + w * 0.78, w * 0.7, 6, 0x17231d, 6));
      root.addChild(rect(x + w * 0.15, y + w * 0.78, w * 0.7 * progress, 6, ready ? AMBER : MINT, 6));
      root.addChild(label(ready ? labels.ready || "READY" : isHolding ? labels.uproot || "UPROOT" : plot.watered ? labels.watered || "watered" : `${Math.round(progress * 100)}%`, x + w / 2, y + w * 0.9, Math.max(8, cell * 0.1), ready ? AMBER : isHolding ? CORAL : MUTED));
    }
  }

  function _handleStageTap(event) {
    if (suppressTap) return;
    const cell = cellFromPoint(layout, event.global.x, event.global.y);
    if (!cell) return;
    const index = cell.row * layout.cols + cell.col;
    const plot = data.snapshot?.farm?.plots?.[index];
    if (!plot) return;
    data.onFarmPlot?.(index, plot);
    makeSparkles(effects, layout.left + cell.col * layout.cell + layout.cell / 2, layout.top + cell.row * layout.cell + layout.cell / 2, MINT, 6);
    draw();
  }

  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  const ticker = () => tickParticles(effects);
  app.ticker.add(ticker);
  draw();
  return {
    update(next) {
      data = next || {};
      draw();
    },
    destroy() {
      cleanup();
      app.ticker.remove(ticker);
      pointer.cancel("destroy");
      finishHold(true);
      clear(root);
      clear(effects);
      root.destroy({ children: true });
      effects.destroy({ children: true });
      layout = null;
    },
  };
}
