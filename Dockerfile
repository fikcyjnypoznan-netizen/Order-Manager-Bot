FROM node:24-slim

# Install pnpm
RUN npm install -g pnpm@10.26.1

WORKDIR /app

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy all source packages
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

# Install all dependencies (no frozen - lockfile has Replit-specific overrides)
RUN pnpm install --no-frozen-lockfile

# Build the bot
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "scripts/railway-start.sh"]
