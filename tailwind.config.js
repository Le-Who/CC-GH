/** @type {import('tailwindcss').Config} */
import tokens from "./design/tokens.json" assert { type: "json" };

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: tokens.colors,
      fontFamily: {
        heading: tokens.typography.headingFont.split(", "),
        body: tokens.typography.bodyFont.split(", "),
        mono: [tokens.typography.monoFont],
      },
      spacing: tokens.spacing,
      borderRadius: tokens.borderRadius,
      transitionTimingFunction: {
        "ease-in-out-custom": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
