/**
 * Production boundary for the v2 arcade presentations.
 * Each game's scoped .telegram-app.play-mode.immersive-mode CSS consumes all
 * four --safe-* insets. The measured child stage is therefore already safe.
 * Passing raw viewport insets into composition again would double-pad it.
 * Revisit this adapter together with those three scoped shell CSS rules.
 */
export function remainingArcadeSafeInsets() {
  return {top: 0, bottom: 0, left: 0, right: 0};
}
