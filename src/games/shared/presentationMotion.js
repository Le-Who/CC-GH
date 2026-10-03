/** Settle only cosmetic DOM animations. No timers, progression, or transactions. */
export function settlePresentationMotion(node, { cancel = false } = {}) {
  for (const animation of node?.getAnimations?.({ subtree: true }) || []) {
    try {
      if (cancel || animation.effect?.getTiming?.().iterations === Infinity) animation.cancel();
      else animation.finish();
    } catch { animation.cancel(); }
  }
}

export function installPresentationMotion(node, { windowTarget = globalThis.window, documentTarget = globalThis.document } = {}) {
  if (!node || !windowTarget || !documentTarget) return () => {};
  const suspend = () => { node.dataset.motionSuspended = 'true'; settlePresentationMotion(node); };
  const resume = () => {
    // A server result may have arrived while hidden: settle it before revealing.
    settlePresentationMotion(node);
    if (!documentTarget.hidden) delete node.dataset.motionSuspended;
  };
  const visibility = () => documentTarget.hidden ? suspend() : resume();
  const resize = () => settlePresentationMotion(node);
  windowTarget.addEventListener('blur', suspend);
  windowTarget.addEventListener('focus', resume);
  windowTarget.addEventListener('resize', resize);
  windowTarget.addEventListener('orientationchange', resize);
  documentTarget.addEventListener('visibilitychange', visibility);
  if (documentTarget.hidden) suspend();
  return () => {
    windowTarget.removeEventListener('blur', suspend);
    windowTarget.removeEventListener('focus', resume);
    windowTarget.removeEventListener('resize', resize);
    windowTarget.removeEventListener('orientationchange', resize);
    documentTarget.removeEventListener('visibilitychange', visibility);
    settlePresentationMotion(node, { cancel: true });
  };
}

export function sampleWellAtPoint(wells, x, y) {
  return wells.findIndex(well => {
    const rect = well?.getBoundingClientRect();
    return rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });
}
