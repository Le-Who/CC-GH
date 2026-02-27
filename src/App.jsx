import React, { useState, useEffect, useCallback } from "react";
import HUD from "./components/HUD.jsx";
import BottomNav from "./components/BottomNav.jsx";
import VanillaShell from "./components/VanillaShell.jsx";
import GameStoreUI from "./components/GameStoreUI.jsx";
import QuestUI from "./components/QuestUI.jsx";
import PetInfoUI from "./components/PetInfoUI.jsx";
import PetRoomUI from "./components/PetRoomUI.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("farm");
  const [isStoreOpen, setStoreOpen] = useState(false);
  const [isQuestOpen, setQuestOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [appReady, setAppReady] = useState(false);

  // Listen for bootApp completion (signaled by window.HUB being set)
  useEffect(() => {
    function checkReady() {
      if (window.HUB?.bootComplete === true) {
        setAppReady(true);
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

  const handleTabSelect = (tabId) => {
    setActiveTab(tabId);

    // Simulate vanilla native navigation using the exposed global HUB
    if (window.HUB && typeof window.HUB.goToScreen === "function") {
      const screenIndex = window.HUB.screenNames.indexOf(tabId);
      if (screenIndex !== -1) {
        window.HUB.goToScreen(screenIndex);
      }
    }
  };

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
        onOpenStore={() => setStoreOpen(true)}
        onOpenQuest={() => setQuestOpen(true)}
      />

      <PetRoomUI active={activeTab === "room"} />

      {/* Modern React-based Bottom Navigation over Vanilla games */}
      <BottomNav activeTab={activeTab} onTabSelect={handleTabSelect} />

      {/* Modals */}
      <GameStoreUI isOpen={isStoreOpen} onClose={() => setStoreOpen(false)} />
      <QuestUI isOpen={isQuestOpen} onClose={() => setQuestOpen(false)} />
      <PetInfoUI />
    </div>
  );
}
