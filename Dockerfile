# Build stage: install ALL deps (including devDeps for esbuild), bundle, then
# production stage: copy only what's needed with prod deps.

# ── Stage 1: Build ──
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src/ ./src/
COPY public/ ./public/

# Bundle Discord SDK into public/js/
RUN npx esbuild src/discord-entry.js --bundle --outfile=public/js/discord-sdk-bundle.js --format=iife --global-name=DiscordSDKModule --target=es2020

# ── Stage 2: Production ──
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets from build stage
COPY --from=build /app/public/ ./public/

# Copy server source
COPY server.js .
COPY game-logic.js .
COPY storage.js .
COPY playerManager.js .
COPY routes/ ./routes/
COPY data/ ./data/

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
