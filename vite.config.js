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
        // Precache Vite-built shell assets only. Runtime art is cached on demand below.
        globPatterns: [
          "**/*.{js,css,woff,woff2}",
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
          // Runtime art — CacheFirst, loaded lazily per game/scene.
          {
            urlPattern: ({ url, request }) =>
              (
                url.pathname.startsWith("/assets-runtime/") ||
                url.pathname.startsWith("/games/")
              ) &&
              ["image", "audio", "font"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "runtime-art-v1",
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 365,
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
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !dep.includes("pixi-vendor"));
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("pixi.js") || id.includes("@pixi")) return undefined;
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils") || id.includes("@emotion/is-prop-valid")) return "motion-vendor";
          if (id.includes("lucide-react")) return "icon-vendor";
          if (id.includes("@telegram-apps")) return "telegram-vendor";
          if (
            id.includes("socket.io-client") ||
            id.includes("socket.io-parser") ||
            id.includes("engine.io-client") ||
            id.includes("engine.io-parser") ||
            id.includes("@socket.io") ||
            id.includes("component-emitter") ||
            id.includes("parseuri")
          ) return "socket-vendor";
          if (id.includes("workbox-window")) return "workbox-vendor";
          if (id.includes("canvas-confetti")) return "garden-effects-vendor";
          if (id.includes("idb-keyval")) return "storage-vendor";
          if (id.includes("zustand")) return "state-vendor";
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          return "vendor";
        },
      },
    },
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
