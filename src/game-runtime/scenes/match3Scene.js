import { Texture, NineSliceSprite } from 'pixi.js';
import { Container, Graphics, Rectangle, makeRafScheduler, createPointerSession, match3TargetFromGesture, clear, isAdjacentMatch3Cell, strokedRect, spriteFit, label, GEM_ICONS, DROP_ICONS, GEM_COLORS, BOARD_SIZE, cellCenter, MATCH3_ASSET_KEYS, AMBER, SKY, viewWidth, viewHeight, publishCanvasLayout, rect, publishCanvasAssetLayout, applyHudAssetRegion, setupStage, gameAsset, POTION_PIECE_ASSETS } from './shared/runtime.js';
import { MATCH3_GEM_ART, MATCH3_NINE_SLICE, match3ArtUrl } from '../../games/match3/match3Art.js';
import { composeMatch3 } from '../../games/match3/match3Composition.js';
import { createMatch3MotionPlan, sampleMatch3Motion, boardPoses, createMatch3MotionClock, advanceMatch3MotionClock } from '../../game-core/match3/motion.js';

function match3GemAsset(gem) {
  return MATCH3_GEM_ART[gem] ? match3ArtUrl(MATCH3_GEM_ART[gem]) : gameAsset(POTION_PIECE_ASSETS[gem]);
}
function createMatch3BoardFrame(bounds){
  const texture=Texture.from(match3ArtUrl("frame"));
  const[left, top, right, bottom]=MATCH3_NINE_SLICE.frame.source;
  const scale=MATCH3_NINE_SLICE.frame.destination[0]/left;
  const frame=new NineSliceSprite({
    texture:texture,
    leftWidth:left,
    topHeight:top,
    rightWidth:right,
    bottomHeight:bottom,
    width:bounds.width/scale,
    height:bounds.height/scale
  });
  return frame.scale.set(scale),
  frame.anchor.set(.5),
  frame.position.set(bounds.left+bounds.width/2, bounds.top+bounds.height/2),
  frame.eventMode="none",
  frame
}
/** One presentation clock, pooled gem views, and no independently timed ghost board. */
function buildMatch3Scene(app, initial = {}) {
  const root = new Container(), dragLayer = new Container(), effects = new Container();
  const gems = new Container(), boardMask = new Graphics();
  app.stage.addChild(root, gems, effects, boardMask, dragLayer);
  for (const layer of [gems, effects, dragLayer]) { layer.eventMode = 'none'; layer.interactiveChildren = false; }
  boardMask.eventMode = 'none';
  boardMask.visible = false;
  let data = initial, layout, drag = null, plan = null, elapsed = 0;
  let lastAnimationId = null, disposed = false, lastPhase = -1;
  let clock = createMatch3MotionClock(performance.now());
  const gemPool = [], burstPool = [];
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = !!motionQuery?.matches;
  let idleTimer = null, idleActor = null, idleSerial = 0;
  const idleAllowed = () => playing() && !locked() && !drag && !data.selectedGem && !data.match3?.activeBooster && data.match3?.idleMotion !== false && !reduced && !document.hidden && document.visibilityState !== 'hidden';
  function cancelIdle() {
    if (idleTimer !== null) window.clearTimeout?.(idleTimer);
    idleTimer = null; idleActor = null;
  }
  function syncIdle() {
    if (!idleAllowed()) { cancelIdle(); return; }
    if (idleTimer !== null || idleActor || !window.setTimeout) return;
    idleTimer = window.setTimeout(() => {
      idleTimer = null;
      if (disposed || !idleAllowed()) return;
      const candidates = boardPoses(currentBoard()).filter(pose => MATCH3_GEM_ART[pose.type]);
      if (!candidates.length) return;
      const pose = candidates[(idleSerial++ * 17 + 9) % candidates.length];
      idleActor = { x:pose.x, y:pose.y, started:performance.now() };
      render();
    }, 12000 + (idleSerial % 3) * 2000);
  }
  const dragVisual = makeRafScheduler(() => render());
  const playing = () => data.match3?.gameActive === true;
  const canAnimate = () => !!plan && playing() && !document.hidden && document.visibilityState !== 'hidden';
  const locked = () => !!plan || !!data.match3?.inputLocked;
  const currentBoard = () => data.match3?.board || data.fallbackBoard || [];
  const pointer = createPointerSession({
    onMove: point => {
      if (!drag) return;
      drag.x = point.x; drag.y = point.y;
      drag.target = match3TargetFromGesture(layout, drag, point);
      dragVisual.request();
    },
    onTap: point => {
      const from = point.data?.from || drag?.from;
      drag = null; dragVisual.cancel();
      if (from && playing() && !locked()) data.onMatch3Cell?.(from.x, from.y);
      render();
    },
    onDragEnd: point => {
      const gesture = drag;
      drag = null; dragVisual.cancel();
      if (gesture && playing() && !locked()) {
        const target = gesture.target || match3TargetFromGesture(layout, gesture, point);
        if (isAdjacentMatch3Cell(gesture.from, target)) data.onMatch3Swap?.(gesture.from, target);
        else data.onMatch3Cell?.(gesture.from.x, gesture.from.y);
      }
      render();
    },
    onCancel: () => { drag = null; dragVisual.cancel(); if (!disposed) render(); },
  });

  function gemView(index, type) {
    let view = gemPool[index];
    if (!view) {
      view = new Container();
      view.eventMode = 'none'; view.interactiveChildren = false;
      gems.addChild(view); gemPool.push(view);
    }
    if (view.gemType !== type || view.cell !== layout.cell) {
      view.gemType = type; view.cell = layout.cell;
      const asset = match3GemAsset(type);
      if (asset) {
        // Reorder/retype pooled actors by changing their cached texture rather
        // than allocating and deferred-destroying dozens of Sprites per phase.
        if (!view.art?.texture) { clear(view); view.art = spriteFit(asset, 0, 0, 1, 1, .98); view.addChild(view.art); }
        view.art.texture = Texture.from(asset);
        const dimensions = view.art.texture.orig;
        const scale = Math.min(layout.cell * .86 / dimensions.width, layout.cell * .86 / dimensions.height);
        view.art.width = dimensions.width * scale; view.art.height = dimensions.height * scale;
      } else {
        clear(view); view.art = label(DROP_ICONS[type] || GEM_ICONS[type] || '', 0, 0, layout.cell * .34, GEM_COLORS[type] || AMBER); view.addChild(view.art);
      }
    }
    return view;
  }

  function render() {
    if (!layout || disposed) return;
    const sample = plan ? sampleMatch3Motion(plan, elapsed) : { poses: boardPoses(currentBoard()), bursts: [], phaseIndex: -1, kind: 'idle' };
    if (plan && sample.done) { complete(); return; }
    if (plan && sample.phaseIndex !== lastPhase) {
      lastPhase = sample.phaseIndex;
      if (sample.kind === 'clear') data.onMatch3MotionPhase?.({ id: plan.id, combo: sample.combo, depth: plan.phases.slice(0, sample.phaseIndex + 1).filter(phase => phase.kind === 'clear').length, phase: sample.phaseIndex });
    }
    // The rectangular clip is needed only while a refill crosses the board
    // edge. Never pay for masked full-board passes on the idle touch surface.
    const needsClip = sample.poses.some(pose => pose.y < 0 || pose.y > BOARD_SIZE - 1);
    if (!!gems.mask !== needsClip) gems.mask = needsClip ? boardMask : null;
    boardMask.visible = needsClip;
    if (app.canvas?.dataset) {
      app.canvas.dataset.match3MotionPhase = sample.kind;
      app.canvas.dataset.match3MotionId = plan?.id || '';
      app.canvas.dataset.match3MotionElapsed = String(plan ? Math.round(elapsed) : 0);
      app.canvas.dataset.match3MotionDuration = String(plan?.duration || 0);
      app.canvas.dataset.match3InputLocked = String(locked());
      app.canvas.dataset.match3ReducedMotion = String(reduced);
    }
    if (idleActor && performance.now() - idleActor.started >= 720) idleActor = null;
    syncIdle();
    if (app.canvas?.dataset) {
      app.canvas.dataset.match3IdleActive = String(!!idleActor);
      app.canvas.dataset.match3IdleAllowed = String(idleAllowed());
    }
    const selected = data.selectedGem;
    sample.poses.forEach((pose, index) => {
      const view = gemView(index, pose.type);
      const center = cellCenter(layout, pose.x, pose.y);
      const picked = !plan && selected?.x === pose.x && selected?.y === pose.y;
      view.visible = true;
      view.position.set(center.x, center.y);
      view.scale.set(pose.scaleX * (picked ? 1.04 : 1), pose.scaleY * (picked ? 1.04 : 1));
      view.alpha = pose.alpha;
      view.rotation = 0;
      if (idleActor?.x === pose.x && idleActor?.y === pose.y) {
        const life = Math.sin(Math.PI * Math.min(1, (performance.now() - idleActor.started) / 720));
        view.rotation = life * .025;
        view.y -= life * layout.cell * .018;
      }
      // A swipe previews the target, without detaching a ghost from its source.
      if (drag?.from.x === pose.x && drag?.from.y === pose.y && !plan) view.scale.set(1.06);
    });
    for (let i = sample.poses.length; i < gemPool.length; i++) gemPool[i].visible = false;
    sample.bursts.forEach((burst, index) => {
      let view = burstPool[index];
      if (!view) {
        view = spriteFit(gameAsset(MATCH3_ASSET_KEYS.fxClearBurst), 0, 0, 1, 1, 1);
        view.eventMode = 'none'; effects.addChild(view); burstPool.push(view);
      }
      const center = cellCenter(layout, burst.x, burst.y), p = burst.progress;
      view.visible = true; view.position.set(center.x, center.y);
      const size = layout.cell * Math.min(.96, (.48 + p * .43) * (1 + Math.min(3, burst.combo - 1) * .02));
      view.width = size; view.height = size;
      view.rotation = burst.rotation;
      view.alpha = .44 * Math.sin(p * Math.PI);
    });
    for (let i = sample.bursts.length; i < burstPool.length; i++) burstPool[i].visible = false;
    clear(dragLayer);
    if (!plan && selected) dragLayer.addChild(strokedRect(layout.left + selected.x * layout.cell + 3, layout.top + selected.y * layout.cell + 3, layout.cell - 6, layout.cell - 6, AMBER, 8, 0xfff1e0, .06, 2));
    if (drag?.target) dragLayer.addChild(strokedRect(layout.left + drag.target.x * layout.cell + 2, layout.top + drag.target.y * layout.cell + 2, layout.cell - 4, layout.cell - 4, SKY, 8, 0xfff1e0, .05, 2));
    syncTicker();
    if (!app.ticker.started) app.render?.();
  }

  function complete() {
    const id = plan?.id;
    plan = null; elapsed = 0; lastPhase = -1;
    clock = createMatch3MotionClock(performance.now());
    render();
    if (id && !disposed) data.onMatch3AnimationComplete?.(id);
  }

  function syncAnimation() {
    const animation = data.match3Animation;
    if (!animation?.id) { plan = null; lastAnimationId = null; elapsed = 0; lastPhase = -1; clock = createMatch3MotionClock(performance.now()); return; }
    if (animation.id === lastAnimationId) return;
    lastAnimationId = animation.id;
    plan = createMatch3MotionPlan(animation, currentBoard(), reduced);
    elapsed = 0; lastPhase = -1;
    clock = createMatch3MotionClock(performance.now(), canAnimate());
  }

  function drawChrome() {
    root.cacheAsTexture?.(false);
    clear(root);
    const width = viewWidth(app), height = viewHeight(app);
    const composition = data.match3Composition?.width === width && data.match3Composition?.height === height
      ? data.match3Composition : composeMatch3({ width, height, hudLayout: data.hudLayout });
    layout = composition.board;
    const { left, top, size, cell } = layout;
    publishCanvasLayout(app, 'match3', { top, left, size });
    if (app.canvas?.dataset) {
      app.canvas.dataset.match3BoardFrameSize = String(composition.frame.width);
      app.canvas.dataset.match3BoardFrameInnerSize = String(size);
      app.canvas.dataset.puzzleArrangement = composition.landscape ? 'side' : 'stack';
    }
    publishCanvasAssetLayout(app, 'match3BoardFrameAsset', composition.frame);
    root.addChild(rect(left, top, size, size, 0x11092e, 4, 1));
    root.addChild(applyHudAssetRegion(createMatch3BoardFrame(composition.frame), data, 'match3BoardFrameAsset'));
    boardMask.clear().rect(left, top, size, size).fill({ color: 0xffffff });
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
      const cx = left + x * cell, cy = top + y * cell;
      root.addChild(spriteFit(match3ArtUrl('cell'), cx + cell / 2, cy + cell / 2, cell - 2, cell - 2, 1));
      // A hit area does not need a rendered transparent quad. Keeping these
      // renderless lets all 64 cell textures batch together on mobile WebGL.
      const hit = new Container();
      hit.hitArea = new Rectangle(cx, cy, cell, cell);
      hit.eventMode = 'static'; hit.cursor = 'pointer';
      hit.on('pointerdown', event => {
        event.stopPropagation?.();
        if (!playing() || locked()) return;
        drag = { from: { x, y }, pointerId: event.pointerId, startX: event.global.x, startY: event.global.y, x: event.global.x, y: event.global.y, target: null };
        pointer.start(event, { kind: 'match3-cell', from: { x, y } });
        render();
      });
      root.addChild(hit);
    }
    // Frame art + 64 cell skins are static. Flatten their overlapping texture
    // passes once at the actual backing density, outside the animation timeline.
    // Cached containers retain their children/hit areas for Pixi event routing.
    const cacheResolution = app.renderer.resolution || 1;
    root.cacheAsTexture?.({ resolution: cacheResolution, antialias: false });
    if (app.canvas?.dataset) {
      app.canvas.dataset.match3ChromeCached = String(!!root.isCachedAsTexture);
      app.canvas.dataset.match3ChromeCacheResolution = String(cacheResolution);
    }
  }

  const detachStage = setupStage(app, pointer.move, pointer.end, () => pointer.cancel('stage'));
  function syncTicker() {
    const motionRunning = canAnimate();
    const running = motionRunning || !!idleActor;
    if (clock.running !== motionRunning) advanceClock(motionRunning);
    if (running) app.start?.();
    else app.stop?.();
  }
  function advanceClock(running = canAnimate()) {
    clock = advanceMatch3MotionClock(clock, performance.now(), running);
    elapsed = clock.elapsed;
  }
  const onVisibility = () => { advanceClock(); syncTicker(); if (!canAnimate()) render(); };
  const onPreference = () => {
    reduced = !!motionQuery?.matches;
    // A preference change settles an accepted move exactly once, never replays it.
    if (plan) complete(); else render();
  };
  document.addEventListener('visibilitychange', onVisibility);
  motionQuery?.addEventListener?.('change', onPreference);
  const tick = () => {
    advanceClock();
    if (!canAnimate() && !idleActor) { app.stop?.(); return; }
    render();
  };
  app.ticker.add(tick);
  drawChrome(); syncAnimation(); render();
  return {
    update(next = {}) {
      advanceClock();
      const oldLayout = data.match3Composition;
      data = next;
      if (!playing()) pointer.cancel('pause');
      syncAnimation();
      // Commit a genuine pause/resume boundary before drawing. An ordinary
      // active update must not exclude its own chrome/render work from time.
      advanceClock();
      if (oldLayout !== data.match3Composition) drawChrome();
      render();
    },
    resize(next = data) {
      pointer.cancel('resize'); data = next;
      drawChrome(); syncAnimation(); render();
    },
    destroy() {
      disposed = true; cancelIdle(); detachStage(); app.ticker.remove(tick); dragVisual.cancel(); pointer.cancel('destroy');
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery?.removeEventListener?.('change', onPreference);
      plan = null;
      root.cacheAsTexture?.(false);
      gems.mask = null; effects.mask = null;
      for (const layer of [root, gems, effects, boardMask, dragLayer]) layer.destroy({ children: true });
    },
  };
}

export { buildMatch3Scene, createMatch3BoardFrame };
