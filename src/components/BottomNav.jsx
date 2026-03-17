import React from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useGameStore } from "../store/gameStore.js";

const TABS = [
  { id: "trivia", icon: "🧠", label: "Trivia" },
  { id: "blox", icon: "🧱", label: "Blox" },
  { id: "farm", icon: "🌱", label: "Farm" },
  { id: "match3", icon: "💎", label: "Match-3" },
  { id: "merge", icon: "🧩", label: "Merge" },
  { id: "room", icon: "🏠", label: "Room" },
];

/**
 * BottomNav — Persistent bottom navigation bar.
 * v8.0: Responsive height reduction on small viewports.
 *  - Standard: 68px height, icon + label
 *  - Compact (< 500px viewport height): 56px, smaller icons, no labels
 *  - Includes bag icon for MobileShopDrawer access on farm tab
 */
export default function BottomNav({ activeTab, onTabSelect, onOpenDrawer }) {
  const roomInventory = useGameStore((state) => state.slices.room?.inventory);
  const hasNewRoomItems = roomInventory ? roomInventory.length > 0 : false;
  // v8.2: using derived selector for performance instead of Object.values().some() inline
  const hasItems = useGameStore((s) => {
    const inv = s.slices?.farm?.inventory;
    if (!inv) return false;
    for (const key in inv) {
      if (Object.hasOwn(inv, key) && inv[key] > 0) return true;
    }
    return false;
  });

  // v8.1: Responsive compact mode for small viewports (iPhone SE in Discord iframe)
  const [isCompact, setIsCompact] = React.useState(() => window.innerHeight <= 500);
  React.useEffect(() => {
    const onResize = () => setIsCompact(window.innerHeight <= 500);
    window.addEventListener("resize", onResize);
    // Set CSS custom property for base.css viewport padding
    document.documentElement.style.setProperty(
      "--bottom-nav-height",
      isCompact ? "48px" : "68px",
    );
    return () => window.removeEventListener("resize", onResize);
  }, [isCompact]);

  const navHeight = isCompact ? "h-12" : "h-[68px]";

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 bottom-nav-bar ${navHeight}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="absolute inset-0 bg-[#0D0F1A]/90 backdrop-blur-xl border-t border-white/10" />

      <div className="relative flex justify-around items-stretch h-full px-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className={twMerge(
                clsx(
                  "relative flex flex-col items-center justify-center flex-1 transition-colors duration-300 nav-tab-btn",
                  isActive
                    ? "text-primary"
                    : "text-white/40 hover:text-white/60",
                ),
              )}
            >
                {/* Animated Background Pill */}
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-x-1 inset-y-1 bg-primary/15 border border-primary/30 rounded-xl shadow-[0_0_12px_rgba(167,139,250,0.3)] z-0"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}

              <span
                className={twMerge(
                  clsx(
                    "relative z-10 nav-tab-icon mb-0.5 transition-all duration-300",
                    isActive ? "-translate-y-0.5 scale-110 drop-shadow-[0_4px_8px_rgba(167,139,250,0.6)]" : "translate-y-0 scale-100"
                  )
                )}
              >
                {tab.icon}
                {tab.id === "room" && hasNewRoomItems && (
                  <div
                    className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-red-400 z-20 animate-bounce"
                  >
                    NEW
                  </div>
                )}
              </span>
              {!isCompact && (
                <span className="relative z-10 nav-tab-label text-[10px] uppercase tracking-wider font-bold">
                  {tab.label}
                </span>
              )}
            </button>
          );
        })}

        {/* Bag / Drawer toggle — visible on farm tab when inventory has items */}
        {activeTab === "farm" && hasItems && (
          <button
            onClick={onOpenDrawer}
            className="relative flex flex-col items-center justify-center transition-colors duration-300 text-amber-400 hover:text-amber-300 nav-tab-btn"
            style={{ flex: "0 0 52px" }}
            aria-label="Open inventory drawer"
          >
            <span className="nav-tab-icon relative z-10">🎒</span>
            <span className="relative z-10 nav-tab-label text-[10px] uppercase tracking-wider font-bold">
              Bag
            </span>
            <motion.div
              className="absolute top-1 right-1 w-2.5 h-2.5 bg-amber-400 rounded-full"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          </button>
        )}
      </div>
    </nav>
  );
}
