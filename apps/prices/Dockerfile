# Build from the repo root: docker build -f apps/prices/Dockerfile .
FROM node:22-alpine AS build
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/prices/package.json apps/prices/
RUN pnpm install --frozen-lockfile --filter @midbig/prices...
COPY packages/shared packages/shared
COPY apps/prices apps/prices
RUN pnpm --filter @midbig/shared build && pnpm --filter @midbig/prices build \
 && pnpm --filter @midbig/prices deploy --prod --legacy /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations PORT=8080
COPY --from=build /out .
COPY db/migrations ./migrations
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
