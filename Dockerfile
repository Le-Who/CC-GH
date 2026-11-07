# Build stage: install all deps for the Vite client build, then
# production stage: copy only runtime files with production deps.

# ── Stage 1: Build ──
FROM node:24-alpine AS build
WORKDIR /app
ARG BUILD_ID=local
ENV VITE_BUILD_ID=$BUILD_ID
ARG VITE_YARD_PIP_PREVIEW=false
ENV VITE_YARD_PIP_PREVIEW=$VITE_YARD_PIP_PREVIEW

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Run Vite build to generate the production dist/ folder.
RUN case "$VITE_YARD_PIP_PREVIEW" in true|false) ;; *) exit 64 ;; esac \
    && pnpm run build && node scripts/yard-public-media.mjs --verify dist

# ── Stage 2: Production ──
FROM node:24-alpine
WORKDIR /app
ARG BUILD_ID=local
ENV APP_BUILD_ID=$BUILD_ID

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy Vite build output
COPY --from=build /app/dist/ ./dist/

# Copy backend source
COPY server.js .
COPY game-logic.js .
COPY game-logic/ ./game-logic/
COPY db.js .
COPY accountManager.js .
COPY playerManager.js .
COPY socketManager.js .
COPY redisAdapter.js .
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY data/ ./data/
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/

# Verify final image delivery without any recovery-tools/ or public/ source trees.
RUN node scripts/yard-public-media.mjs --verify dist

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
