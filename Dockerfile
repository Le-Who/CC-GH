# Build stage: install ALL deps (including devDeps for esbuild/vite), bundle, then
# production stage: copy only what's needed with prod deps.

# ── Stage 1: Build ──
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install -g npm@11.10.1 && npm ci

COPY . .

# Run Vite build to generate the production dist/ folder
RUN npm run build

# Bundle Discord SDK into public/js/
RUN npx esbuild src/discord-entry.js --bundle --outfile=public/js/discord-sdk-bundle.js --format=iife --global-name=DiscordSDKModule --target=es2020

# ── Stage 2: Production ──
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install -g npm@11.10.1 && npm ci --omit=dev

# Copy Vite build output
COPY --from=build /app/dist/ ./dist/

# Copy public directory (needed for Discord SDK)
COPY --from=build /app/public/ ./public/

# Copy backend source
COPY server.js .
COPY game-logic.js .
COPY storage.js .
COPY playerManager.js .
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY src/vanilla/ ./src/vanilla/
COPY data/ ./data/

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
