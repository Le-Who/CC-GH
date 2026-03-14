import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../store/gameStore";

/**
 * GameStoreUI — Redesigned with Hyper-Playful Neon aesthetic.
 *
 * Psychology models:
 *  - Decoy Effect: Good-Better-Best tiers
 *  - Anchoring: high-value tier shown prominently
 *  - Framing: "Claim" not "Buy" for premium
 *  - Real Scarcity: server-synced merchant timer
 *  - Transparency: odds always accessible
 */

const STORE_TABS = [
  { id: "gacha", label: "🔮 Gacha", ariaLabel: "Gacha pulls" },
  { id: "cozy", label: "⭐ Cozy Pass", ariaLabel: "Season pass" },
  { id: "bundles", label: "🎁 Bundles", ariaLabel: "Weekend bundles" },
  { id: "currency", label: "🪙 Currency", ariaLabel: "Buy gold and energy" },
];

const GACHA_ODDS = [
  {
    rarity: "Common",
    label: "Decorations",
    rate: "60.0%",
    color: "var(--rarity-common)",
  },
  { rarity: "Rare", label: "Pets", rate: "30.0%", color: "var(--rarity-rare)" },
  { rarity: "Epic", label: "Auras", rate: "9.0%", color: "var(--rarity-epic)" },
  {
    rarity: "Legendary",
    label: "Golden Skins",
    rate: "1.0%",
    color: "var(--rarity-legendary)",
  },
];

const spring = { type: "spring", stiffness: 400, damping: 22 };

export default function GameStoreUI({ isOpen, onClose }) {
  const slices = useGameStore((state) => state.slices);
  const resources = slices.resources || { gold: 0, gachaTokens: 0 };
  const [activeTab, setActiveTab] = useState("gacha");

  // Analytics & Body class toggle for CSS bypass
  useEffect(() => {
    if (isOpen) {
      console.log("[Analytics] STORE_OPENED", { timestamp: Date.now() });
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
  }, [isOpen]);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    console.log("[Analytics] STORE_TAB_CHANGED", { tab: tabId });
  }, []);

  if (!isOpen && typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Seed Store"
        >
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        className="store-panel relative w-full max-w-2xl border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "var(--surface)" }}
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={spring}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center p-4 border-b"
          style={{ borderColor: "var(--border)", background: "var(--bg)" }}
        >
          <h2
            className="text-2xl font-bold text-white"
            style={{ fontFamily: "'Bungee', system-ui, sans-serif" }}
          >
            🛒 Wandering Merchant
          </h2>
          <div className="flex items-center gap-3">
            <div
              className="px-3 py-1.5 rounded-full font-bold text-sm flex items-center gap-1"
              style={{
                background: "var(--surface-hover)",
                color: "var(--gold)",
              }}
              aria-label={`${resources.gold} gold`}
            >
              🪙 <span className="font-numbers">{resources.gold}</span>
            </div>
            <div
              className="px-3 py-1.5 rounded-full font-bold text-sm flex items-center gap-1"
              style={{
                background: "var(--surface-hover)",
                color: "var(--rarity-epic)",
              }}
              aria-label={`${resources.gachaTokens} gacha tokens`}
            >
              🎟️ <span className="font-numbers">{resources.gachaTokens}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 ml-1 transition-colors"
              style={{ color: "var(--text-dim)" }}
              aria-label="Close store"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav
          className="flex px-4 py-2 gap-2 overflow-x-auto border-b hide-scrollbar"
          style={{ borderColor: "var(--border)" }}
          role="tablist"
          aria-label="Store sections"
        >
          {STORE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className="px-4 py-2 rounded-full whitespace-nowrap transition-all text-sm font-bold"
                style={{
                  background: isActive
                    ? "var(--accent)"
                    : "var(--surface-hover)",
                  color: isActive ? "white" : "var(--text-dim)",
                  boxShadow: isActive
                    ? "0 0 12px rgba(255, 51, 102, 0.4)"
                    : "none",
                }}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.ariaLabel}
                aria-controls={`tabpanel-${tab.id}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content Area */}
        <div
          className="p-6 h-[50vh] min-h-[400px] overflow-y-auto"
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-label={`${activeTab} content`}
        >
          <AnimatePresence mode="wait">
            {activeTab === "gacha" && (
              <GachaTab key="gacha" tokens={resources.gachaTokens} />
            )}
            {activeTab === "cozy" && <CozyPassTab key="cozy" />}
            {activeTab === "bundles" && <BundlesTab key="bundles" />}
            {activeTab === "currency" && <CurrencyTab key="currency" />}
          </AnimatePresence>
        </div>

        {/* Transparency Footer */}
        <div
          className="px-4 py-2 text-center border-t"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-muted)",
            fontSize: "0.7rem",
          }}
        >
          All prices final • Drop rates verified •{" "}
          <button
            className="underline hover:text-white transition-colors"
            style={{ color: "var(--text-muted)" }}
            aria-label="View terms of service"
          >
            Terms
          </button>
        </div>
      </motion.div>
    </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ═══════════════════════════════════════
 *  GACHA TAB
 * ═══════════════════════════════════════ */
function GachaTab({ tokens }) {
  const [isPulling, setIsPulling] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const [pityCount, setPityCount] = useState(0);

  const handlePull = useCallback(
    async (count) => {
      const cost = count * 10;
      if (tokens < cost) {
        window.HUB?.showToast?.(`Need ${cost} 🎟️ Gacha Tokens!`, "error");
        return;
      }
      setIsPulling(true);
      console.log(
        "[Analytics]",
        count === 1 ? "GACHA_PULL_SINGLE" : "GACHA_PULL_MULTI",
        { cost },
      );
      try {
        const data = await window.HUB?.api?.("/api/merge/gacha", {
          userId: window.HUB?.userId,
          count,
        });
        if (data?.success) {
          window.HUB?.showToast?.(
            `🎰 You got: ${data.item?.emoji || "🎁"} ${data.item?.name || "an item"}!`,
            "success",
          );
          setPityCount((p) =>
            data.item?.rarity === "legendary" ? 0 : p + count,
          );
        } else {
          window.HUB?.showToast?.(data?.error || "Gacha pull failed", "error");
        }
      } catch {
        window.HUB?.showToast?.("Network error", "error");
      } finally {
        setIsPulling(false);
      }
    },
    [tokens],
  );

  return (
    <motion.div
      className="flex flex-col items-center h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      {/* Odds Toggle */}
      <div className="w-full flex justify-between items-center mb-3">
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Pity: {pityCount}/50
        </span>
        <button
          onClick={() => {
            setShowOdds(!showOdds);
            if (!showOdds) console.log("[Analytics] GACHA_ODDS_VIEWED");
          }}
          className="text-xs underline uppercase tracking-wider transition-colors"
          style={{ color: "var(--text-dim)" }}
          aria-expanded={showOdds}
          aria-controls="gacha-odds-panel"
        >
          {showOdds ? "Hide" : "View"} Drop Rates
        </button>
      </div>

      {/* Odds Panel */}
      <AnimatePresence>
        {showOdds && (
          <motion.div
            id="gacha-odds-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full p-4 rounded-xl mb-4 text-sm border"
            style={{
              background: "var(--surface-hover)",
              borderColor: "var(--border)",
            }}
          >
            <h4 className="font-bold mb-2 text-white">
              🎲 Transparent Drop Rates
            </h4>
            <ul className="space-y-1.5">
              {GACHA_ODDS.map((item) => (
                <li
                  key={item.rarity}
                  className="flex justify-between items-center"
                >
                  <span style={{ color: item.color }} className="font-semibold">
                    {item.rarity}{" "}
                    <span style={{ color: "var(--text-dim)" }}>
                      ({item.label})
                    </span>
                  </span>
                  <span className="font-numbers font-bold">{item.rate}</span>
                </li>
              ))}
            </ul>
            <p
              className="text-xs mt-3 italic"
              style={{ color: "var(--text-muted)" }}
            >
              Pity System: Rare guaranteed within 10 pulls, Legendary within 50.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crystal Ball Visual */}
      <div className="flex-1 flex items-center justify-center w-full relative">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, rgba(167, 139, 250, 0.1) 0%, transparent 70%)",
          }}
        />
        <motion.div
          animate={
            isPulling
              ? { rotate: [0, 5, -5, 5, 0], scale: [1, 1.05, 1] }
              : { y: [0, -10, 0] }
          }
          transition={
            isPulling
              ? { duration: 0.5, repeat: Infinity }
              : { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }
          className="text-8xl relative z-10"
          style={{ filter: "drop-shadow(0 0 30px rgba(167, 139, 250, 0.5))" }}
        >
          🔮
        </motion.div>
      </div>

      {/* Pull Buttons */}
      <div className="flex gap-4 w-full mt-auto">
        <button
          className="flex-1 py-4 rounded-xl font-bold flex flex-col items-center justify-center border transition-all"
          style={{
            background: "var(--surface-hover)",
            borderColor: "var(--border)",
          }}
          disabled={isPulling}
          onClick={() => handlePull(1)}
          aria-label="Pull 1, costs 10 gacha tokens"
        >
          <span className="text-lg text-white">Pull ×1</span>
          <span className="text-sm" style={{ color: "var(--rarity-epic)" }}>
            10 🎟️
          </span>
        </button>
        <motion.button
          className="flex-[2] py-4 text-white rounded-xl font-bold flex flex-col items-center justify-center w-2/3 transition-opacity"
          style={{
            background: "linear-gradient(135deg, #A78BFA, #8B5CF6)",
            boxShadow: "0 4px 0 #5B21B6, 0 8px 24px rgba(167, 139, 250, 0.4)",
          }}
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98, y: 3 }}
          disabled={isPulling}
          onClick={() => handlePull(10)}
          aria-label="Pull 10, costs 100 gacha tokens, guaranteed rare"
        >
          <span className="text-lg">Pull ×10 (Guaranteed Rare)</span>
          <span className="text-sm text-white/80">100 🎟️</span>
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
 *  COZY PASS TAB
 * ═══════════════════════════════════════ */
function CozyPassTab() {
  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div
        className="relative rounded-2xl overflow-hidden p-6 border"
        style={{
          borderColor: "rgba(255, 215, 0, 0.5)",
          background:
            "linear-gradient(135deg, #1A1A10 0%, var(--surface) 100%)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(45deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%)",
          }}
        />
        <div className="relative z-10">
          <h3
            className="text-2xl font-black tracking-widest uppercase"
            style={{
              fontFamily: "'Bungee', system-ui, sans-serif",
              color: "var(--gold)",
            }}
          >
            ⭐ VIP Cozy Pass
          </h3>
          <p className="text-white/80 mt-2">
            Unlock the Golden Shiba pet variant + 500 immediate Energy!
          </p>

          <div
            className="mt-4 space-y-2 text-sm"
            style={{ color: "var(--text-dim)" }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--success)" }}>✓</span> 2× Quest Gold
              Rewards
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--success)" }}>✓</span> 3 Exclusive
              Cosmetics / Season
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--success)" }}>✓</span> Golden Shiba
              Pet Variant
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--success)" }}>✓</span> +500 Energy on
              Purchase
            </div>
          </div>

          <motion.button
            className="mt-5 px-6 py-3 font-bold rounded-full"
            style={{
              background: "linear-gradient(135deg, #FFD700, #FFC107)",
              color: "#14151B",
              boxShadow: "0 4px 0 #B8860B, 0 8px 24px rgba(255, 215, 0, 0.35)",
            }}
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.95, y: 3 }}
            onClick={() => console.log("[Analytics] PASS_PURCHASED")}
            aria-label="Purchase Cozy Pass for $4.99 per season"
          >
            $4.99 / Season
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
 *  BUNDLES TAB
 * ═══════════════════════════════════════ */
function BundlesTab() {
  return (
    <motion.div
      className="text-center mt-12"
      style={{ color: "var(--text-dim)" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="text-5xl mb-4">📦</div>
      <p className="font-semibold">No active bundles right now.</p>
      <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
        Check back this weekend for special deals!
      </p>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
 *  CURRENCY TAB — Good-Better-Best
 * ═══════════════════════════════════════ */
function CurrencyTab() {
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      {/* Tier 1: Base (Anchor) */}
      <div
        className="p-5 rounded-xl border flex flex-col items-center text-center"
        style={{
          background: "var(--surface-hover)",
          borderColor: "var(--border)",
        }}
      >
        <div className="text-4xl mb-3">🪙</div>
        <h4 className="font-bold text-white">Farmer's Handful</h4>
        <p
          className="text-2xl font-black mt-2"
          style={{ color: "var(--gold)" }}
        >
          100 🪙
        </p>
        <motion.button
          className="mt-4 w-full py-2.5 text-white rounded-lg font-bold transition-all"
          style={{
            background: "var(--brand-secondary)",
            boxShadow: "0 3px 0 #4A5899",
          }}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97, y: 2 }}
          onClick={() =>
            console.log("[Analytics] CURRENCY_PURCHASED", { tier: 1 })
          }
          aria-label="Buy Farmer's Handful, 100 gold for $0.99"
        >
          $0.99
        </motion.button>
      </div>

      {/* Tier 2: Decoy */}
      <div
        className="p-5 rounded-xl border flex flex-col items-center text-center"
        style={{
          background: "var(--surface-hover)",
          borderColor: "var(--border)",
        }}
      >
        <div className="text-4xl mb-3">💰</div>
        <h4 className="font-bold text-white">Stash Builder</h4>
        <p
          className="text-2xl font-black mt-2"
          style={{ color: "var(--gold)" }}
        >
          250 🪙
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
          + 1 basic seed
        </p>
        <motion.button
          className="mt-4 w-full py-2.5 text-white rounded-lg font-bold transition-all"
          style={{
            background: "var(--brand-secondary)",
            boxShadow: "0 3px 0 #4A5899",
          }}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97, y: 2 }}
          onClick={() =>
            console.log("[Analytics] CURRENCY_PURCHASED", { tier: 2 })
          }
          aria-label="Buy Stash Builder, 250 gold plus 1 seed for $2.49"
        >
          $2.49
        </motion.button>
      </div>

      {/* Tier 3: Premium (Target — Best Value) */}
      <div
        className="p-5 rounded-xl border relative flex flex-col items-center text-center overflow-hidden"
        style={{
          borderColor: "var(--gold)",
          borderWidth: "2px",
          background:
            "linear-gradient(135deg, rgba(255, 215, 0, 0.08) 0%, var(--surface-hover) 100%)",
        }}
      >
        <div
          className="absolute top-0 right-0 text-xs font-black px-3 py-1 rounded-bl-xl"
          style={{ background: "var(--gold)", color: "#14151B" }}
        >
          BEST VALUE
        </div>
        <div className="text-4xl mb-3">💎</div>
        <h4 className="font-bold" style={{ color: "var(--brand-accent)" }}>
          Megacorp Harvest
        </h4>
        <p
          className="text-2xl font-black mt-2"
          style={{ color: "var(--gold)" }}
        >
          300 🪙
        </p>
        <p
          className="text-sm mt-1 font-bold"
          style={{ color: "var(--brand-accent)" }}
        >
          + 3 Rare Seeds
          <br />+ 2hr Energy Booster
        </p>
        <motion.button
          className="mt-4 w-full py-3 font-black rounded-lg transition-all text-lg"
          style={{
            background: "linear-gradient(135deg, #FFD700, #FFC107)",
            color: "#14151B",
            boxShadow: "0 4px 0 #B8860B, 0 8px 20px rgba(255, 215, 0, 0.3)",
          }}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95, y: 3 }}
          onClick={() =>
            console.log("[Analytics] CURRENCY_PURCHASED", { tier: 3 })
          }
          aria-label="Claim Megacorp Harvest, 300 gold plus 3 rare seeds and energy booster for $2.99"
        >
          CLAIM — $2.99
        </motion.button>
      </div>
    </motion.div>
  );
}
