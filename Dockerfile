# syntax=docker/dockerfile:1
# FINOPS ERP — Reproducible Multi-Stage Dockerfile (Development & Validation)
# Production deployment remains on Vercel (api/index.ts + api/_server.cjs + dist/).

ARG NODE_VERSION=22.14.0-bookworm-slim

# -----------------------------------------------------------------------------
# 1. Base runtime (pinned Node.js 22 LTS)
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true

# -----------------------------------------------------------------------------
# 2. Full dependencies (via npm ci + package-lock.json)
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force && chown -R node:node /app

# -----------------------------------------------------------------------------
# 3. Build verification stage (dist/, dist/server.cjs, api/_server.cjs)
# -----------------------------------------------------------------------------
FROM deps AS builder
COPY tsconfig.json vite.config.ts vitest.config.ts index.html server.ts ./
COPY firebase-applet-config.json firebase-blueprint.json firebase.json firestore.indexes.json firestore.rules .gcloudignore ./
COPY api ./api
COPY public ./public
COPY src ./src
RUN npm run build

# -----------------------------------------------------------------------------
# 4. Production-only dependencies (for optional built runtime preview)
# -----------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# -----------------------------------------------------------------------------
# 5. Built runtime preview stage (docker build --target prod-preview)
#    Runs compiled Express + static dist/ via npm start (NODE_ENV=production)
# -----------------------------------------------------------------------------
FROM base AS prod-preview
ENV NODE_ENV=production \
    PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json firebase-applet-config.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]

# -----------------------------------------------------------------------------
# 6. Default target: Development & Full Validation (Express + Vite + Vitest/TSC)
#    Binds 0.0.0.0 using PORT from environment (forwarded via DEFAULT_APP_PORT)
# -----------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development \
    PORT=3000 \
    DISABLE_HMR=true

COPY --chown=node:node package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts index.html server.ts ./
COPY --chown=node:node firebase-applet-config.json firebase-blueprint.json firebase.json firestore.indexes.json firestore.rules .gcloudignore ./
COPY --chown=node:node api ./api
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
COPY --chown=node:node tests ./tests
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/api/_server.cjs ./api/_server.cjs
COPY --from=builder --chown=node:node /app/api/_server.cjs.map ./api/_server.cjs.map

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "DEFAULT_APP_PORT=\"${PORT:-3000}\" exec npm run dev"]
