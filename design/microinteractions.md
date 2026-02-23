# Microinteraction Specifications

This document defines the physical interaction models for the high-end React UI migration. All implementations should utilize **Framer Motion**.

## 1. Bottom Nav Spring Indicator

- **Trigger:** Active tab state change.
- **Component:** Floating indicator pill behind the icon.
- **Motion Spec:** `layoutId="nav-pill"` with transition `{ type: "spring", stiffness: 500, damping: 30 }`.
- **Effect:** The pill "squishes" slightly as it travels between tabs, simulating velocity.

## 2. Gacha "Near Miss" Slot Roll

- **Trigger:** User spends 10 Gacha Tokens.
- **Motion Spec:**
  - Item reel spins blurring vertically `filter: blur(4px)`.
  - Drops to a halt using an ease-out cubic-bezier over `3.0s`.
  - If a "Near Miss" (Top tier item is immediately above the selected item), the reel stutters and bounces backward by `5px` before settling.
- **Haptic:** Provide a visual "bump" (scale 1.1 -> 1.0) on settle.

## 3. Top HUD Energy Fill (Zeigarnik Effect)

- **Trigger:** Energy regen tick.
- **Motion Spec:** The energy pill uses an animating background gradient fill. When energy increments, a white flash `scale(1.2)` hits the lightning icon with a `.15s` decay.
- **State Change:** When max energy is reached, the stroke color shifts from `#FFD700` to `#00C853` with a glowing `box-shadow` pulse.

## 4. Farm Uproot Confirmation

- **Trigger:** Long-press (2.5s) on crop.
- **Motion Spec:** Circular progress SVG stroke fills around the finger/pointer. If released early, it snaps back to 0 abruptly `{ type: "spring", stiffness: 800 }` (Hit-Stop).

## 5. Viewport Route Transitions (Native SPA)

- **Trigger:** Tab switch.
- **Motion Spec:**
  - Entering screen: `opacity: 0 -> 1`, `x: 50px -> 0px`. Transition: `{ ease: "easeOut", duration: 0.3 }`.
  - Exiting screen: `opacity: 1 -> 0`, `x: 0px -> -50px`. Transition: `{ ease: "easeIn", duration: 0.2 }`.
  - Prevents "AI slop" basic fades and mimics high-end iOS navigation.
