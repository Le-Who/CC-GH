import { useCallback, useEffect } from "react";
import { useGameHub } from "../game-state/useGameHub.js";

export function useImmersiveGame(tabId, active) {
  const setActiveGameShell = useGameHub((state) => state.setActiveGameShell);
  useEffect(() => {
    setActiveGameShell(active ? tabId : null);
    return () => {
      if (useGameHub.getState().activeGameShell === tabId) {
        useGameHub.getState().setActiveGameShell(null);
      }
    };
  }, [active, setActiveGameShell, tabId]);
}

export function useSnapshot() {
  return useGameHub((state) => state.snapshot);
}

export function useAction() {
  return useGameHub((state) => state.performAction);
}

export function useExitToHub() {
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  return useCallback(() => {
    setActiveTab("garden");
  }, [setActiveTab]);
}
