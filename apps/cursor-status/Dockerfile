FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/cursor-status/package.json apps/cursor-status/package.json
COPY apps/label-bot/package.json apps/label-bot/package.json
COPY apps/label-browser/package.json apps/label-browser/package.json
COPY packages/labels-def/package.json packages/labels-def/package.json
COPY packages/labels-sync/package.json packages/labels-sync/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
COPY . .
WORKDIR /app/apps/cursor-status
CMD ["pnpm", "start"]
