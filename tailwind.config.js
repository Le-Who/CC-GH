/** @type {import('tailwindcss').Config} */
import tokens from "./design/tokens.json" assert { type: "json" };

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Backgrounds */
        background: tokens.colors.background.base,
        surface: tokens.colors.background.surface,
        surfaceHover: tokens.colors.background.surfaceHover,
        surfaceHighlight: tokens.colors.background.surfaceHighlight,
        overlay: tokens.colors.background.overlay,
        /* Brand */
        primary: tokens.colors.brand.primary,
        primaryHover: tokens.colors.brand.primaryHover,
        secondary: tokens.colors.brand.secondary,
        accent: tokens.colors.brand.accent,
        /* UI */
        text: tokens.colors.ui.text,
        textDim: tokens.colors.ui.textDim,
        textMuted: tokens.colors.ui.textMuted,
        border: tokens.colors.ui.border,
        gold: tokens.colors.ui.gold,
        energy: tokens.colors.ui.energy,
        danger: tokens.colors.ui.danger,
        success: tokens.colors.ui.success,
        info: tokens.colors.ui.info,
        /* Rarity */
        "rarity-common": tokens.colors.rarity.common,
        "rarity-rare": tokens.colors.rarity.rare,
        "rarity-epic": tokens.colors.rarity.epic,
        "rarity-legendary": tokens.colors.rarity.legendary,
      },
      fontFamily: {
        display: tokens.typography.fontFamilies.display.split(", "),
        heading: tokens.typography.fontFamilies.display.split(", "),
        body: tokens.typography.fontFamilies.body.split(", "),
        numbers: tokens.typography.fontFamilies.numbers.split(", "),
        mono: tokens.typography.fontFamilies.mono.split(", "),
      },
      spacing: tokens.spacing,
      borderRadius: tokens.borderRadius,
      transitionTimingFunction: {
        spring: tokens.motion.easing.spring,
        bouncy: tokens.motion.easing.bouncy,
        snappy: tokens.motion.easing.snappy,
      },
    },
  },
  plugins: [],
};
