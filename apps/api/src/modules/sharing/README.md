# Module `sharing`

**Lot : L5 · Fonctionnalité : F7 · Tickets : L5-01, L5-02, L5-04, L5-05, L5-14**

CŒUR DU PRODUIT — partage par QR dynamique : sessions, jetons rotatifs à usage unique, révocation.

## Routes
- POST /shares : crée une session (catégories + durée) et renvoie le premier jeton
- GET /shares/:id/token : nouveau jeton (rotation toutes les 60 s) tant que la session est `PENDING`
- GET /shares/:id/status : état (PENDING / ACTIVE / EXPIRED / REVOKED) pour l'app patient (polling ou SSE)
- DELETE /shares/:id : révocation immédiate
- POST /shares/claim : le médecin consomme le jeton (médecin approuvé uniquement)
- GET /shares/log : journal d'accès du patient

## Règles de gestion
- Le QR contient un jeton opaque (≥ 32 octets), JAMAIS de donnée médicale.
- Seul le HASH SHA-256 du jeton est stocké.
- TTL du jeton : 60 s (`SHARE_TOKEN_TTL_SECONDS`). Usage unique : consommation ATOMIQUE (deux scans simultanés : un seul gagne).
- La durée d'accès démarre au scan : `expiresAt = claimedAt + durée`. « Consultation » : maximum 2 h, le patient peut mettre fin avant.
- Seul un médecin `APPROVED` peut claim ; il est rattaché à la session.
- Limitation de débit sur `/shares/claim` (≥ 5 échecs/min/IP : blocage).
- Notes personnelles décochées par défaut côté app ; catégorie absente = jamais exposée.
- Toute étape écrit dans `AccessLog` (SHARE_CLAIMED, SHARE_REVOKED, SHARE_EXPIRED…).
- Une tâche planifiée passe les sessions échues à `EXPIRED`, mais l'expiration est aussi vérifiée à CHAQUE requête.

## Tests obligatoires
- [ ] Même QR scanné deux fois : le second refusé.
- [ ] Jeton de plus de 60 s refusé.
- [ ] Deux claims simultanés : un seul réussit.
- [ ] Après expiration : 403 sur toutes les routes médecin.
- [ ] Révocation effective en moins de 5 s.
- [ ] Médecin `PENDING` refusé.
- [ ] Le hash seul est en base (aucune colonne ne contient le jeton).

## Fichiers
| Fichier | Rôle |
|---|---|
| `sharing.module.ts` | Déclaration du module NestJS |
| `sharing.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `sharing.service.ts` | Logique métier et accès base (Prisma) |

## Rappels
- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
