FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN --mount=type=cache,id=apt,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lib,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    openssl libssl3 ca-certificates \
    && corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/llm/package.json packages/llm/
COPY packages/brokers/package.json packages/brokers/
COPY packages/schemas/package.json packages/schemas/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @trader/db prisma:generate

FROM build AS runner
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@trader/api", "dev"]
