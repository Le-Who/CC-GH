import { useCallback, useEffect } from "react";
import { useGameHub } from "../game-state/useGameHub.js";

export function useImmersiveGame(tabId, active, controls = null) {
  const setActiveGameShell = useGameHub((state) => state.setActiveGameShell);
  useEffect(() => {
    setActiveGameShell(active ? (controls ? { id: tabId, ...controls } : tabId) : null);
    return () => {
      const current = useGameHub.getState().activeGameShell;
      const currentId = typeof current === "string" ? current : current?.id;
      if (currentId === tabId) {
        useGameHub.getState().setActiveGameShell(null);
      }
    };
  }, [active, controls, setActiveGameShell, tabId]);
}

export function useSnapshot() {
  return useGameHub((state) => state.snapshot);
}

export function useAction() {
  return useGameHub((state) => state.performAction);
}

export function useReliableAction() {
  return useGameHub((state) => state.performReliableAction);
}

export function useExitToHub() {
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  return useCallback(() => {
    setActiveTab("garden");
  }, [setActiveTab]);
}
