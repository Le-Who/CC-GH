// Runs in the game document; intentionally standalone for CDP serialization.
// Live pressure-meter transitions are not evidence of unfinished game actions.
export function animationSnapshot(doc) {
  const finite = [], details = [], ignoredLive = [], ignoredInfinite = [];
  for (const animation of doc.getAnimations?.() || []) {
    if (animation.playState !== 'running') continue;
    const target = animation.effect?.target;
    const detail = {
      kind: animation.constructor?.name || 'Animation',
      property: animation.transitionProperty || null,
      name: animation.animationName || null,
      target: target ? `${target.tagName?.toLowerCase() || '?'}${target.id ? '#' + target.id : ''}${typeof target.className === 'string' && target.className ? '.' + target.className.trim().split(/\s+/).join('.') : ''}` : null,
      parentClass: target?.parentElement?.className || null,
      endTime: animation.effect?.getComputedTiming().endTime ?? null,
    };
    if (!Number.isFinite(detail.endTime)) { ignoredInfinite.push(detail); continue; }
    const livePressure = detail.kind === 'CSSTransition' && detail.property === 'width'
      && target?.matches?.('.bb-pressure > i > b')
      && target?.closest?.('.bb-stage')
      && doc.querySelector('[data-testid="bb-field"]');
    if (livePressure) { ignoredLive.push({ ...detail, reason: 'Bubbo live pressure timer width' }); continue; }
    finite.push(animation); details.push(detail);
  }
  return { finite, details, ignoredLive, ignoredInfinite };
}
