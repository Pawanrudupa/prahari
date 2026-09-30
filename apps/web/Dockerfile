FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml package.json* pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY apps/web apps/web

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["pnpm", "dev", "--host"]
