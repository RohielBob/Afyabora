# Module `sync`

**Lot : L8 · Fonctionnalité : F11 · Tickets : L8-04, L8-05, L8-09**

Synchronisation hors-ligne : reçoit les opérations empilées sur le téléphone, renvoie les changements serveur.

## Routes

- **POST /sync/push** (L8-04, **fait**) : lot d'opérations (200 au plus), un résultat par opération dans le même ordre (`APPLIED`, `DUPLICATE`, `REJECTED` + raison, `CONFLICT_SERVER_WINS`), et `serverTime`.
- **GET /sync/pull?cursor&limit** (L8-05, **fait**) : changements depuis le curseur (mesures et événements, suppressions comprises), `nextCursor`, `hasMore`, `serverTime`.

## Règles de gestion

- Chaque opération a un `opId` : déjà traité = `DUPLICATE` (table `SyncOpLog`), jamais appliqué deux fois.
- Conflit : la dernière écriture gagne selon `clientUpdatedAt`; sinon `CONFLICT_SERVER_WINS`.
- Curseur = (`updatedAt`, `id`) ; pagination stable, pas de perte d'élément.
- Une opération invalide est `REJECTED` avec raison, sans bloquer les autres.
- `measuredAt` plus de 5 min dans le futur : rejet (dérive d'horloge de l'appareil).
- Réutilise les services `measurements` et `events` (une seule logique métier).

## Envoi : `POST /sync/push` (L8-04)

- **Enveloppe d'abord, puis chaque opération** (ADR-0004, modification 1) : la route ne valide que `deviceId` et le nombre d'opérations (`syncPushEnvelopeSchema`). Plus de 200 opérations ou un `deviceId` invalide donnent 400 pour le lot. Chaque opération est ensuite validée **séparément** avec `syncOpSchema` : une opération mal formée reçoit `REJECTED` avec une raison en français, sans la valeur reçue (« payload : contenu invalide pour cette entité »), et les autres sont appliquées.
- **Idempotence** : une opération appliquée est notée dans `SyncOpLog` (`opId`, patient, appareil, résultat). La même opération renvoyée répond `DUPLICATE` et n'est jamais réappliquée, même deux fois dans le même lot ou dans deux envois simultanés. Une opération `REJECTED` n'est **pas** notée : renvoyée plus tard, elle est réexaminée (une date « future » peut devenir valable). Un `opId` déjà pris par un autre patient est refusé.
- **La dernière écriture gagne** (modification 5) : une opération plus ancienne que la version du serveur (`clientUpdatedAt`) répond `CONFLICT_SERVER_WINS` et ne change rien. À instant égal, elle est appliquée (rejeu sans dégât). La règle est vérifiée **dans l'écriture** (`clientUpdatedAt ≤`), ce qui la rend sûre même quand deux envois arrivent en même temps. Une horloge d'appareil en avance de plus de 5 minutes est refusée.
- **Suppression définitive** : une donnée supprimée (tombstone, note ou texte libre effacé) le reste ; un upsert ensuite répond `CONFLICT_SERVER_WINS`. Supprimer une donnée inconnue ou déjà supprimée répond `APPLIED` (rien à faire). Si la donnée a été modifiée sur le serveur **après** la suppression faite sur le téléphone, le serveur gagne.
- **Une seule logique métier** : `MeasurementsService.syncUpsert` / `syncDelete` et `EventsService.syncUpsert` / `syncDelete` appliquent les mêmes contrôles que `POST` et `PUT` (valeur plausible ou confirmée, date pas dans le futur, textes chiffrés). Leurs refus deviennent `REJECTED` avec la même raison (« Valeur inhabituelle : vérifiez la saisie… »).
- **Propriété** : une donnée ou un `opId` d'un autre patient donne un refus neutre (« Identifiant déjà utilisé »). Rien n'est modifié ni révélé.
- **Ordre** : les opérations d'un lot sont appliquées dans l'ordre (créer puis supprimer la même mesure marche).
- **Sans profil médical** : 400 pour le lot. Compte supprimé (même pendant l'envoi) : 401 pour le lot, jamais un « rejet ».
- Une mesure créée par synchronisation a `source = MANUAL`. Une mesure importée modifiée sur le téléphone garde `source = IMPORT`.
- **Taille** : le corps JSON accepté par l'API passe de 100 Ko (valeur par défaut) à **1 Mo** (`main.ts`). Un lot légitime de 200 mesures avec des notes de 500 caractères pèse environ 265 Ko.
- Aucune donnée de santé dans les journaux, ni dans les raisons renvoyées.
- Tests : `test/sync-push.test.ts` (28 tests) ; vérifié sur la vraie base (lot de 200, rejeu, conflit, suppression, événement).

## Réception : `GET /sync/pull` (L8-05)

- **Contenu** : les mesures **et** les événements du patient modifiés après le curseur, **suppressions comprises** (`deletedAt` non nul, note ou texte libre déjà effacé), au format des routes classiques (notes déchiffrées pour le patient). Jamais les données d'un autre patient.
- **Ordre et pages** : tri croissant (`updatedAt`, `id`), en fusionnant les deux tables. `limit` vaut 200 par défaut, 500 au plus. `hasMore` est vrai tant qu'il reste des changements : il faut rappeler la route avec `nextCursor`. Première synchronisation : sans curseur.
- **Curseur sans perte ni répétition** : pendant la lecture, il avance **strictement** après la dernière ligne rendue (date **et** identifiant). Des centaines de lignes à la même milliseconde sont donc lues une seule fois. C'est le cas d'un import : en base, les 141 mesures de la démo ont toutes la même date de modification.
- **Marge de relecture** (ADR-0004, modification 4) : à la **dernière** page, si la dernière ligne lue date de moins de 5 s (`PULL_OVERLAP_MS`, heure du serveur), le curseur rendu recule de 5 s. La synchronisation suivante relit ces quelques secondes et rattrape une ligne écrite par une transaction lente. Si la dernière ligne est plus ancienne, aucune écriture plus ancienne ne peut encore arriver : le curseur est exact, et rien n'est retéléchargé inutilement. Le recul n'a lieu qu'en fin de lecture : la pagination ne peut pas boucler.
- **Rien de nouveau** : le curseur reçu est rendu tel quel.
- **Curseur opaque** (base64url) ; illisible ou trafiqué ⇒ 400 sur `cursor` : recommencer depuis le début.
- Le téléphone garde `nextCursor` **seulement après avoir appliqué la page** (contrat), et applique tout de façon idempotente (L8-06).
- Tests : `test/sync-pull.test.ts` (15 tests) ; vérifié sur la vraie base (import de 141 mesures reçu en pages de 50, modification par push, annulation ⇒ 141 suppressions reçues).

## Tests obligatoires

- [x] Même lot envoyé deux fois : aucun doublon (L8-04).
- [x] Suppression hors-ligne propagée (L8-04).
- [x] Conflit : dernière écriture gagne (L8-04).
- [x] Pull paginé : aucun élément perdu ni répété (L8-05).
- [x] Opération invalide n'empêche pas les autres (L8-04).

## Fichiers

| Fichier              | Rôle                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `sync.module.ts`     | Déclaration du module NestJS                                                                           |
| `sync.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `sync.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
