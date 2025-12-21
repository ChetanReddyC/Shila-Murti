# ------------------------------------------------------
# 1. Dependency install stage
# ------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y nano vim curl iputils-ping postgresql-client python3

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --legacy-peer-deps

# ------------------------------------------------------
# 2. Builder stage
# ------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

ARG ENV_FILE_CONTENTS

RUN printf "%s" "$ENV_FILE_CONTENTS" > .env.production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN npm run build

# ------------------------------------------------------
# 3. Production runtime
# ------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y \
    nano \
    vim \
    curl \
    iputils-ping \
    postgresql-client \
 && rm -rf /var/lib/apt/lists/*
 
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.env.production .env.local

RUN chmod +x .env.local 

EXPOSE 3000

CMD ["node", "server.js"]