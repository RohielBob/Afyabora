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

## Création d'une session : `POST /shares` (L5-01, **fait**)

- **Entrée** (`createShareSchema`) : au moins une catégorie, sans doublon, et une durée (`MIN_5`, `MIN_30`,
  `HOUR_1`, `CONSULTATION`). Patient seulement (`@Roles('PATIENT')`) ; profil médical obligatoire (sinon 400
  explicite ; compte supprimé : 401). 10 créations par minute au plus (429 ensuite).
- **Sortie** (201, `createShareResponseSchema`) : la session **en attente de scan** (`PENDING`, `claimedAt`
  et `expiresAt` vides : la durée démarre au scan, L5-03 ; catégories triées) et son **premier jeton**.
- **Jeton** (`share-token.ts`) : 32 octets du générateur cryptographique, en base64url (43 caractères, passe
  tel quel dans un QR) ; valable 60 s ; **seul son hash SHA-256 est enregistré**, le jeton n'est écrit nulle
  part (vérifié sur les tables de partage) ni journalisé.
- **Un seul QR en attente** : une nouvelle session remplace celles encore en attente du même patient
  (`EXPIRED`, jetons expirés) ; un ancien QR ne peut plus ouvrir d'accès. Les sessions `ACTIVE` et celles
  des autres patients ne sont pas touchées. Deux créations simultanées (double appui) passent l'une après
  l'autre (verrou PostgreSQL par patient, `pg_advisory_xact_lock`) : une seule session reste en attente.
- Session et jeton sont écrits dans **une** transaction. Elle attend jusqu'à 10 s une connexion (2 s par
  défaut) : sous forte charge, une transaction en attente du verrou garde sa connexion. Base vraiment
  saturée : **503** « Le partage est momentanément indisponible. Réessayez dans un instant. », jamais 500.
  (Trouvé en faisant tourner toute la suite : 10 créations simultanées donnaient une erreur 500.)
- Tests : `test/sharing-token.test.ts` et `test/sharing-service.test.ts` (sans base, tournent partout) ;
  `test/sharing-create.test.ts`
  (vraie base PostgreSQL, uniquement sur une base `…_test` : voir le README du module `sync` pour la lancer
  en local).

## Tests obligatoires

- [ ] Même QR scanné deux fois : le second refusé.
- [ ] Jeton de plus de 60 s refusé.
- [ ] Deux claims simultanés : un seul réussit.
- [ ] Après expiration : 403 sur toutes les routes médecin.
- [ ] Révocation effective en moins de 5 s.
- [ ] Médecin `PENDING` refusé.
- [x] Le hash seul est en base (aucune colonne ne contient le jeton) (L5-01).

## Fichiers

| Fichier                 | Rôle                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `sharing.module.ts`     | Déclaration du module NestJS                                                                           |
| `sharing.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `sharing.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
