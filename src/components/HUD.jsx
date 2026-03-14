import React from "react";
import { motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";

export default function HUD({ onOpenStore, onOpenQuest }) {
  // OPTIMIZATION 6: Using atomic selectors to prevent React re-renders on unrelated game state changes
  const energy = useGameStore((state) => state.slices.shared?.energy ?? 30);
  const maxEnergy = useGameStore((state) => state.slices.shared?.maxEnergy ?? 30);
  const gold = useGameStore((state) => state.slices.shared?.gold ?? 0);
  const activeQuests = useGameStore((state) => state.slices.shared?.activeQuests ?? 0);

  const energyPercent = Math.min(100, (energy / maxEnergy) * 100);

  return (
    <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-50 pointer-events-none">
      <div className="flex gap-3 pointer-events-auto">
        {/* Energy Pill */}
        <motion.div
          className="relative overflow-hidden bg-surface/80 backdrop-blur-md border border-border rounded-full flex items-center px-3 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          {/* Regen Fill Background */}
          <motion.div
            className="absolute left-0 top-0 bottom-0 bg-accent/20 z-0"
            initial={{ width: 0 }}
            animate={{ width: `${energyPercent}%` }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          />
          <span className="relative z-10 text-xl mr-2">⚡</span>
          <span className="relative z-10 font-heading font-bold text-white tracking-wide">
            {energy}
            <span className="text-textDim text-sm">/{maxEnergy}</span>
          </span>
        </motion.div>

        {/* Gold Pill */}
        <motion.div
          className="bg-surface/80 backdrop-blur-md border border-border rounded-full flex items-center px-4 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span className="text-xl mr-2">🪙</span>
          <span className="font-heading font-bold text-gold tracking-wide">
            {gold}
          </span>
        </motion.div>
      </div>

      <div className="flex gap-2 pointer-events-auto">
        {/* Quest Log Buton */}
        <button
          className="relative bg-surface/80 backdrop-blur-md border border-border rounded-full w-12 h-12 flex items-center justify-center text-2xl shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-90"
          onClick={onOpenQuest}
        >
          📋
          {activeQuests > 0 && (
            <motion.div
              className="absolute top-0 right-0 w-4 h-4 bg-danger rounded-full border-2 border-background"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500 }}
            />
          )}
        </button>

        {/* Monetization Store Button */}
        <button
          className="bg-gold text-background rounded-full w-12 h-12 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(255,215,0,0.4)] transition-transform hover:scale-110 active:scale-90"
          onClick={onOpenStore}
        >
          🛒
        </button>
      </div>
    </div>
  );
}
