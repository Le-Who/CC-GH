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

export default function BottomNav({ activeTab, onTabSelect }) {
  const roomInventory = useGameStore((state) => state.slices.room?.inventory);
  const hasNewRoomItems = roomInventory ? roomInventory.length > 0 : false;
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[68px] pb-safe z-50">
      <div className="absolute inset-0 bg-[#0D0F1A]/90 backdrop-blur-xl border-t border-white/10" />

      <div className="relative flex justify-around items-stretch h-full px-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className={twMerge(
                clsx(
                  "relative flex flex-col items-center justify-center flex-1 transition-colors duration-300",
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
                  className="absolute inset-x-2 inset-y-1 bg-primary/15 border border-primary/30 rounded-xl shadow-[0_0_12px_rgba(167,139,250,0.3)] z-0"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}

              <span
                className={twMerge(
                  clsx(
                    "relative z-10 text-2xl mb-1 transition-all duration-300",
                    isActive ? "-translate-y-1 scale-110 drop-shadow-[0_4px_8px_rgba(167,139,250,0.6)]" : "translate-y-0 scale-100"
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
              <span className="relative z-10 text-[10px] uppercase tracking-wider font-bold">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
