import { useEffect } from "react";

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function loadTelegramSdk() {
  return import("@telegram-apps/sdk").catch(() => null);
}

function cleanupListener(cleanup) {
  try {
    if (typeof cleanup === "function") cleanup();
  } catch {
    // Progressive enhancement only.
  }
}

export function useTelegramGameNavigation({
  activeGame = null,
  hasOpenPanel = false,
  hasActiveRun = false,
  hasPendingActions = false,
  closePanel = null,
  pauseRun = null,
  exitToHub = null,
} = {}) {
  useEffect(() => {
    if (!activeGame && !hasOpenPanel) return undefined;
    let disposed = false;
    let cleanup = null;
    void loadTelegramSdk().then((sdk) => {
      if (disposed || !sdk?.backButton) return;
      safeCall(() => sdk.backButton.mount());
      safeCall(() => sdk.backButton.show());
      cleanup = safeCall(() => sdk.backButton.onClick(() => {
        if (hasOpenPanel && closePanel) {
          closePanel();
          return;
        }
        if (hasActiveRun && pauseRun) {
          pauseRun();
          return;
        }
        exitToHub?.();
      }));
    });
    return () => {
      disposed = true;
      cleanupListener(cleanup);
      void loadTelegramSdk().then((sdk) => safeCall(() => sdk?.backButton?.hide()));
    };
  }, [activeGame, closePanel, exitToHub, hasActiveRun, hasOpenPanel, pauseRun]);

  useEffect(() => {
    let disposed = false;
    void loadTelegramSdk().then((sdk) => {
      if (disposed || !sdk?.closingBehavior) return;
      safeCall(() => sdk.closingBehavior.mount());
      if (hasActiveRun || hasPendingActions) {
        safeCall(() => sdk.closingBehavior.enableConfirmation());
      } else {
        safeCall(() => sdk.closingBehavior.disableConfirmation());
      }
    });
    return () => {
      disposed = true;
    };
  }, [hasActiveRun, hasPendingActions]);
}
