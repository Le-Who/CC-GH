import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createDefaultPlayer, createGardenEconomyState, getGardenXpRequired } from '../../game-logic.js';
import { PLANT_TYPES } from '../../game-logic/garden-shelf-plants.js';
import { migrateGardenR2, validateGardenR2Player } from '../../game-logic/garden-r2/domain.js';
import { applyActionWithReceipt, buildSnapshot } from '../../routes/player.js';
import geometry from '../../src/games/garden-shelf/living/plant-geometry.json' with { type: 'json' };
import { gardenDiagnostics } from './helpers/gardenDiagnostics.js';

// Expected support UV is reviewed against exact image bytes. No production
// fitting/layout helper supplies an expected consumer position in this test.
const assets = geometry.assets;
const species = Object.keys(PLANT_TYPES);

function fixture(phase) {
  const now = Date.now();
  const player = createDefaultPlayer(`anchor-${phase}-${now}-${Math.random()}`, 'Anchors', now);
  player.resources.gold = 100000;
  player.garden = {
    ...createGardenEconomyState(now), name: 'Anchor Garden',
    level: 30, xp: 0, xpRequired: getGardenXpRequired(30), levelReady: false, shelvesUnlocked: 5,
    plants: species.map((type, index) => ({ id: `anchor-${type}`, type, level: 12,
      shelfIndex: Math.floor(index / 3), spotIndex: index % 3, phase, phaseProgress: 0,
      lastTapped: 0, lastWatered: now })),
  };
  const adopted = migrateGardenR2(player, { now, legacyRevision: 0, acknowledgedTotal: 0 });
  validateGardenR2Player(adopted);
  return adopted;
}

async function mount(page, player, renderer) {
  await page.addInitScript(({ accountId, renderer }) => {
    localStorage.setItem('gh_dev_user_id', accountId);
    localStorage.setItem('garden_shelf_language', 'en');
    if (renderer === 'static') {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        return /^(webgl|webgl2|experimental-webgl)$/.test(kind) ? null : original.call(this, kind, ...args);
      };
    }
  }, { accountId: player.id, renderer });
  await page.route(/\/api\/player\/snapshot(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(buildSnapshot(player)),
  }));
  await page.route('**/api/player/mutate', async route => {
    const body = route.request().postDataJSON();
    const result = await applyActionWithReceipt(player, body.action, body.payload || {}, { clientActionId: body.clientActionId });
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) });
  });
  await page.goto('/');
  await expect(page.locator('.gs2-spot[data-plant-id]')).toHaveCount(14);
  await expect(page.locator('.gs2-empty-target')).toHaveCount(1);
  await expect(page.locator('.gs2-plant-target').first()).toBeEnabled();
  await page.locator('.active-game-frame').evaluate(async node => {
    await Promise.all(node.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    await document.fonts.ready;
  });
}

function anchor(rect, uv) {
  return { x: rect.left + uv.centerX * rect.width, y: rect.top + uv.baseY * rect.height, width: uv.width * rect.width };
}

function supportMatches(rect, slot, uv, description) {
  const actual = anchor(rect, uv);
  expect(Math.abs(actual.x - (slot.left + slot.width / 2)), `${description} pot center`).toBeLessThan(.12);
  expect(Math.abs(actual.y - slot.bottom), `${description} standing baseline`).toBeLessThan(.12);
  return actual;
}

async function readRow(row, page) {
  return row.evaluate(node => {
    const rect = element => element.getBoundingClientRect().toJSON();
    const scroll = node.closest('.gs2-shelf-viewport');
    const plants = [...node.querySelectorAll('[data-plant-id]')].map(spot => {
      const art = spot.querySelector('.gs2-live-plant'), image = art.querySelector('img');
      const name = spot.querySelector('[data-plant-details-button]'), target = spot.querySelector('.gs2-plant-target');
      const brokenWords = [];
      for (const label of name.querySelectorAll('.gs2-plant-name')) {
        const text = label.firstChild;
        for (const match of text?.textContent.matchAll(/\S+/gu) || []) {
          const range = document.createRange(); range.setStart(text, match.index); range.setEnd(text, match.index + match[0].length);
          if (new Set([...range.getClientRects()].map(r => Math.round(r.top * 2) / 2)).size > 1) brokenWords.push(match[0]);
        }
      }
      return { id: spot.dataset.plantId, key: new URL(image.src).pathname.split('/').pop(),
        image: rect(image), natural: [image.naturalWidth, image.naturalHeight], slot: rect(art), target: rect(target), name: rect(name),
        mode: art.dataset.livingMode, imageVisibility: getComputedStyle(image).visibility, brokenWords,
        unclippedAncestors: [art, target, spot].map(n => ({ overflow: getComputedStyle(n).overflow, rect: rect(n) })) };
    });
    return { plants, scroll: rect(scroll), root: rect(document.querySelector('.gs2-terrarium')),
      shelf: rect(node.querySelector('.gs2-shelf-art')), row: rect(node),
      diagnostic: window.__GARDEN_LIVING_QA__?.snapshot() };
  });
}

for (const [width, height] of [[320, 568], [1280, 720]]) for (const renderer of ['WebGL', 'static']) {
  test.describe(`Plant anchors ${width}x${height} ${renderer}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: width === 320 ? 2 : 1,
      isMobile: width === 320, hasTouch: width === 320, serviceWorkers: 'block' });
    test('all 56 phase images and empty pot stand on their actual support anchors', async ({ page }, testInfo) => {
      test.setTimeout(180000);
      const diagnostics = gardenDiagnostics(page, testInfo, 'anchors'), observations = [];
      const seen = new Set(), hanging = [], potWidths = new Map();
      const persist = () => writeFileSync(testInfo.outputPath('anchor-consumers.json'), JSON.stringify(observations, null, 2));
      try {
        for (let phase = 0; phase < 4; phase++) {
          diagnostics.mark(`phase-${phase}`);
          await page.unrouteAll({ behavior: 'wait' });
          await mount(page, fixture(phase), renderer);
          for (const row of await page.locator('.gs2-shelf-row').all()) {
            await row.locator('.gs2-plant-target').first().scrollIntoViewIfNeeded();
            await expect.poll(() => row.locator('.gs2-live-plant img').evaluateAll(nodes => nodes.every(n => n.complete && n.naturalWidth > 1))).toBe(true);
            if (renderer === 'WebGL') {
              await expect.poll(() => row.locator('.gs2-live-plant').evaluateAll(nodes => nodes.every(n => ['animated', 'reduced'].includes(n.dataset.livingMode)))).toBe(true);
              await expect.poll(() => row.evaluate(node => {
                const plants = window.__GARDEN_LIVING_QA__.snapshot().surfaces.flatMap(s => s.plants);
                return [...node.querySelectorAll('[data-plant-id]')].every(n => plants.some(p => p.id === n.dataset.plantId && p.drawnKey && p.drawRect && p.clip));
              })).toBe(true);
            } else await expect(row.locator('.gs2-live-plant').first()).toHaveAttribute('data-living-mode', 'static-fallback');
            const observation = await readRow(row, page);
            observations.push({ phase, renderer, ...observation }); persist();
            for (const plant of observation.plants) {
              const asset = assets[plant.key];
              expect(asset?.review.status).toBe('reviewed');
              expect(asset.phase).toBe(phase);
              expect(plant.natural).toEqual([asset.sourceSize.width, asset.sourceSize.height]);
              const support = supportMatches(plant.image, plant.slot, asset.pot, `${plant.key} DOM`);
              const widths = potWidths.get(asset.type) || []; widths.push(support.width); potWidths.set(asset.type, widths);
              expect(plant.brokenWords).toEqual([]);
              expect(plant.name.height).toBeGreaterThanOrEqual(43.9);
              expect(plant.name.width).toBeGreaterThanOrEqual(43.9);
              const paintedTop = plant.image.top + asset.paintedBounds.y * plant.image.height;
              expect(Math.abs(plant.name.bottom - Math.max(plant.slot.top, paintedTop - 6)), `${plant.key} name follows its actual canopy with a six-pixel gap`).toBeLessThan(.2);
              expect(plant.target.width).toBeGreaterThanOrEqual(43.9);
              expect(plant.target.height).toBeGreaterThanOrEqual(43.9);
              const shelfY = (support.y - observation.shelf.top) / observation.shelf.height * 251;
              // This is an optical wood region, not a source support anchor.
              // Account for desktop scrollbar width in the rendered plank.
              expect(Math.abs(shelfY - 75.3), `${plant.key} raised top-wood standing plane`).toBeLessThan(3);
              if (renderer === 'WebGL') {
                expect(plant.imageVisibility).toBe('hidden');
                const drawn = observation.diagnostic.surfaces.flatMap(s => s.plants).find(p => p.id === plant.id);
                expect(drawn.drawnKey).toBe(plant.key);
                supportMatches(drawn.drawRect, plant.slot, asset.pot, `${plant.key} WebGL draw`);
                for (const edge of ['left', 'top']) expect(drawn.clip[edge]).toBeGreaterThanOrEqual(observation.scroll[edge] - .1);
                for (const edge of ['right', 'bottom']) expect(drawn.clip[edge]).toBeLessThanOrEqual(observation.scroll[edge] + .1);
                const paintedBottom = drawn.drawRect.top + (asset.paintedBounds.y + asset.paintedBounds.height) * drawn.drawRect.height;
                if (asset.type === 'string_of_pearls' && phase === 3) {
                  expect(paintedBottom).toBeGreaterThan(plant.slot.bottom + 10);
                  expect(drawn.clip.bottom, 'hanging foliage survives the support slot').toBeGreaterThan(plant.slot.bottom + 10);
                  expect(drawn.clip.bottom).toBeCloseTo(Math.min(drawn.drawRect.bottom, observation.scroll.bottom, observation.root.bottom), 0);
                  hanging.push(plant.key);
                }
              } else {
                expect(plant.imageVisibility).toBe('visible');
                for (const ancestor of plant.unclippedAncestors) expect(ancestor.overflow).toBe('visible');
              }
              seen.add(plant.key);
            }
          }
          const empty = await page.locator('.gs2-empty-pot').evaluate(node => ({ slot: node.getBoundingClientRect().toJSON(), spot: node.closest('.gs2-spot').getBoundingClientRect().toJSON(), image: node.querySelector('img').getBoundingClientRect().toJSON(), name: node.parentElement.querySelector('.gs2-empty-name').getBoundingClientRect().toJSON() }));
          observations.push({ phase, empty }); persist();
          const emptySupport = supportMatches(empty.image, empty.slot, assets['pot.webp'].pot, 'empty DOM');
          const emptyPaintedTop = empty.image.top + assets['pot.webp'].paintedBounds.y * empty.image.height;
          expect(Math.abs(empty.name.bottom - Math.max(empty.slot.top, emptyPaintedTop - 6)), 'empty name follows its painted pot').toBeLessThan(.2);
          expect(emptySupport.width).toBeLessThanOrEqual(Math.min(50, empty.spot.width * .3) + .1);
          for (const values of potWidths.values()) expect(emptySupport.width).toBeLessThan(Math.min(...values));
          await page.screenshot({ path: testInfo.outputPath(`phase-${phase}-last-shelf.png`) });
        }
        expect(seen.size).toBe(56);
        for (const [type, widths] of potWidths) expect(Math.max(...widths) - Math.min(...widths), `${type} pot scale remains stable through four phases`).toBeLessThan(.15);
        if (renderer === 'WebGL') expect(hanging).toEqual(['string-of-pearls-mature-r1.webp']);
        else await expect(page.locator('.gs2-live-surface')).toHaveCount(0);
        expect(diagnostics.errors).toEqual([]); diagnostics.complete();
      } catch (error) {
        diagnostics.fail(error); persist();
        try {
          await page.screenshot({ path: testInfo.outputPath('anchor-failure.png') });
          await testInfo.attach('anchor-failure-state', { body: JSON.stringify(await page.evaluate(() => ({ url: location.href,
            controls: [...document.querySelectorAll('.gs2-stage button')].map(n => ({ name: n.getAttribute('aria-label') || n.textContent, disabled: n.disabled })),
            diagnostics: window.__GARDEN_LIVING_QA__?.snapshot() }))), contentType: 'application/json' });
        } catch (captureError) { await testInfo.attach('capture-error', { body: String(captureError), contentType: 'text/plain' }); }
        throw error;
      } finally { diagnostics.dispose(); }
    });
  });
}

test.describe('Plant growth support first frame', () => {
  test.use({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', reducedMotion: 'no-preference' });
  test('Basil and Orchid retain both source support anchors at mix zero and halfway', async ({ page }, testInfo) => {
    const diagnostics = gardenDiagnostics(page, testInfo, 'growth-support');
    try {
      await mount(page, fixture(0), 'WebGL');
      const sourceKeys = ['basil', 'orchid'].map(type => [0, 1].map(phase => Object.keys(assets).find(key => assets[key].type === type && assets[key].phase === phase)));
      const samples = await page.evaluate(async sourceKeys => {
        const { PlantSurface } = await import('/src/games/garden-shelf/living/living-plant-art.mjs');
        const results = [];
        for (const [previousKey, currentKey] of sourceKeys) {
          const root = document.createElement('div'); root.className = 'gs2-terrarium';
          Object.assign(root.style, { position: 'fixed', left: '20px', top: '20px', width: '360px', height: '400px', zIndex: '999', border: '0', padding: '0' });
          const target = document.createElement('div'); target.className = 'gs2-plant-target';
          Object.assign(target.style, { position: 'absolute', left: '100px', top: '60px', width: '120px', height: '220px', padding: '0', border: '0' });
          const node = document.createElement('span'); node.className = 'gs2-live-plant';
          Object.assign(node.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
          node.append(document.createElement('img')); target.append(node); root.append(target); document.body.append(root);
          const manager = new PlantSurface(root);
          cancelAnimationFrame(manager.frame); manager.wake = () => {};
          const type = previousKey.split('-')[0], state = { id: `controlled-${type}`, type, phase: 0, lastWatered: 0 };
          const item = manager.add(node, state);
          manager.observer.disconnect();
          try {
            await manager.load(previousKey);
            await Promise.all([...manager.pending.values()]);
            const now = performance.now();
            manager.lastDraw = -Infinity; manager.draw(now); cancelAnimationFrame(manager.frame);
            manager.update(item, { ...state, phase: 1 });
            await manager.load(currentKey);
            await Promise.all([...manager.pending.values()]);
            // The production clock caps a single frame delta at 50ms. Advance
            // real frame steps so the second observation is halfway through.
            for (let offset = 100; offset <= 700; offset += 50) {
              manager.lastDraw = -Infinity; manager.draw(now + offset); cancelAnimationFrame(manager.frame);
              if (offset !== 100 && offset !== 700) continue;
              const gl = manager.gl;
              results.push({ type, previousKey, currentKey, offset, mix: gl.getUniform(manager.program, manager.growthMix),
                currentFrame: Array.from(gl.getUniform(manager.program, manager.currentFrame)),
                previousFrame: Array.from(gl.getUniform(manager.program, manager.previousFrame)),
                viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
                root: root.getBoundingClientRect().toJSON(), slot: node.getBoundingClientRect().toJSON(),
                dpr: Math.min(devicePixelRatio || 1, 2, 4096 / root.clientWidth, 4096 / root.clientHeight),
                canvasHeight: manager.canvas.height, drawCount: item.drawCount });
            }
          } finally { manager.dispose(); root.remove(); }
        }
        return results;
      }, sourceKeys);
      writeFileSync(testInfo.outputPath('growth-gpu-frames.json'), JSON.stringify(samples, null, 2));
      expect(samples).toHaveLength(4);
      for (const sample of samples) {
        expect(sample.drawCount).toBeGreaterThan(1);
        expect(sample.mix).toBeCloseTo(sample.offset === 100 ? 0 : .5, 5);
        // Map the shader's actual UV frames through its actual GL viewport.
        // A mix-zero regression that uses the current-only quad moves the old pot.
        const [vx, vy, vw, vh] = sample.viewport;
        const quad = { left: sample.root.left + vx / sample.dpr,
          top: sample.root.top + (sample.canvasHeight - vy - vh) / sample.dpr,
          width: vw / sample.dpr, height: vh / sample.dpr };
        for (const [key, frame] of [[sample.previousKey, sample.previousFrame], [sample.currentKey, sample.currentFrame]]) {
          const pot = assets[key].pot;
          const supportX = quad.left + (frame[0] + pot.centerX * frame[2]) * quad.width;
          const supportY = quad.top + (frame[1] + pot.baseY * frame[3]) * quad.height;
          expect(Math.abs(supportX - (sample.slot.left + sample.slot.width / 2)), `${sample.type} ${sample.mix} ${key} GPU center`).toBeLessThan(.8);
          expect(Math.abs(supportY - sample.slot.bottom), `${sample.type} ${sample.mix} ${key} GPU base`).toBeLessThan(.8);
        }
      }
      expect(diagnostics.errors).toEqual([]); diagnostics.complete();
    } catch (error) {
      diagnostics.fail(error);
      await page.screenshot({ path: testInfo.outputPath('growth-support-failure.png') });
      throw error;
    } finally { diagnostics.dispose(); }
  });
});
