FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY admin/package.json admin/
COPY server/package.json server/
COPY mcp/package.json mcp/

# Skip lifecycle scripts in CI (no .git for husky); avoid audit in Docker
ENV HUSKY=0
ENV CI=true
ENV npm_config_audit=false
RUN npm ci --ignore-scripts

COPY . .

RUN npx prisma generate --schema=server/prisma/schema.prisma
# Avoid OOM on Railway; single RUN for build
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

RUN npm prune --omit=dev

FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/scripts ./server/scripts
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md ./mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/client/package.json ./client/package.json
COPY --from=builder /app/admin/dist ./admin/dist
COPY --from=builder /app/admin/package.json ./admin/package.json

ENV NODE_ENV=production

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs -s /bin/false nodejs
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

CMD ["npm", "run", "start"]
