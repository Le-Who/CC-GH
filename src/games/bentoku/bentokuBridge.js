import { GAME_REGISTRY } from '../../app/gameRegistry.js';

export const BENTOKU_URL = GAME_REGISTRY.bentoku.hostedUrl;
export const BENTOKU_ORIGIN = new URL(BENTOKU_URL).origin;

// The hosted game receives lifecycle messages only, never Telegram initData,
// player snapshots, credentials, or shared-economy actions.
export function connectBentokuFrame({ targetWindow = window, frameWindow, onReady }) {
  let visible = true;
  let disposed = false;
  const send = data => {
    if (!disposed) frameWindow?.postMessage({ ...data, version: 1 }, BENTOKU_ORIGIN);
  };
  const sendVisibility = () => send({ type: 'ccgh:bentoku:visibility', visible });
  const receive = event => {
    if (disposed || event.origin !== BENTOKU_ORIGIN || event.source !== frameWindow) return;
    if (event.data?.type !== 'bentoku:ready' || event.data.version !== 1) return;
    sendVisibility();
    onReady?.();
  };
  targetWindow.addEventListener('message', receive);
  return {
    connect() { send({ type: 'ccgh:bentoku:connect' }); },
    setVisible(value) { visible = value === true; sendVisibility(); },
    destroy() {
      if (disposed) return;
      visible = false;
      sendVisibility();
      disposed = true;
      targetWindow.removeEventListener('message', receive);
    },
  };
}
