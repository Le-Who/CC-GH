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
  return { width, height, gutter, gap, hudHeight, contentHeight: Math.max(0, height - hudHeight - gap), landscape, answerColumns: landscape ? 2 : 1, answerMinHeight: 58, controlMinSize: 44, minContentHeight: landscape ? 360 : 480, boundedScroll: height < (landscape ? 360 : 480) };
}
