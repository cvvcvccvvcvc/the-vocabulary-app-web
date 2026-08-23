FROM node:24-bookworm-slim AS build

RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.client.json tsconfig.server.json vite.config.ts vitest.config.ts index.html ./
COPY public ./public
COPY src ./src
COPY migrations ./migrations

RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000
CMD ["node", "dist-server/server/index.js"]

