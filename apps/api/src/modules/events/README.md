# Module `events`

**Lot : L2 · Fonctionnalité : F4 · Tickets : L2-02, L2-10**

Événements de vie : repas, activité, traitement déclaré.

## Routes

- GET /events?from&to&limit&cursor · POST /events · PUT /events/:id · DELETE /events/:id — **faits (L2-02)**

## Règles de gestion

- Traitement = « déclaré par le patient » : aucun calcul de dose, aucun conseil.
- UUID fourni par le client (idempotence), suppression par tombstone.

### Détail (L2-02, décisions du 2026-10-10)

Mêmes règles que les mesures (L2-01), avec les outils communs de `src/common/data/owned-records.ts`
(curseur, date future, identifiant d'URL, erreurs Prisma) :

- Rôle **PATIENT** ; patient pris dans le jeton ; l'événement d'un autre patient répond **404**.
- **POST** : 201 créé, **200 rejeu** (même identifiant, même en simultané : un seul enregistrement) ;
  identifiant d'un autre patient : 400 neutre ; sans profil : 400 ; compte supprimé : 401.
- Date **plus de 5 min dans le futur** refusée (400, `occurredAt`), même règle que les mesures ;
  rendue en UTC.
- Libellé et texte libre sans espaces autour ; **texte libre vide = effacé** (création et modification).
- **Traitement déclaré** : enregistré tel quel (« Metformine », « 500 mg, matin »). Le serveur
  n'ajoute rien : aucune dose, aucun conseil (test dédié).
- **GET** : `[from ; to[`, du plus récent au plus ancien, sans les supprimés, curseur (date + id).
- **PUT** : seuls les champs envoyés changent ; condition « non supprimé » dans l'écriture.
- **DELETE** : tombstone **et texte libre effacé** ; 204 même si déjà supprimé ; un rejeu de la
  création ne le fait pas revivre.
- ⚠️ À décider : `details` est stocké **en clair** (schéma actuel), alors que la note d'une mesure est
  chiffrée. Le chiffrer demanderait une migration (`detailsEncrypted`) — voir la PR L2-02.

## Tests obligatoires

- [x] Événement rejoué = un seul enregistrement ; deux envois simultanés aussi (`test/events.test.ts`).
- [x] (L2-02) Format du contrat (`lifeEventDtoSchema`) ; activité avec durée ; traitement enregistré
      sans rien ajouter ; date future refusée ; données mal formées ; 400 / 401 / 403 selon le cas.
- [x] (L2-02) Liste : seulement les miens, sans les supprimés, période, pagination complète.
- [x] (L2-02) Modification partielle, texte effacé, 404 pour l'événement d'un autre / supprimé / inconnu.
- [x] (L2-02) Suppression : tombstone, texte effacé, idempotente, pas de résurrection.
- [x] (L2-02) Aucun libellé ni texte libre dans les journaux.
- 6 erreurs introduites volontairement : 5 détectées par les tests ; la 6e (« modifier un supprimé »)
  est aussi bloquée par la condition dans l'écriture (double protection, comportement inchangé).

## Fichiers

| Fichier                | Rôle                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `events.module.ts`     | Déclaration du module NestJS                                                                           |
| `events.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `events.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
