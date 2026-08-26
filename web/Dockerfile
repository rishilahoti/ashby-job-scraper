FROM node:20-alpine AS deps
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /repo/web
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_SECRET
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_API_SECRET=${NEXT_PUBLIC_API_SECRET}
COPY --from=deps /repo/web/node_modules ./node_modules
COPY web/ .
COPY src/config/rules.json /repo/src/config/rules.json
COPY src/intelligence/rules-engine.js /repo/src/intelligence/rules-engine.js
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/web/public ./public
COPY --from=builder /repo/web/.next/standalone ./
COPY --from=builder /repo/web/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
