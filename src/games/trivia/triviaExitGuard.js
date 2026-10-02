/** Native page navigation can warn/freeze, but cannot guarantee authenticated async cleanup. */
export function installTriviaExitGuard(target, controller) {
  const beforeUnload = event => {
    const s = controller.getSnapshot();
    if (!s.question && !s.roomId && !s.busy) return;
    event.preventDefault();
    event.returnValue = '';
  };
  const hide = () => controller.setBackground(true);
  const show = () => controller.setBackground(!!target.document?.hidden);
  target.addEventListener('beforeunload', beforeUnload);
  target.addEventListener('pagehide', hide);
  target.addEventListener('pageshow', show);
  return () => {
    target.removeEventListener('beforeunload', beforeUnload);
    target.removeEventListener('pagehide', hide);
    target.removeEventListener('pageshow', show);
  };
}
