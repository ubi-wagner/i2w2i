# syntax=docker/dockerfile:1
# S-O-M's image. Built from this folder (Railway service root directory: apps/som).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Icons and the service worker: the installable app.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# For the migration runner and bootstrap script, which run outside Next's bundle.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --chown=nextjs:nodejs db ./db
COPY --chown=nextjs:nodejs scripts/bootstrap.mjs scripts/check-env.mjs ./scripts/
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
USER nextjs
EXPOSE 3000
CMD ["sh", "./entrypoint.sh"]
