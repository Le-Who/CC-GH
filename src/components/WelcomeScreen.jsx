import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * WelcomeScreen — Onboarding overlay shown on first visit.
 * Masks Discord SDK initialization latency with a delightful multi-stage flow.
 *
 * Psychology models applied:
 *  - Activation Energy: low-barrier, auto-advancing stages
 *  - IKEA Effect: pet naming creates emotional attachment
 *  - Endowment Effect: free seed gift
 *  - Peak-End Rule: memorable animated entrance
 *  - Commitment & Consistency: micro-commitment CTA
 */

const STAGES = ["loading", "greeting", "pet-name", "free-seed", "ready"];

// Framer-motion spring presets from tokens
const spring = { type: "spring", stiffness: 400, damping: 20 };
const springBouncy = { type: "spring", stiffness: 500, damping: 15 };

export default function WelcomeScreen({ onComplete, isReady }) {
  const [stage, setStage] = useState("loading");
  const [petName, setPetName] = useState("Sparky");
  const [petNameError, setPetNameError] = useState("");
  const startTime = useRef(Date.now());
  const inputRef = useRef(null);

  // Advance from loading once the app is ready
  useEffect(() => {
    if (isReady && stage === "loading") {
      // Small delay so the greeting animation feels intentional, not jarring
      const checkOnboarded = () => {
        // 1. Server-side flag (survives Discord iframe resets)
        const serverOnboarded = window.HUB?._onboarded;
        // 2. Pet name changed from default (implicit onboarding signal)
        const petName = window.HUB?.pet?.name || window.GameStore?.getState?.("pet")?.name;
        const petRenamed = petName && petName !== "Buddy";
        // 3. localStorage fallback (fastest, but ephemeral in Discord)
        const localOnboarded = localStorage.getItem("gh_onboarded");
        return serverOnboarded || petRenamed || localOnboarded;
      };
      const t = setTimeout(() => {
        if (checkOnboarded()) {
          onComplete();
        } else {
          // Farm API may still be in-flight — re-check once more after 1s
          const retry = setTimeout(() => {
            if (stage === "greeting" || stage === "loading") return; // user already moved on
            if (checkOnboarded()) onComplete();
          }, 1500);
          setStage("greeting");
          return () => clearTimeout(retry);
        }
      }, 600);
      return () => clearTimeout(t);
    }
  }, [isReady, stage]);

  // Auto-advance from greeting after 2.5s
  useEffect(() => {
    if (stage === "greeting") {
      const t = setTimeout(() => setStage("pet-name"), 2500);
      return () => clearTimeout(t);
    }
  }, [stage]);

  // Focus the input when pet-name stage appears
  useEffect(() => {
    if (stage === "pet-name" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [stage]);

  const handlePetNameSubmit = useCallback(async () => {
    const trimmed = petName.trim();
    if (trimmed.length < 2 || trimmed.length > 12) {
      setPetNameError("Name must be 2–12 characters");
      return;
    }
    if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) {
      setPetNameError("Letters, numbers, and spaces only");
      return;
    }
    setPetNameError("");

    // Save pet name visually first
    if (window.HUB?.playerData) {
      window.HUB.playerData.petName = trimmed;
    }

    // Persist to server if API is ready
    if (window.HUB?.api) {
      try {
        await window.HUB.api("/api/pet/rename", { newName: trimmed });
      } catch (e) {
        console.warn("Failed to persist pet name", e);
      }
    }

    // Analytics placeholder
    console.log("[Analytics] WELCOME_PET_NAMED", {
      name: trimmed,
      isDefault: trimmed === "Sparky",
    });
    setStage("free-seed");
  }, [petName]);

  const handleClaimSeed = useCallback(() => {
    console.log("[Analytics] WELCOME_SEED_CLAIMED", { seedType: "strawberry" });
    setStage("ready");
  }, []);

  const handleStart = useCallback(() => {
    const durationMs = Date.now() - startTime.current;
    console.log("[Analytics] WELCOME_COMPLETED", { durationMs });
    localStorage.setItem("gh_onboarded", "true");
    if (window.HUB) window.HUB._onboarded = true;
    onComplete();
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    console.log("[Analytics] WELCOME_SKIPPED", { stageAtSkip: stage });
    localStorage.setItem("gh_onboarded", "true");
    if (window.HUB) window.HUB._onboarded = true;
    onComplete();
  }, [stage, onComplete]);

  // Container variants for staggered children
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.2 },
    },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } },
  };

  const childVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: spring },
  };

  return (
    <div
      className="welcome-screen"
      role="dialog"
      aria-label="Welcome to Cozy Farm Hub"
      aria-live="polite"
    >
      {/* Animated mesh gradient background */}
      <div className="welcome-bg" aria-hidden="true">
        <div className="welcome-bg__orb welcome-bg__orb--pink" />
        <div className="welcome-bg__orb welcome-bg__orb--teal" />
        <div className="welcome-bg__orb welcome-bg__orb--gold" />
      </div>

      <AnimatePresence mode="wait">
        {/* ── LOADING ── */}
        {stage === "loading" && (
          <motion.div
            key="loading"
            className="welcome-stage"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div className="welcome-logo" variants={childVariants}>
              🌱
            </motion.div>
            <motion.h1 className="welcome-title" variants={childVariants}>
              Cozy Farm Hub
            </motion.h1>
            <motion.p className="welcome-subtitle" variants={childVariants}>
              Preparing your farm…
            </motion.p>
            <motion.div className="welcome-shimmer" variants={childVariants}>
              <div className="welcome-shimmer__bar" />
            </motion.div>
          </motion.div>
        )}

        {/* ── GREETING ── */}
        {stage === "greeting" && (
          <motion.div
            key="greeting"
            className="welcome-stage"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="welcome-emoji-burst"
              variants={childVariants}
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              🎉
            </motion.div>
            <motion.h1 className="welcome-title" variants={childVariants}>
              Welcome, Farmer!
            </motion.h1>
            <motion.p className="welcome-subtitle" variants={childVariants}>
              Your cozy adventure begins now
            </motion.p>
          </motion.div>
        )}

        {/* ── PET NAME ── */}
        {stage === "pet-name" && (
          <motion.div
            key="pet-name"
            className="welcome-stage"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="welcome-pet-preview"
              variants={childVariants}
            >
              🐕
            </motion.div>
            <motion.h2 className="welcome-title--sm" variants={childVariants}>
              Name your companion
            </motion.h2>
            <motion.p className="welcome-subtitle" variants={childVariants}>
              They'll help you tend the farm!
            </motion.p>
            <motion.div
              className="welcome-input-group"
              variants={childVariants}
            >
              <input
                ref={inputRef}
                type="text"
                className="welcome-input"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePetNameSubmit()}
                maxLength={12}
                aria-label="Pet name"
                aria-invalid={!!petNameError}
                aria-describedby={petNameError ? "pet-name-error" : undefined}
              />
              {petNameError && (
                <p id="pet-name-error" className="welcome-error" role="alert">
                  {petNameError}
                </p>
              )}
            </motion.div>
            <motion.button
              className="welcome-btn welcome-btn--primary"
              variants={childVariants}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95, y: 2 }}
              onClick={handlePetNameSubmit}
            >
              That's perfect! →
            </motion.button>
          </motion.div>
        )}

        {/* ── FREE SEED ── */}
        {stage === "free-seed" && (
          <motion.div
            key="free-seed"
            className="welcome-stage"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="welcome-gift"
              variants={childVariants}
              animate={{ y: [0, -10, 0], rotate: [0, -3, 3, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              🎁
            </motion.div>
            <motion.h2 className="welcome-title--sm" variants={childVariants}>
              A gift from the village!
            </motion.h2>
            <motion.div
              className="welcome-reward-card"
              variants={childVariants}
            >
              <span className="welcome-reward-emoji">🍓</span>
              <div>
                <strong>3× Strawberry Seeds</strong>
                <p className="welcome-reward-desc">Your first harvest awaits</p>
              </div>
            </motion.div>
            <motion.button
              className="welcome-btn welcome-btn--gold"
              variants={childVariants}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95, y: 2 }}
              transition={springBouncy}
              onClick={handleClaimSeed}
            >
              🌱 Claim Seeds
            </motion.button>
          </motion.div>
        )}

        {/* ── READY ── */}
        {stage === "ready" && (
          <motion.div
            key="ready"
            className="welcome-stage"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="welcome-ready-icon"
              variants={childVariants}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              🌱
            </motion.div>
            <motion.h1 className="welcome-title" variants={childVariants}>
              Your farm is ready!
            </motion.h1>
            <motion.p className="welcome-subtitle" variants={childVariants}>
              {petName.trim()} can't wait to get started
            </motion.p>
            <motion.button
              className="welcome-btn welcome-btn--primary welcome-btn--lg"
              variants={childVariants}
              whileHover={{ scale: 1.08, y: -3 }}
              whileTap={{ scale: 0.92, y: 3 }}
              transition={springBouncy}
              onClick={handleStart}
              autoFocus
            >
              🚀 Start Farming
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip link — visible on stages after loading */}
      {stage !== "loading" && stage !== "ready" && (
        <motion.button
          className="welcome-skip"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={handleSkip}
          aria-label="Skip onboarding"
        >
          Skip →
        </motion.button>
      )}
    </div>
  );
}
