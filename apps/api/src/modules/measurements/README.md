# Module `measurements`

**Lot : L2 · Fonctionnalité : F2 · Tickets : L2-01, L2-12**

Création, lecture, modification et suppression des mesures de glycémie.

## Routes

- GET /measurements?from&to&limit&cursor · POST /measurements · PUT /measurements/:id · DELETE /measurements/:id — **faits (L2-01)**

## Règles de gestion

- L'identifiant (UUID) vient du client : un même POST rejoué ne crée pas de doublon (idempotence).
- Conversion en mg/dL entier via `toMgDl`, valeur d'origine et unité conservées.
- Hors bornes plausibles : refus sauf `confirmedUnusual: true`.
- Date future refusée. Note personnelle chiffrée (AES-256-GCM).
- Suppression = tombstone (`deletedAt`) pour que la synchronisation la propage.
- Modification : `editedAt` renseigné.

### Détail (L2-01, décisions du 2026-10-10)

Outils partagés avec les événements (L2-02) : `src/common/data/owned-records.ts`.

- Rôle **PATIENT** ; le patient vient toujours du jeton. La mesure d'un autre patient répond **404**
  (comme une mesure inconnue) : on ne révèle jamais qu'elle existe.
- **POST** : `201` si créée, **`200` si l'identifiant existe déjà pour ce patient** (rejeu : la mesure
  enregistrée est renvoyée telle quelle, sans modification ni résurrection si elle a été supprimée).
  Deux envois **simultanés** du même identifiant : l'insertion du second échoue (P2002), il relit et
  répond 200 — une seule mesure (vérifié sur la vraie base). Identifiant appartenant à un autre
  patient : 400 neutre. Pas de profil médical : 400 explicite ; compte supprimé : 401.
- Valeur : `toMgDl` (entier arrondi) ; hors 20–600 mg/dL sans `confirmedUnusual` ⇒ **422
  `UNUSUAL_VALUE`** avec `valueMgDl`, `plausibleMinMgDl`, `plausibleMaxMgDl` (pour le message du
  mobile ; décrit dans le contrat 0.2.1, schéma `UnusualValueError`, et dans `@glyka/shared`
  `unusualValueErrorSchema`). Même confirmée, une valeur < 1 ou > 5000 mg/dL est impossible (400).
- Date : ISO 8601 **avec fuseau** obligatoire ; plus de 5 min dans le futur ⇒ 400 (`measuredAt`).
  Toujours rendue en UTC (`Z`).
- **GET** : période `[from ; to[`, de la plus récente à la plus ancienne, suppressions exclues,
  `limit` 1–2000 (500 par défaut). **Curseur** opaque (date + identifiant de la dernière mesure) :
  pagination stable, sans doublon ni oubli même si plusieurs mesures ont la même heure.
- **PUT** : seuls les champs envoyés changent ; `value` et `unit` ensemble ; note vide = note effacée ;
  la condition « non supprimée » est dans l'écriture (une suppression simultanée gagne).
- **DELETE** : tombstone (`deletedAt`) **et note effacée tout de suite** ; 204 même si déjà supprimée.
- Note illisible (clé changée, donnée abîmée) : `note: null`, sans erreur ; le journal ne contient ni
  la note ni la valeur.

## Tests obligatoires

- [x] 1,48 g/L stocké 148 mg/dL (`test/measurements.test.ts`).
- [x] 18,7 g/L refusé sans confirmation (422 `UNUSUAL_VALUE`), accepté une fois confirmé.
- [x] POST rejoué = une seule mesure ; deux envois simultanés = une seule mesure.
- [ ] Suppression visible dans `/sync/pull` — la suppression pose bien le tombstone (`deletedAt`,
      testé) ; la route `/sync/pull` arrive avec le lot L8.
- [x] (L2-01) Conversion mmol/L et mg/dL ; note chiffrée en base ; date future refusée ; données mal
      formées refusées ; sans profil 400 ; compte supprimé 401 ; 401 / 403 selon le rôle.
- [x] (L2-01) Liste : seulement mes mesures, sans les supprimées, ordre décroissant, période
      `[from ; to[`, pagination complète sans doublon (même heure), paramètres invalides ⇒ 400.
- [x] (L2-01) Modification, note effacée, 404 pour la mesure d'un autre / supprimée / inconnue.
- [x] (L2-01) Suppression idempotente, note effacée, pas de résurrection par un rejeu.
- [x] (L2-01) Aucune donnée de santé dans les journaux.
- Les tests détectent les erreurs : 5 erreurs introduites volontairement (propriété, doublon
  simultané, supprimées listées, date future, valeur inhabituelle) ⇒ chaque fois des tests en échec.

### Cas limites (L2-12)

- [x] Conversions aux frontières : 1,1 mmol/L (= 20) et 33,3 mmol/L (= 600) acceptés, 1,0 et 33,4
      inhabituels ; 0,20 / 6,00 g/L acceptés, 0,19 / 6,01 inhabituels ; mg/dL avec décimale arrondi.
- [x] **Arrondi exact** : 1,005 g/L = 101 mg/dL (et non 100 : erreur des nombres à virgule corrigée dans
      `toMgDl`, `@glyka/shared`) ; la modification reconvertit avec les mêmes règles.
- [x] Valeurs impossibles, même confirmées : au-delà de 5 000 mg/dL ou arrondies à 0 ⇒ 400
      « Valeur impossible » (création et modification).
- [x] Date future : pile 5 minutes acceptée, une milliseconde de plus refusée ; décalages horaires
      (+01:00, −05:00, +14:00) comparés en instants ; modification refusée sans rien changer.
- [x] Idempotence : trois envois simultanés ⇒ une création + deux 200 ; rejeu après modification ⇒ la
      mesure modifiée, pas réécrite ; rejeu d'une valeur inhabituelle déjà enregistrée sans la
      confirmation ⇒ 200 (et non 422 : la synchronisation ne doit pas la croire en échec) ; même
      modification deux fois ⇒ même résultat ; suppression et création rejouées ⇒ reste supprimée.
- [x] 6 erreurs volontaires (ancien arrondi, limite 5 000 → 6 000, 0 mg/dL accepté, « pile 5 minutes »
      refusé, décalage horaire ignoré, contrôles avant le rejeu) : toutes détectées.
- [x] Vérifié aussi sur la vraie base (API locale + PostgreSQL) : 1,005 g/L ⇒ 101 ; 5 001 mg/dL
      confirmé ⇒ 400 ; 33,4 mmol/L ⇒ 422 (602) ; 5 envois simultanés du même identifiant ⇒ 1 création,
      4 rejeux, une seule mesure en base ; +10 min ⇒ 400.

## Fichiers

| Fichier                      | Rôle                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `measurements.module.ts`     | Déclaration du module NestJS                                                                           |
| `measurements.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `measurements.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
