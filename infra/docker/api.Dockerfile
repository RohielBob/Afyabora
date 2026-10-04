# Image de l'API (profil "full" de docker-compose). À finaliser en L0-05.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @glyka/api build
EXPOSE 3000
CMD ["pnpm", "--filter", "@glyka/api", "start:prod"]
