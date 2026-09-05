FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/feed-generator/package.json apps/feed-generator/package.json
COPY packages/labels-def/package.json packages/labels-def/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
COPY packages/labels-def packages/labels-def
COPY packages/tsconfig packages/tsconfig
COPY apps/feed-generator apps/feed-generator
WORKDIR /app/apps/feed-generator
CMD ["pnpm", "start"]
