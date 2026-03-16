import React, { useState, useEffect, useCallback } from "react";
import HUD from "./components/HUD.jsx";
import BottomNav from "./components/BottomNav.jsx";
import VanillaShell from "./components/VanillaShell.jsx";
import GameStoreUI from "./components/GameStoreUI.jsx";
import QuestUI from "./components/QuestUI.jsx";
import PetInfoUI from "./components/PetInfoUI.jsx";
import PetRoomUI from "./components/PetRoomUI.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import MobileShopDrawer from "./components/MobileShopDrawer.jsx";
import { ActivityFeed } from "./components/ActivityFeed.jsx";
import { PlayerJournal } from "./components/PlayerJournal.jsx";
import { initGameBridge } from "./hooks/useGameBridge.js";

export default function App() {
  const [activeTab, setActiveTab] = useState("farm");
  const [isStoreOpen, setStoreOpen] = useState(false);
  const [isQuestOpen, setQuestOpen] = useState(false);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isJournalOpen, setJournalOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [appReady, setAppReady] = useState(false);

  // Listen for bootApp completion (signaled by window.HUB being set)
  useEffect(() => {
    function checkReady() {
      if (window.HUB?.bootComplete === true) {
        setAppReady(true);
        // Wire hook stores ↔ legacy GameStore slices (idempotent)
        initGameBridge();
        return true;
      }
      return false;
    }
    if (checkReady()) return;
    const interval = setInterval(() => {
      if (checkReady()) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleWelcomeComplete = useCallback(() => {
    setShowWelcome(false);
  }, []);

  const handleTabSelect = useCallback((tabId) => {
    setActiveTab(tabId);
    // Close drawer when switching tabs
    setDrawerOpen(false);

    // Simulate vanilla native navigation using the exposed global HUB
    if (window.HUB && typeof window.HUB.goToScreen === "function") {
      const screenIndex = window.HUB.screenNames.indexOf(tabId);
      if (screenIndex !== -1) {
        window.HUB.goToScreen(screenIndex);
      }
    }
  }, []);

  // Phase 17 Optimization: Stable references for HUD callbacks
  const handleOpenStore = useCallback(() => setStoreOpen(true), []);
  const handleCloseStore = useCallback(() => setStoreOpen(false), []);
  const handleOpenQuest = useCallback(() => setQuestOpen(true), []);
  const handleCloseQuest = useCallback(() => setQuestOpen(false), []);
  const handleOpenDrawer = useCallback(() => setDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleOpenJournal = useCallback(() => setJournalOpen(true), []);
  const handleCloseJournal = useCallback(() => setJournalOpen(false), []);

  return (
    <div className="relative w-full h-[100dvh] bg-background text-text overflow-hidden flex flex-col items-center justify-center font-body antialiased">
      {/* Welcome / Onboarding overlay (first visit only) */}
      {showWelcome && (
        <WelcomeScreen isReady={appReady} onComplete={handleWelcomeComplete} />
      )}

      {/* Underlying Vanilla Mini-Games layer */}
      <VanillaShell />

      {/* Modern React-based Top HUD over Vanilla games */}
      <HUD
        onOpenStore={handleOpenStore}
        onOpenQuest={handleOpenQuest}
        onOpenJournal={handleOpenJournal}
      />

      <PetRoomUI active={activeTab === "room"} />

      {/* Modern React-based Bottom Navigation over Vanilla games */}
      <BottomNav
        activeTab={activeTab}
        onTabSelect={handleTabSelect}
        onOpenDrawer={handleOpenDrawer}
      />

      {/* Modals */}
      <GameStoreUI isOpen={isStoreOpen} onClose={handleCloseStore} />
      <QuestUI isOpen={isQuestOpen} onClose={handleCloseQuest} />
      <PetInfoUI />
      {isJournalOpen && <PlayerJournal onClose={handleCloseJournal} />}
      {appReady && <ActivityFeed />}

      {/* Mobile bottom-sheet drawer for farm inventory quick-access */}
      <MobileShopDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        activeTab={activeTab}
      />
    </div>
  );
}
