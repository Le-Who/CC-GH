import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls } from "framer-motion";
import { useGameStore } from "../store/gameStore";

/**
 * MobileShopDrawer — Bottom-sheet pattern for quick access to
 * Farm inventory, seed shop, and quick-sell actions on mobile.
 *
 * Design: Snap to 3 heights (peek 30%, half 55%, full 90%)
 * with drag handle and swipe-to-dismiss.
 *
 * Only renders on touch devices / small viewports.
 */

const SNAP_PEEK = 0.30;
const SNAP_HALF = 0.55;
const SNAP_FULL = 0.90;
const DISMISS_THRESHOLD = 0.15;

export default function MobileShopDrawer({ isOpen, onClose, activeTab }) {
  const dragControls = useDragControls();
  const containerRef = useRef(null);
  const [viewportH, setViewportH] = useState(window.innerHeight);
  const [snapPosition, setSnapPosition] = useState(SNAP_HALF);

  // Track viewport height changes (rotation, keyboard)
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Get inventory data from Zustand
  const inventory = useGameStore((s) => s.slices?.farm?.inventory) || {};
  const gold = useGameStore((s) => s.slices.shared?.gold ?? 0);
  const energy = useGameStore((s) => s.slices.shared?.energy ?? 0);

  const sheetHeight = snapPosition * viewportH;

  const handleDragEnd = useCallback((_e, info) => {
    const velocity = info.velocity.y;
    const currentY = info.point.y;
    const draggedRatio = 1 - (currentY / viewportH);

    // Fast swipe down = dismiss
    if (velocity > 500 || draggedRatio < DISMISS_THRESHOLD) {
      onClose();
      return;
    }

    // Snap to nearest position
    const snaps = [SNAP_PEEK, SNAP_HALF, SNAP_FULL];
    let closest = snaps[0];
    let minDist = Math.abs(draggedRatio - snaps[0]);
    for (const s of snaps) {
      const d = Math.abs(draggedRatio - s);
      if (d < minDist) { minDist = d; closest = s; }
    }
    setSnapPosition(closest);
  }, [viewportH, onClose]);

  // Build inventory item list
  const items = Object.entries(inventory)
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => b[1] - a[1]);

  const handleSell = useCallback((cropId) => {
    if (window.HUB?.api) {
      window.HUB.api("/api/farm/sell", {
        userId: window.HUB.userId,
        cropId,
        quantity: 1,
      }).then((res) => {
        if (res?.success) {
          window.HUB?.showToast?.(`Sold 1× ${cropId}`, "success");
        }
      });
    }
  }, []);

  const handleFeed = useCallback((cropId) => {
    if (window.HUB?.api) {
      window.HUB.api("/api/farm/feed", {
        userId: window.HUB.userId,
        cropId,
        quantity: 1,
      }).then((res) => {
        if (res?.success) {
          window.HUB?.showToast?.(`Fed pet 1× ${cropId}`, "success");
        }
      });
    }
  }, []);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] pointer-events-none">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            ref={containerRef}
            className="absolute bottom-0 left-0 right-0 pointer-events-auto"
            style={{
              height: sheetHeight,
              maxHeight: `${SNAP_FULL * 100}vh`,
              background: "linear-gradient(180deg, rgba(20, 21, 35, 0.98) 0%, rgba(14, 15, 27, 0.99) 100%)",
              borderTopLeftRadius: "20px",
              borderTopRightRadius: "20px",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
          >
            {/* Drag Handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.25)" }}
              />
            </div>

            {/* Header */}
            <div className="flex justify-between items-center px-5 pb-3">
              <h3
                className="text-lg font-bold text-white"
                style={{ fontFamily: "'Bungee', system-ui, sans-serif" }}
              >
                🎒 Quick Inventory
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="px-2 py-1 rounded-full" style={{ background: "rgba(255,215,0,0.1)", color: "#ffd700" }}>
                  🪙 {gold}
                </span>
                <span className="px-2 py-1 rounded-full" style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}>
                  ⚡ {energy}
                </span>
              </div>
            </div>

            {/* Content */}
            <div
              className="overflow-y-auto px-4 pb-20"
              style={{
                height: `calc(100% - 70px)`,
                overscrollBehavior: "contain",
              }}
            >
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🌾</div>
                  <p className="text-white/50 font-medium">No crops yet</p>
                  <p className="text-white/30 text-sm mt-1">
                    Harvest some crops from your farm!
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {items.map(([cropId, qty]) => (
                    <motion.div
                      key={cropId}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {getCropEmoji(cropId)}
                        </span>
                        <div>
                          <span className="text-white font-semibold capitalize">
                            {cropId}
                          </span>
                          <span className="ml-2 text-white/40 text-sm">
                            ×{qty}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-95"
                          style={{
                            background: "rgba(34, 197, 94, 0.15)",
                            color: "#6ee7b7",
                            border: "1px solid rgba(34, 197, 94, 0.25)",
                            minHeight: "44px",
                            minWidth: "44px",
                          }}
                          onClick={() => handleSell(cropId)}
                          aria-label={`Sell ${cropId}`}
                        >
                          💰 Sell
                        </button>
                        <button
                          className="px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-95"
                          style={{
                            background: "rgba(251, 146, 60, 0.15)",
                            color: "#fb923c",
                            border: "1px solid rgba(251, 146, 60, 0.25)",
                            minHeight: "44px",
                            minWidth: "44px",
                          }}
                          onClick={() => handleFeed(cropId)}
                          aria-label={`Feed pet ${cropId}`}
                        >
                          🐾 Feed
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function getCropEmoji(id) {
  const map = {
    strawberry: "🍓", blueberry: "🫐", corn: "🌽", pumpkin: "🎃",
    tomato: "🍅", carrot: "🥕", potato: "🥔", sunflower: "🌻",
    watermelon: "🍉", eggplant: "🍆", pepper: "🌶️", wheat: "🌾",
    mushroom: "🍄", cherry: "🍒", grape: "🍇", apple: "🍎",
    peach: "🍑", lemon: "🍋", orange: "🍊", pineapple: "🍍",
    coconut: "🥥", mango: "🥭", kiwi: "🥝", avocado: "🥑",
  };
  return map[id] || "🌱";
}
