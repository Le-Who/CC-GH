# Build stage: install ALL deps (including devDeps for esbuild/vite), bundle, then
# production stage: copy only what's needed with prod deps.

# ── Stage 1: Build ──
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Run Vite build to generate the production dist/ folder
RUN pnpm run build

# Bundle Discord SDK into public/js/
RUN pnpm exec esbuild src/discord-entry.js --bundle --outfile=public/js/discord-sdk-bundle.js --format=iife --global-name=DiscordSDKModule --target=es2020

# ── Stage 2: Production ──
FROM node:22-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy Vite build output
COPY --from=build /app/dist/ ./dist/

# Copy public directory (needed for Discord SDK)
COPY --from=build /app/public/ ./public/

# Copy backend source
COPY server.js .
COPY game-logic.js .
COPY game-logic/ ./game-logic/
COPY db.js .
COPY playerManager.js .
COPY redisAdapter.js .
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY src/vanilla/ ./src/vanilla/
COPY data/ ./data/

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
