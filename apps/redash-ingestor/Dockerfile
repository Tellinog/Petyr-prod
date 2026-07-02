FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 600000 \
  && for attempt in 1 2 3; do \
    if [ -f package-lock.json ]; then \
      npm ci --include=dev --no-audit --no-fund; \
    else \
      npm install --include=dev --no-audit --no-fund; \
    fi && break; \
    if [ "$attempt" = "3" ]; then exit 1; fi; \
    echo "npm install failed, retrying in 10s (attempt $attempt/3)"; \
    sleep 10; \
  done

FROM node:20-alpine AS builder

WORKDIR /app

# Dummy build-time values. Runtime values are loaded from .env / server env.
ENV DATABASE_URL="postgresql://unguess:unguess_password@postgres:5432/unguess_redash?schema=public"
ENV REDASH_BASE_URL="https://data.app-quality.com"
ENV REDASH_API_KEY="build_time_placeholder"
ENV APP_INTERNAL_SECRET="build_time_placeholder"
ARG NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH=""
ENV NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH="${NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH}"

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH=""
ENV NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH="${NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH}"

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

CMD ["npm", "run", "start"]
