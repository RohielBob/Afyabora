# Base de données et migrations (Prisma)

**Ticket : L0-06.** Le schéma est dans `schema.prisma` ; l'historique des changements est dans `migrations/`.

## Démarrer la base en local

```powershell
pnpm db:up                    # PostgreSQL + Mailpit dans Docker
docker compose ps             # « db » doit être (healthy)
```

Il faut un fichier `apps/api/.env` (copie de `.env.example` avec de vrais secrets). Il n'est **jamais** commité.
La base locale est joignable sur `127.0.0.1:5432` (utilisateur, mot de passe et base de développement : voir `DATABASE_URL`).

## Créer ou modifier la structure (développement)

1. Modifier `schema.prisma`.
2. Générer et appliquer la migration :

   ```powershell
   pnpm --filter @glyka/api exec prisma migrate dev --name description_courte_en_snake_case
   ```

3. **Relire le fichier SQL créé** dans `migrations/<date>_<nom>/migration.sql` avant de commiter (surtout toute ligne `DROP` ou `ALTER`).
4. Commiter ensemble `schema.prisma` **et** le dossier de migration.

La migration initiale s'appelle `init`. Elle crée toutes les tables du CDC.

## Règles

- **Une migration déjà fusionnée dans `develop` ne se modifie jamais.** Pour corriger, on crée une nouvelle migration.
- Une modification de schéma = une migration = une PR. Si deux personnes modifient le schéma en même temps, se coordonner dans le canal d'équipe avant de fusionner.
- Les données de santé réelles n'ont rien à faire dans la base de développement : uniquement les données de démonstration (`pnpm db:seed`).
- Après une modification du schéma (ou après `git pull`), régénérer le client : `pnpm --filter @glyka/api prisma:generate`.

## Vérifier l'état

```powershell
pnpm --filter @glyka/api exec prisma migrate status      # « Database schema is up to date! »
docker compose exec db psql -U glyka -d glyka -c "\dt"   # liste des tables
pnpm --filter @glyka/api prisma:studio                   # interface graphique (optionnel)
```

## Repartir de zéro (développement UNIQUEMENT)

```powershell
pnpm --filter @glyka/api exec prisma migrate reset
```

⚠️ Efface **toutes** les données de la base locale, puis rejoue toutes les migrations. Ne jamais lancer sur un environnement de démonstration ou de production.

## Production et CI

- On applique les migrations existantes avec `prisma migrate deploy` (jamais `migrate dev`, qui peut proposer d'effacer des données).
- L'image Docker de l'API **n'applique pas** les migrations toute seule : c'est une étape explicite du déploiement (ticket L0-10).
- Avant toute migration sur des données réelles : sauvegarde de la base.

## Dépannage

| Message                                        | Cause probable                                                         | Que faire                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `P1001: Can't reach database server`           | Docker éteint, base pas encore prête, ou mauvaise adresse dans `.env`  | `pnpm db:up`, attendre `healthy`, vérifier `DATABASE_URL`                             |
| `P1000: Authentication failed`                 | Mot de passe de `DATABASE_URL` différent de celui de la base existante | Aligner `.env` ; en dernier recours, `docker compose down -v` (efface la base locale) |
| `Environment variable not found: DATABASE_URL` | Pas de fichier `apps/api/.env`                                         | `Copy-Item apps\api\.env.example apps\api\.env`, puis compléter                       |
| Prisma propose de « reset the database »       | La base locale ne correspond pas à l'historique de migrations          | Acceptable en développement si aucune donnée utile ; sinon demander de l'aide         |
