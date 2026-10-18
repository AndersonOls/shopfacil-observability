FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages
COPY services ./services
COPY gateway ./gateway

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --omit=dev --no-audit --no-fund

CMD ["node", "services/catalog/src/server.js"]
