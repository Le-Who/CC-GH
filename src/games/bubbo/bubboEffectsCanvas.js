import { bubboCellCenter } from './bubboAim.js';
import { sampleBubboEffect } from './bubboEffects.js';

const WATER_LIGHT = '#cdfaff';
const PEARL_LIGHT = '#fff6cf';

/** Procedural light only; all token silhouettes still use the reviewed marine art. */
export function paintBubboGlint(ctx, x, y, cell, strength) {
  if (strength <= .005) return;
  const radius = cell * .1;
  ctx.save();
  ctx.translate(x - cell * .19, y - cell * .23);
  ctx.globalAlpha = strength * .42;
  const light = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  light.addColorStop(0, '#ffffff');
  light.addColorStop(.28, '#f3ffffb0');
  light.addColorStop(1, '#e2ffff00');
  ctx.fillStyle = light;
  ctx.scale(1.6, .68);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function paintBubboEffects(ctx, effects, geometry, drawToken, reducedMotion = false) {
  if (!effects.length) return;
  ctx.save();
  // Secondary feedback stays out of the cannon/current/next-shot lane.
  ctx.beginPath();
  ctx.rect(geometry.left - geometry.radius, 0, geometry.right - geometry.left + geometry.radius * 2,
    Math.min(geometry.dangerY + geometry.radius, geometry.cannonY - geometry.cell));
  ctx.clip();
  for (const effect of effects) {
    // Honor a live OS preference change even for a burst already in progress.
    const sample = sampleBubboEffect(reducedMotion ? { ...effect, reducedMotion: true } : effect);
    if (!sample.visible) continue;
    const { x, y } = bubboCellCenter(geometry, effect.row, effect.col, effect.rowOffset, effect.pressureStep);
    const p = sample.progress;
    if(sample.waiting){
      if(effect.kind!=='hit')drawToken(effect.color, x, y, geometry.cell * .99);
      continue;
    }
    if (effect.kind === 'drop') {
      drawToken(effect.color, x + sample.x * geometry.cell, y + sample.y * geometry.cell,
        geometry.cell * .99 * sample.scale, sample.alpha, sample.rotation);
      continue;
    }
    if (effect.kind === 'pop' && (reducedMotion || effect.reducedMotion || p < .27)) {
      drawToken(effect.color, x, y, geometry.cell * .99 * sample.scale,
        sample.alpha * (reducedMotion || effect.reducedMotion ? 1 : 1 - p / .27));
    }
    ctx.save();
    ctx.globalAlpha = sample.alpha * (effect.kind === 'hit' ? .65 : .72);
    ctx.strokeStyle = effect.kind === 'hit' ? WATER_LIGHT : PEARL_LIGHT;
    ctx.lineWidth = Math.max(1, geometry.cell * .04) * (1 - p * .6);
    ctx.beginPath();
    const radius = geometry.radius * (reducedMotion || effect.reducedMotion ? .9 : .65 + p * .55);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Two soft water droplets per pop; bounded by the descriptor budget, no emitter.
    if (effect.kind === 'pop' && !reducedMotion && !effect.reducedMotion) {
      ctx.fillStyle = WATER_LIGHT;
      for (let index = 0; index < 2; index++) {
        const angle = -.8 - index * 1.7 + (effect.col % 3) * .25;
        const travel = geometry.radius * (.62 + p * .7);
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * travel, y + Math.sin(angle) * travel,
          Math.max(.5, geometry.cell * .035) * (1 - p * .7), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
