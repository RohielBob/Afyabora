# Image de l'API Glyka (profil « full » de docker-compose.yml). Ticket L0-05.
# Construire depuis la RACINE du dépôt : docker build -f infra/docker/api.Dockerfile .
#
# Choix :
# - Debian « slim » (et non Alpine) : Prisma et argon2 y fonctionnent sans réglage particulier.
# - openssl est requis par Prisma.
# - L'image n'est pas minimale (les dépendances de développement restent). Un allègement en
#   plusieurs étapes viendra avec le déploiement (ticket L0-10), une fois ce build validé.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# HUSKY=0 : pas de hooks Git dans une image Docker.
ENV HUSKY=0
RUN corepack enable

WORKDIR /app
COPY . .

# On n'installe que l'API et ses dépendances de workspace (shared, analytics),
# pas le mobile ni le portail : bien plus rapide et plus léger.
RUN pnpm install --frozen-lockfile --filter "@glyka/api..."

# Le client Prisma doit être généré AVANT la compilation de l'API.
RUN pnpm --filter @glyka/api exec prisma generate

# « @glyka/api... » = l'API ET ses dépendances : shared et analytics sont compilés d'abord.
RUN pnpm --filter "@glyka/api..." build

ENV NODE_ENV=production
WORKDIR /app/apps/api

# On ne tourne jamais en root.
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
