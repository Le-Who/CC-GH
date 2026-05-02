let platformState = {
  initialized: false,
  inTelegram: false,
  rawInitData: "",
  user: null,
};

let telegramSdkPromise = null;

function loadTelegramSdk() {
  telegramSdkPromise ||= import("@telegram-apps/sdk").catch(() => null);
  return telegramSdkPromise;
}

function readWindowTelegram() {
  try {
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

function readRawInitDataFromWindow() {
  return readWindowTelegram()?.initData || "";
}

function readUserFromWindow() {
  return readWindowTelegram()?.initDataUnsafe?.user || null;
}

function readRawInitData(sdk = null) {
  try {
    return sdk?.retrieveRawInitData?.() || sdk?.initDataRaw?.() || readRawInitDataFromWindow();
  } catch {
    return readRawInitDataFromWindow();
  }
}

function readUser(sdk = null) {
  try {
    return sdk?.initDataUser?.() || readUserFromWindow();
  } catch {
    return readUserFromWindow();
  }
}

export async function initTelegramPlatform() {
  if (platformState.initialized) return platformState;

  const cleanup = [];
  const sdk = await loadTelegramSdk();
  try {
    cleanup.push(sdk?.init?.({ acceptCustomStyles: true }));
    if (!sdk?.isMiniAppMounted?.()) sdk?.mountMiniApp?.();
    sdk?.mountViewport?.();
    sdk?.mountSwipeBehavior?.();
    sdk?.bindMiniAppCssVars?.();
    sdk?.bindViewportCssVars?.();
    sdk?.expandViewport?.();
    sdk?.miniAppReady?.();
  } catch {
    // Local browser/dev mode is allowed; auth will decide if dev credentials are accepted.
  }

  const rawInitData = readRawInitData(sdk);
  const user = readUser(sdk);
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
  return platformState.rawInitData || readRawInitDataFromWindow();
}

export function getTelegramUser() {
  return platformState.user || readUserFromWindow();
}

export function setGameGestureActive(active) {
  void loadTelegramSdk().then((sdk) => {
    try {
      if (!sdk?.isSwipeBehaviorSupported?.()) return;
      if (active) sdk.disableVerticalSwipes?.();
      else sdk.enableVerticalSwipes?.();
    } catch {
      // Unsupported Telegram clients and local browsers can ignore this.
    }
  });
}

export function haptic(type = "light") {
  void loadTelegramSdk().then((sdk) => {
    try {
      if (!sdk?.isHapticFeedbackSupported?.()) return;
      if (type === "success" || type === "warning" || type === "error") {
        sdk.hapticFeedbackNotificationOccurred?.(type);
      } else {
        sdk.hapticFeedbackImpactOccurred?.(type);
      }
    } catch {
      // Haptics are progressive enhancement.
    }
  });
}
