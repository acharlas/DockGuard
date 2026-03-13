FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS source

ARG API_URL=http://localhost:8000
ARG NEXT_PUBLIC_GRAFANA_URL=
ENV API_URL=${API_URL} \
    NEXT_PUBLIC_GRAFANA_URL=${NEXT_PUBLIC_GRAFANA_URL}
COPY . .

FROM source AS builder

RUN npm run build

FROM source AS dev

CMD ["npm", "run", "dev"]

FROM node:22-alpine AS runtime

# Apply OS security patches
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*
RUN addgroup -S dockguard && adduser -S -G dockguard dockguard

WORKDIR /app
COPY --from=builder --chown=dockguard:dockguard /app/.next/standalone ./
COPY --from=builder --chown=dockguard:dockguard /app/.next/static ./.next/static
COPY --from=builder --chown=dockguard:dockguard /app/public ./public

ENV API_URL=http://localhost:8000

USER dockguard

EXPOSE 3000

CMD ["node", "server.js"]
