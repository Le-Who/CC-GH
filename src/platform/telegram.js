import {
  bindMiniAppCssVars,
  bindViewportCssVars,
  disableVerticalSwipes,
  enableVerticalSwipes,
  expandViewport,
  hapticFeedbackImpactOccurred,
  hapticFeedbackNotificationOccurred,
  init,
  initDataRaw,
  initDataUser,
  isHapticFeedbackSupported,
  isMiniAppMounted,
  isSwipeBehaviorSupported,
  miniAppReady,
  mountMiniApp,
  mountSwipeBehavior,
  mountViewport,
  retrieveRawInitData,
} from "@telegram-apps/sdk";

let platformState = {
  initialized: false,
  inTelegram: false,
  rawInitData: "",
  user: null,
};

function readRawInitData() {
  try {
    return retrieveRawInitData() || initDataRaw() || "";
  } catch {
    return window.Telegram?.WebApp?.initData || "";
  }
}

function readUser() {
  try {
    return initDataUser() || window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  } catch {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  }
}

export async function initTelegramPlatform() {
  if (platformState.initialized) return platformState;

  const cleanup = [];
  try {
    cleanup.push(init({ acceptCustomStyles: true }));
    if (!isMiniAppMounted()) mountMiniApp();
    mountViewport();
    mountSwipeBehavior();
    bindMiniAppCssVars();
    bindViewportCssVars();
    expandViewport();
    miniAppReady();
  } catch {
    // Local browser/dev mode is allowed; auth will decide if dev credentials are accepted.
  }

  const rawInitData = readRawInitData();
  const user = readUser();
  platformState = {
    initialized: true,
    inTelegram: !!rawInitData,
    rawInitData,
    user,
    cleanup,
  };
  return platformState;
}

export function getTelegramAuthData() {
  return platformState.rawInitData || readRawInitData();
}

export function getTelegramUser() {
  return platformState.user || readUser();
}

export function setGameGestureActive(active) {
  try {
    if (!isSwipeBehaviorSupported()) return;
    if (active) disableVerticalSwipes();
    else enableVerticalSwipes();
  } catch {
    // Unsupported Telegram clients and local browsers can ignore this.
  }
}

export function haptic(type = "light") {
  try {
    if (!isHapticFeedbackSupported()) return;
    if (type === "success" || type === "warning" || type === "error") {
      hapticFeedbackNotificationOccurred(type);
    } else {
      hapticFeedbackImpactOccurred(type);
    }
  } catch {
    // Haptics are progressive enhancement.
  }
}
