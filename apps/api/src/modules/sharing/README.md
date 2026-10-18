# Module `sharing`

**Lot : L5 · Fonctionnalité : F7 · Tickets : L5-01, L5-02, L5-03, L5-04, L5-05, L5-14**

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

## Rotation du QR et usage unique (L5-02, **fait**)

- **`GET /shares/:id/token`** (200, `shareTokenSchema`) : nouveau jeton, valable 60 s, tant que la session
  attend son scan. Il **remplace** les précédents, qui expirent tout de suite : il n'y a jamais qu'**un** QR
  valable par session. Patient propriétaire seulement : la session d'un autre patient (ou inconnue) répond
  404 sans révéler qu'elle existe ; identifiant non UUID : 400 sur `id` ; médecin : 403 ; 30 rotations par
  minute au plus (l'application en demande une par minute) ; base saturée : 503.
- **409 `SESSION_NOT_PENDING`** : session déjà ouverte, expirée ou révoquée, **ou dont le QR vient d'être
  consommé** (même avant que l'accès soit ouvert).
- **Consommation** (`consume-token.ts`, `consumeShareToken(tx, jeton, maintenant)`) : la route du médecin
  (`POST /shares/claim`, L5-03) l'appellera dans **sa** transaction puis ouvrira l'accès. Elle renvoie la
  session (patient, catégories, durée) ou `null`, sans dire pourquoi. Un jeton est accepté seulement s'il
  est bien formé (sinon aucune lecture en base), connu, jamais utilisé, dans ses 60 s, et si sa session est
  en attente.
- **Atomicité** : la ligne de la session est verrouillée (`SELECT … FOR UPDATE`) par le scan **et** par la
  rotation, toujours avant les jetons (même ordre ⇒ pas d'interblocage). Le jeton est marqué utilisé par
  une mise à jour conditionnelle (« seulement s'il ne l'est pas déjà ») ; les autres jetons encore valables
  de la session expirent. Deux scans simultanés : un seul réussit.
- Tests : `test/sharing-token.test.ts`, `test/sharing-service.test.ts` (sans base) ;
  `test/sharing-rotate.test.ts` (vraie base PostgreSQL, base `…_test` uniquement).

## Scan par le médecin : `POST /shares/claim` (L5-03, **fait**)

- **Entrée** (`claimShareSchema`) : `{ token }` (20 à 200 caractères, sinon 400). Rôle `DOCTOR` (patient :
  403 ; sans connexion : 401).
- **Médecin approuvé seulement** (`verificationStatus = APPROVED`) : sinon **403 `DOCTOR_NOT_APPROVED`**,
  vérifié **avant** de toucher au jeton : un compte en attente ou refusé ne consomme pas le QR du patient.
  Compte supprimé (jeton de connexion encore valable) : 401.
- **Succès (200, `claimShareResponseSchema`)**, dans **une** transaction (`share-claim.service.ts`) :
  1. jeton consommé (`consumeShareToken`, usage unique) ;
  2. session `ACTIVE`, rattachée au médecin, `claimedAt` = maintenant, `expiresAt` = maintenant + durée
     (`SHARE_DURATION_MINUTES` ; « Consultation » : 2 h) ;
  3. ligne `SHARE_CLAIMED` dans le journal d'accès (patient, médecin, session, adresse IP ; jamais le jeton).

  Réponse : session, fin de l'accès, catégories choisies et, du patient, **seulement** le prénom et le type
  de diabète (`PatientPublicIdentity`). Les données viendront par les routes du dossier (L5-12).

- **Échec : toujours 404 `TOKEN_INVALID` « QR invalide ou expiré »**, que le jeton soit inconnu, mal formé,
  expiré, remplacé, déjà utilisé, ou que la session soit expirée ou révoquée : on ne dit pas pourquoi.
- **Blocage** (`claim-limiter.ts`) : 5 scans ratés en 60 s, par adresse IP **ou** par compte médecin ⇒
  **429** « Trop de QR invalides scannés… » avec `retryAfterSeconds` et l'en-tête `Retry-After`, même avec
  un bon QR (qui n'est alors pas consommé). Les scans réussis ne comptent pas. Chaque essai compte dès son
  début (des essais simultanés ne passent pas tous). Compteurs en mémoire : suffisant pour une seule
  instance de l'API. En plus : 20 scans par minute et par IP au plus (`@Throttle`).
- Tests : `test/sharing-claim-limiter.test.ts` (sans base), `test/sharing-claim.test.ts` (vraie base).

## Fin d'un partage et contrôle à chaque requête (L5-04, **fait**)

- **`DELETE /shares/:id`** (patient, 204) : la session, en attente ou ouverte, passe à `REVOKED`
  (`revokedAt`) ; ses jetons encore valables expirent ; ligne `SHARE_REVOKED` dans le journal, avec le
  médecin concerné s'il y en avait un. **Effet immédiat** : la requête suivante du médecin est refusée
  (`SESSION_REVOKED`). Session d'un autre patient ou inconnue : 404 ; déjà terminée : 204 sans rien changer
  (pas de seconde ligne de journal) ; échue mais pas encore rangée : elle est **expirée** (pas « arrêtée »).
  Verrou de la session : révocation et scan simultanés ne laissent jamais un accès ouvert.
- **`GET /shares/:id/status`** (patient, `shareStatusResponseSchema`) : état, médecin, `claimedAt`,
  `expiresAt` et `remainingSeconds` calculés par le serveur (seule horloge de référence ; nuls si l'accès
  n'est pas ouvert). Une session échue est expirée tout de suite. Autre patient : 404 ; médecin : 403.
- **Expiration** (`share-expiry.ts`) : une session `ACTIVE` dont la fin est passée devient `EXPIRED`, avec
  une ligne `SHARE_EXPIRED` à l'heure de fin réelle. Deux chemins, une seule règle (`expireDueSessions`) :
  - **tâche planifiée** `ShareExpiryJob`, chaque minute (`@nestjs/schedule`, déjà installé), par lots de
    500 ; elle passe les sessions verrouillées (`SKIP LOCKED`) et les reprend au passage suivant ; en cas
    de panne, un avertissement sans aucune donnée ;
  - **contrôle à chaque requête** (état, accès du médecin) : n'attend pas la tâche.

  Sessions verrouillées puis revérifiées : tâche, requêtes et révocation simultanées n'écrivent qu'**une**
  ligne ; une session révoquée reste révoquée.

- **`requireActiveAccess(médecin, session, { category })`** (`ShareLifecycleService`, exporté par le
  module) : le contrôle que **chaque** route médecin (L5-12, L5-15) fera avant de lire une donnée. Session
  inconnue : 404 ; pas ouverte par ce médecin : 403 ; révoquée : 403 `SESSION_REVOKED` ; expirée ou échue
  (horloge du serveur, fin pile comprise) : 403 `SESSION_EXPIRED` ; catégorie non partagée : 403
  `CATEGORY_NOT_SHARED`.
- Tests : `test/sharing-expiry.test.ts` (sans base) et `test/sharing-lifecycle.test.ts` (vraie base).

## Journal d'accès : `GET /shares/log` (L5-05, **fait**)

- Patient seulement (médecin : 403). Paramètres `accessLogQuerySchema` : `limit` (1 à 2000, 500 par
  défaut) et `cursor` (sinon 400). Réponse `accessLogListSchema` : lignes du plus récent au plus ancien
  (`id`, `action`, `at`, `sessionId`, `actorName`) et `nextCursor`. Lignes à la même milliseconde : ni
  répétées ni oubliées d'une page à l'autre (tri par date puis identifiant).
- Seulement le journal **de ce patient** ; jamais l'adresse IP ni l'identifiant du médecin (l'IP reste en
  base pour une enquête en cas d'abus). Lecture seule : le journal ne se modifie ni ne se supprime.
- Le journal est écrit par le module `audit` (`writeAccessLog`), dans la transaction de chaque évènement.

## Tests obligatoires

- [x] Même QR scanné deux fois : le second refusé (L5-02 sur la consommation, L5-03 par la route `claim`).
- [x] Jeton de plus de 60 s refusé (idem).
- [x] Deux claims simultanés : un seul réussit (L5-03 : 10 médecins en même temps, un seul accès, une
      seule ligne de journal).
- [x] Après expiration : 403 sur toutes les routes médecin (L5-12 route par route ; L5-14 : toutes les routes
      médecin du contrat, `test/sharing-security.test.ts`).
- [x] Révocation effective en moins de 5 s (L5-04 : immédiate, la requête suivante est refusée).
- [x] Médecin `PENDING` refusé (L5-03 : 403 `DOCTOR_NOT_APPROVED`, QR non consommé ; `REJECTED` aussi).
- [x] Le hash seul est en base (aucune colonne ne contient le jeton) (L5-01 ; L5-14 : toutes les tables).

**Suite de sécurité (L5-14)** : `test/sharing-security.test.ts` rejoue toute la checklist du partage
(`docs/security/checklist.md`) de bout en bout, en attaquant : double scan, jeton échu ou remplacé, scans
simultanés, fin d'accès sur toutes les routes médecin du contrat, catégories décochées (marqueurs), jeton en
base, limites de débit, journal lu par le patient, rôle et propriété.

## Fichiers

| Fichier                      | Rôle                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sharing.module.ts`          | Déclaration du module NestJS                                                                           |
| `sharing.controller.ts`      | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `sharing.service.ts`         | Logique métier et accès base (Prisma)                                                                  |
| `share-token.ts`             | Jetons : émission, hash SHA-256, forme attendue (fonctions pures)                                      |
| `consume-token.ts`           | Consommation atomique d'un jeton (usage unique), appelée par la route du médecin (L5-03)               |
| `share-claim.service.ts`     | Scan par le médecin : approbation, consommation, accès ouvert, journal (L5-03)                         |
| `share-lifecycle.service.ts` | Révocation, état du partage, contrôle d'accès des routes médecin (L5-04)                               |
| `share-expiry.ts`            | Expiration des accès : règle commune et tâche planifiée chaque minute (L5-04)                          |
| `claim-limiter.ts`           | Blocage après 5 scans ratés par minute (IP ou compte)                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
