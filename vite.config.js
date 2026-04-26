import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",  // Auto-updates SW on new deploy
      injectRegister: null,         // Registered by src/services/updateManager.js

      // Workbox configuration
      workbox: {
        // Precache all Vite-built assets (hashed filenames)
        globPatterns: [
          "**/*.{js,css,woff,woff2,svg}",
        ],
        // Skip waiting + claim clients = instant activation on deploy
        skipWaiting: true,
        clientsClaim: true,
        // Clean old caches on SW update
        cleanupOutdatedCaches: true,

        // Runtime caching strategies
        runtimeCaching: [
          // HTML navigation — NetworkFirst (always get fresh HTML from server)
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
          // API GET requests — NetworkFirst with short cache (leaderboard, config, state)
          {
            urlPattern: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/") && url.pathname !== "/api/config",
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "api-get-cache",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 min
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Font files — CacheFirst (fonts rarely change)
          {
            urlPattern: /\.(?:woff|woff2|ttf|otf)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "font-cache",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },

      // PWA manifest
      manifest: {
        name: "Game Hub Ultra",
        short_name: "GameHub",
        description: "Telegram Mini App game hub — Garden Shelf, Trivia, Match-3, Blox, Merge, Bubbo, and Pet Room",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "/game-logic.js": path.resolve(__dirname, "./game-logic.js"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8090",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:8090",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
