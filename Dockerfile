# Build stage: install all deps for the Vite client build, then
# production stage: copy only runtime files with production deps.

# ── Stage 1: Build ──
FROM node:22-alpine AS build
WORKDIR /app
ARG BUILD_ID=local
ENV VITE_BUILD_ID=$BUILD_ID

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Run Vite build to generate the production dist/ folder.
RUN pnpm run build

# ── Stage 2: Production ──
FROM node:22-alpine
WORKDIR /app
ARG BUILD_ID=local
ENV APP_BUILD_ID=$BUILD_ID

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy Vite build output
COPY --from=build /app/dist/ ./dist/

# Copy public assets.
COPY --from=build /app/public/ ./public/

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

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
