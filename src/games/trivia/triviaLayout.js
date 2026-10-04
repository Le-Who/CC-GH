/** Remaining safe area after the production App has padded/positioned the local stage.
 * The provider reports viewport insets, not already-consumed local insets. */
export function resolveTriviaRemainingInsets(viewport = {}, bounds = null) {
  const number = value => Math.max(0, Number(value) || 0);
  const safe = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, number(viewport.safeAreaInsets?.[side])]));
  if (!bounds) return safe;
  const width = number(viewport.layoutViewport?.width ?? viewport.width);
  const height = number(viewport.layoutViewport?.height ?? viewport.height);
  return {
    top: Math.max(0, safe.top - number(bounds.top)),
    right: Math.max(0, safe.right - Math.max(0, width - Number(bounds.right))),
    bottom: Math.max(0, safe.bottom - Math.max(0, height - Number(bounds.bottom))),
    left: Math.max(0, safe.left - number(bounds.left)),
  };
}

/** DOM flow adapter. Inputs are usable local bounds: host consumes Telegram insets once. */
export function resolveTriviaLayout(viewport = {}, regions = {}) {
  const safe = viewport.safeAreaInsets || {};
  const spec = regions.triviaQuestionPanel || {};
  const gutter = Math.max(8, Number(spec.padding ?? 12));
  const width = Math.max(1, Number(viewport.width || 390) - (safe.left || 0) - (safe.right || 0) - gutter * 2);
  const height = Math.max(1, Number(viewport.height || 844) - (safe.top || 0) - (safe.bottom || 0) - gutter * 2);
  const hudHeight = Number(regions.gameplayHud?.height ?? 68);
  const gap = Number(spec.gap ?? 12);
  const landscape = Number(viewport.width || 390) > Number(viewport.height || 844);
  // answerColumns is the landscape maximum; the CSS panel uses auto-fit to
  // reduce to one column whenever two readable answer labels cannot fit.
  return { width, height, gutter, gap, hudHeight, contentHeight: Math.max(0, height - hudHeight - gap), landscape, answerColumns: landscape ? 2 : 1, answerMinHeight: 58, controlMinSize: 44, minContentHeight: landscape ? 360 : 480, boundedScroll: height < (landscape ? 360 : 480) };
}
