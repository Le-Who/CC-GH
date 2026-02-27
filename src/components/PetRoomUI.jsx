import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../store/gameStore.js";
import {
  ROOM_DECORATIONS,
  PET_ASSETS,
  PET_EXPRESSIONS,
} from "../../game-logic.js";
import { api, showToast } from "../vanilla/shared.js";

// Basic 4x4 Grid for the room
const GRID_SIZE = 4;
const CELL_SIZE = 60;

const EMPTY_ROOM = { decorations: [], inventory: [], wallpaper: "default" };

function PetRoomAvatar({ petData }) {
  if (!petData) return null;
  const baseSkinId = petData.skinId || "basic_dog";
  const assetDef = PET_ASSETS[baseSkinId];
  if (!assetDef) return <span className="text-4xl">🐕</span>;

  const happiness = petData.stats?.happiness ?? 100;
  let exprId = "happy";
  if (happiness >= 90) exprId = "ecstatic";
  else if (happiness >= 70) exprId = "happy";
  else if (happiness >= 50) exprId = "content";
  else if (happiness >= 30) exprId = "neutral";
  else if (happiness >= 15) exprId = "sad";
  else exprId = "miserable";

  const expressionDef = PET_EXPRESSIONS[exprId];

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div
        className="pet-render-stack"
        style={{
          width: assetDef.width,
          height: assetDef.height,
          transform: `scale(1)`,
        }}
      >
        {assetDef.type === "svg" ? (
          <img
            className="pet-layer pet-body pet-type-svg drop-shadow-xl"
            src={`/${assetDef.src}`}
            alt={baseSkinId}
          />
        ) : (
          <div
            className="pet-layer pet-body pet-type-raster drop-shadow-xl"
            style={{
              backgroundImage: `url('/${assetDef.src}')`,
              width: assetDef.frameWidth,
              animationTimingFunction: `steps(${assetDef.frames})`,
            }}
          />
        )}

        {expressionDef && assetDef.anchors?.face && (
          <img
            className="pet-layer pet-expression"
            src={`/${expressionDef.src}`}
            style={{
              top: assetDef.anchors.face.top,
              left: assetDef.anchors.face.left,
              transform: "translate(-50%, -50%)",
            }}
            alt="expression"
          />
        )}
      </div>
    </div>
  );
}

export default function PetRoomUI({ active }) {
  const roomData = useGameStore((state) => state.slices.room) || EMPTY_ROOM;
  const petData = useGameStore((state) => state.slices.pet);

  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);

  // Local state for grid positions. In a real app, position data would be saved.
  // For MVP, we auto-layout placed items or allow tapping empty tiles.
  const [grid, setGrid] = useState(Array(GRID_SIZE * GRID_SIZE).fill(null));

  const decoList = roomData.decorations;
  useEffect(() => {
    // Distribute placed decorations into the grid visually
    const newGrid = Array(GRID_SIZE * GRID_SIZE).fill(null);
    const decos = decoList || [];
    decos.forEach((dId, idx) => {
      if (idx < newGrid.length) newGrid[idx] = dId;
    });
    setGrid(newGrid);
  }, [decoList]);

  if (!active) return null;

  const inventory = roomData.inventory || [];

  const handleTileTap = async (index) => {
    // If we have an item selected, place it here
    if (selectedInventoryItem) {
      if (grid[index] !== null) {
        showToast("Space already occupied!", "error");
        return;
      }

      // Optimistic Update
      const newInventory = inventory.filter(
        (id) => id !== selectedInventoryItem,
      );
      const newDecorations = [
        ...(roomData.decorations || []),
        selectedInventoryItem,
      ];

      useGameStore.setState((prev) => ({
        slices: {
          ...prev.slices,
          room: {
            ...prev.slices.room,
            inventory: newInventory,
            decorations: newDecorations,
          },
        },
      }));
      setSelectedInventoryItem(null);

      // Tell Server (Mock implementation - assuming route exists or will be added)
      try {
        await api("/api/pet/room/place", { decoId: selectedInventoryItem });
        showToast("Item placed! +Bonus active", "success");
      } catch (e) {
        // ...rollback
      }
    } else {
      // If tapping an existing item, pick it up
      const item = grid[index];
      if (item) {
        const newDecorations = (roomData.decorations || []).filter(
          (id) => id !== item,
        );
        const newInventory = [...inventory, item];

        useGameStore.setState((prev) => ({
          slices: {
            ...prev.slices,
            room: {
              ...prev.slices.room,
              inventory: newInventory,
              decorations: newDecorations,
            },
          },
        }));

        try {
          await api("/api/pet/room/pickup", { decoId: item });
        } catch (e) {}
      }
    }
  };

  return (
    <motion.div
      className="absolute inset-0 bg-background/95 backdrop-blur-md flex flex-col pt-12 pb-24 z-20"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
    >
      <div className="text-center mb-6">
        <h2 className="text-3xl font-heading text-white tracking-widest uppercase text-glow">
          Pet Room
        </h2>
        <p className="text-textDim text-sm">
          Decorate to grant passive bonuses!
        </p>
      </div>

      {/* Room Environment */}
      <div className="relative mx-auto w-[300px] h-[300px] bg-surface rounded-3xl border-4 border-border/50 shadow-2xl overflow-hidden flex flex-col">
        {/* Wall */}
        <div className="h-1/2 bg-gradient-to-b from-primary/20 to-surface w-full border-b flex-shrink-0" />

        {/* Floor Data Grid */}
        <div className="h-1/2 w-full flex-shrink-0 relative">
          {/* Pet sits in middle */}
          <PetRoomAvatar petData={petData} />

          <div className="absolute inset-0 grid grid-cols-4 grid-rows-2 p-2 gap-2 z-20">
            {grid.slice(0, 8).map((decoId, idx) => (
              <div
                key={idx}
                onClick={() => handleTileTap(idx)}
                className={`flex items-center justify-center rounded-xl transition-all ${selectedInventoryItem && !decoId ? "bg-white/10 border-2 border-dashed border-white/30 cursor-pointer animate-pulse" : "hover:bg-white/5 cursor-pointer"}`}
              >
                {decoId && ROOM_DECORATIONS[decoId] && (
                  <motion.div
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="text-3xl filter drop-shadow-md"
                  >
                    {ROOM_DECORATIONS[decoId].emoji}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div className="mt-8 px-6 flex-1 overflow-hidden flex flex-col">
        <h3 className="text-lg font-bold text-white mb-3">Inventory</h3>
        {inventory.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-textDim border-2 border-dashed border-border rounded-xl">
            No items. Play Merge to find decorations!
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {inventory.map((itemId, i) => {
              const deco = ROOM_DECORATIONS[itemId];
              if (!deco) return null;
              const isSelected = selectedInventoryItem === itemId;

              return (
                <div
                  key={i}
                  onClick={() =>
                    setSelectedInventoryItem(isSelected ? null : itemId)
                  }
                  className={`snap-start shrink-0 w-20 h-24 rounded-2xl border-2 flex flex-col items-center justify-center cursor-pointer transition-all ${isSelected ? "bg-primary/20 border-primary scale-105 shadow-[0_0_15px_rgba(167,139,250,0.4)]" : "bg-surface border-border opacity-80 hover:opacity-100"}`}
                >
                  <span className="text-4xl mb-1">{deco.emoji}</span>
                  <span className="text-[9px] text-center px-1 leading-tight text-textDim">
                    {deco.bonus?.desc || "Decoration"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedInventoryItem && (
        <div className="absolute bottom-24 left-0 right-0 py-2 bg-primary text-white text-center font-bold animate-pulse">
          Tap a glowing space in the room to place!
        </div>
      )}
    </motion.div>
  );
}
