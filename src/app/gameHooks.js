import { useCallback, useContext, useEffect } from "react";
import { useGameHub } from "../game-state/useGameHub.js";
import { openHome } from './homeNavigation.js';
import { HomeVisibilityContext } from './homeContext.js';

export function useImmersiveGame(tabId, active, controls = null) {
  const homeVisible = useContext(HomeVisibilityContext);
  // A start response or duel poll can arrive after Home opened. Every game
  // commit reasserts pause, including local updates with unchanged controls.
  // The existing pause methods are idempotent.
  useEffect(() => {
    if (homeVisible && active && controls?.activeRun) (controls?.pauseRun || controls?.pause)?.();
  });
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
  return useCallback(openHome, []);
}
