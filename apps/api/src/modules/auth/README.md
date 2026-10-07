# Module `auth`

**Lot : L1 · Fonctionnalité : F1 · Tickets : L1-01 à L1-04**

Comptes, sessions et sécurité des accès (patients et médecins).

## Routes

- POST /auth/register : inscription patient (consentement obligatoire)
- POST /auth/register-doctor : inscription médecin (statut « en attente »)
- POST /auth/verify-email · POST /auth/login · POST /auth/refresh · POST /auth/logout
- POST /auth/forgot-password · POST /auth/reset-password

## Règles de gestion

- Mot de passe : 12 caractères minimum, haché avec Argon2id.
- Email vérifié obligatoire avant la première connexion.
- 5 échecs en 10 minutes : compte verrouillé temporairement.
- Jeton d'accès 15 min ; jeton de rafraîchissement rotatif, stocké haché (`RefreshToken`), détection de réutilisation (famille révoquée).
- Un médecin `PENDING` ne peut pas utiliser `/shares/claim`.
- Messages d'erreur identiques pour « email inconnu » et « mauvais mot de passe ».

## Tests obligatoires

- [ ] Connexion refusée sans email vérifié.
- [ ] Mot de passe de 8 caractères refusé.
- [ ] Verrouillage après 5 échecs.
- [ ] Rotation du refresh : l'ancien jeton ne fonctionne plus.
- [ ] Réutilisation d'un refresh révoque toute la famille.

## Fichiers

| Fichier              | Rôle                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `auth.module.ts`     | Déclaration du module NestJS                                                                           |
| `auth.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `auth.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
