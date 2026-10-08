# infra/

Tout ce qui sert à faire tourner Glyka en local ou en intégration.

| Fichier                 | Rôle                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `../docker-compose.yml` | PostgreSQL + Mailpit (emails de dev) ; profil `full` pour lancer aussi l'API     |
| `../.dockerignore`      | Ce que Docker ne copie pas dans l'image (jamais de `.env`, ni de `node_modules`) |
| `docker/api.Dockerfile` | Image de l'API (Debian slim, Prisma généré, exécutée sans droits root)           |

**Responsable : Lot L0 (Socle).**
Les workflows CI sont dans `.github/workflows/` (`ci.yml` pour le code, `docker.yml` pour Docker).

## Commandes

| Commande (racine du dépôt) | Effet                                                                          |
| -------------------------- | ------------------------------------------------------------------------------ |
| `pnpm db:up`               | Démarre PostgreSQL et Mailpit en arrière-plan                                  |
| `pnpm db:logs`             | Affiche les journaux de la base et de Mailpit (Ctrl+C pour quitter)            |
| `pnpm db:down`             | Arrête les conteneurs. **Les données sont conservées** (volume `glyka_pgdata`) |
| `pnpm docker:api`          | Construit l'image de l'API et lance base + Mailpit + API dans Docker           |

## Adresses

| Service             | Adresse sur ta machine | Remarque                                                           |
| ------------------- | ---------------------- | ------------------------------------------------------------------ |
| PostgreSQL          | `127.0.0.1:5432`       | Accessible seulement depuis ta machine, pas depuis le réseau local |
| Mailpit (SMTP)      | `127.0.0.1:1025`       | Reçoit les emails envoyés par l'API                                |
| Mailpit (interface) | http://localhost:8025  | Pour lire les emails de vérification en développement              |
| API (profil `full`) | http://localhost:3000  | Santé : `/health` · Documentation : `/docs`                        |

## Deux façons de lancer l'API

1. **Développement au quotidien** : `pnpm db:up` puis `pnpm dev:api`. L'API tourne sur ta machine et vise la base en `localhost`.
2. **Valider l'image Docker** (ticket L0-05) : `pnpm docker:api`. L'API tourne dans Docker. Dans Docker, `localhost` désigne le conteneur lui-même : le compose remplace donc `DATABASE_URL` et `SMTP_HOST` pour viser les services `db` et `mailpit`.

Ne lance pas les deux en même temps : ils utilisent tous les deux le port 3000.

## Valider L0-05 (checklist)

- [ ] `pnpm --filter @glyka/api build` produit `apps/api/dist/main.js`
- [ ] `pnpm docker:api` construit l'image sans erreur
- [ ] `http://localhost:3000/health` répond `{"status":"ok", ...}` depuis le conteneur
- [ ] `docker compose ps` montre `db` et `api` en `healthy`
- [ ] Le workflow GitHub **Docker** est vert sur la PR

## Si ça ne marche pas

- **Port déjà utilisé (5432, 3000, 8025)** : un autre programme l'occupe (une API lancée avec `pnpm dev:api`, un PostgreSQL installé sur la machine). Arrête-le, ou arrête-le avant de lancer `pnpm docker:api`.
- **L'API refuse de démarrer avec « Configuration invalide »** : le message nomme la variable à corriger dans `apps/api/.env`. Les valeurs d'exemple de `.env.example` sont volontairement refusées ; les commandes pour générer de vraies valeurs sont dans ce fichier.
- **Le build de l'image échoue à `pnpm install`** : envoie le journal complet de l'étape ; c'est probablement une dépendance native ou une version de pnpm.
- **Repartir d'une base vide** : `docker compose down --volumes` supprime aussi le volume, donc **toutes les données de développement**. À ne lancer que si c'est voulu.

## Limites connues

- L'image contient encore les dépendances de développement (elle est plus grosse que nécessaire) : allègement prévu avec le déploiement (ticket L0-10).
- L'image Mailpit utilise le tag `latest` (outil de développement uniquement, jamais déployé).
- Le schéma de la base n'est pas créé par le compose : les migrations Prisma arrivent avec le ticket L0-06.
