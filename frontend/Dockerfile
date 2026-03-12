FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG API_URL=http://localhost:8000
ENV API_URL=$API_URL
RUN npm run build

FROM node:22-alpine AS runtime

# Apply OS security patches
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV API_URL=http://localhost:8000

EXPOSE 3000

CMD ["node", "server.js"]
