# Build: install deps, bundle Discord SDK, prune for production
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy source files needed for the build
COPY src/ ./src/
COPY public/ ./public/
COPY server.js .
COPY game-logic.js .
COPY storage.js .
COPY playerManager.js .
COPY routes/ ./routes/
COPY data/ ./data/

# Bundle Discord SDK into public/js/
RUN npx esbuild src/discord-entry.js --bundle --outfile=public/js/discord-sdk-bundle.js --format=iife --global-name=DiscordSDKModule --target=es2020

# Remove devDependencies for smaller image
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
