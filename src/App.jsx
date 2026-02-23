import React, { useState } from "react";
import HUD from "./components/HUD.jsx";
import BottomNav from "./components/BottomNav.jsx";
import VanillaShell from "./components/VanillaShell.jsx";
import GameStoreUI from "./components/GameStoreUI.jsx";
import QuestUI from "./components/QuestUI.jsx";
import PetInfoUI from "./components/PetInfoUI.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("farm");
  const [isStoreOpen, setStoreOpen] = useState(false);
  const [isQuestOpen, setQuestOpen] = useState(false);

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
      {/* Underlying Vanilla Mini-Games layer */}
      <VanillaShell />

      {/* Modern React-based Top HUD over Vanilla games */}
      <HUD
        onOpenStore={() => setStoreOpen(true)}
        onOpenQuest={() => setQuestOpen(true)}
      />

      {/* Modern React-based Bottom Navigation over Vanilla games */}
      <BottomNav activeTab={activeTab} onTabSelect={handleTabSelect} />

      {/* Modals */}
      <GameStoreUI isOpen={isStoreOpen} onClose={() => setStoreOpen(false)} />
      <QuestUI isOpen={isQuestOpen} onClose={() => setQuestOpen(false)} />
      <PetInfoUI />
    </div>
  );
}
