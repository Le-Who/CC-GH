import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { hudStore } from "../hooks/useHUDEngine";

/**
 * HUD — Top bar with energy/gold pills + quest/store buttons.
 * v9.0: Reads from typed hudStore (via useHUDEngine) instead of
 *       legacy GameStore 'shared' slice. Data flows:
 *       hud.js → GameStore('resources') → bridge → hudStore → HUD.jsx
 */

export default function HUD({ onOpenStore, onOpenQuest }) {
  const energy = hudStore((s) => s.energy?.current ?? 0);
  const maxEnergy = hudStore((s) => s.energy?.max ?? 20);
  const gold = hudStore((s) => s.gold ?? 0);
  const activeQuests = hudStore((s) => s.activeQuests ?? 0);

  const [moreOpen, setMoreOpen] = useState(false);
  const toggleMore = useCallback(() => setMoreOpen((p) => !p), []);

  const energyPercent = Math.min(100, (energy / maxEnergy) * 100);

  return (
    <div
      className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
    >
      <div className="flex justify-between items-center px-4 py-1 pointer-events-none">
        {/* Left: Resource pills */}
        <div className="flex gap-2 pointer-events-auto">
          {/* Energy Pill — compact on small viewports */}
          <motion.div
            className="hud-pill relative overflow-hidden bg-surface/80 backdrop-blur-md border border-border rounded-full flex items-center px-2.5 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <motion.div
              className="absolute left-0 top-0 bottom-0 bg-accent/20 z-0"
              initial={{ width: 0 }}
              animate={{ width: `${energyPercent}%` }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            />
            <span className="relative z-10 hud-icon mr-1.5">⚡</span>
            <span className="relative z-10 font-heading font-bold text-white tracking-wide hud-value">
              {energy}
              <span className="text-textDim hud-max">/{maxEnergy}</span>
            </span>
          </motion.div>

          {/* Gold Pill */}
          <motion.div
            className="hud-pill bg-surface/80 backdrop-blur-md border border-border rounded-full flex items-center px-3 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span className="hud-icon mr-1.5">🪙</span>
            <span className="font-heading font-bold text-gold tracking-wide hud-value">
              {gold}
            </span>
          </motion.div>
        </div>

        {/* Right: Action buttons */}
        <div className="flex gap-2 pointer-events-auto">
          {/* Full-size buttons (hidden on compact viewports via CSS) */}
          <button
            className="hud-btn-full relative bg-surface/80 backdrop-blur-md border border-border rounded-full w-11 h-11 flex items-center justify-center text-xl shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-90"
            onClick={onOpenQuest}
            aria-label="Open quest log"
          >
            📋
            {activeQuests > 0 && (
              <motion.div
                className="absolute top-0 right-0 w-3.5 h-3.5 bg-danger rounded-full border-2 border-background"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500 }}
              />
            )}
          </button>

          <button
            className="hud-btn-full bg-gold text-background rounded-full w-11 h-11 flex items-center justify-center text-lg shadow-[0_0_15px_rgba(255,215,0,0.4)] transition-transform hover:scale-110 active:scale-90"
            onClick={onOpenStore}
            aria-label="Open store"
          >
            🛒
          </button>

          {/* Compact overflow button (shown only on compact viewports via CSS) */}
          <div className="hud-btn-compact relative" style={{ display: "none" }}>
            <button
              className="bg-surface/80 backdrop-blur-md border border-border rounded-full w-11 h-11 flex items-center justify-center text-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-90"
              onClick={toggleMore}
              aria-label="More actions"
              aria-expanded={moreOpen}
            >
              ⋮
              {activeQuests > 0 && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-danger rounded-full border-2 border-background" />
              )}
            </button>

            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  className="absolute top-full right-0 mt-2 flex flex-col gap-2 p-2 rounded-xl"
                  style={{
                    background: "rgba(20, 21, 35, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(16px)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors whitespace-nowrap"
                    style={{ minHeight: "44px" }}
                    onClick={() => { onOpenQuest(); setMoreOpen(false); }}
                  >
                    📋 Quests {activeQuests > 0 && <span className="w-2 h-2 bg-danger rounded-full" />}
                  </button>
                  <button
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-gold hover:bg-white/10 transition-colors whitespace-nowrap"
                    style={{ minHeight: "44px" }}
                    onClick={() => { onOpenStore(); setMoreOpen(false); }}
                  >
                    🛒 Store
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
