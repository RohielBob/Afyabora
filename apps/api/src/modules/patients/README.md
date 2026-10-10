# Module `patients`

**Lot : L1 · Fonctionnalité : F1 · Tickets : L1-05, L1-14**

Profil médical du patient, seuils d'alerte, export et suppression de compte.

## Routes

- GET /me/profile · PUT /me/profile — **faits (L1-05)**
- GET /me/export : export JSON de ses données — **fait (L1-14)**
- DELETE /me : suppression du compte et des données — **fait (L1-14)**

## Règles de gestion

- Seuils validés par `thresholdsSchema` (très bas < plage < très haut).
- Changer l'unité préférée ne modifie jamais les données stockées (mg/dL).
- Un patient n'accède qu'à son propre profil (contrôle de propriété).

### Profil (L1-05)

- Rôle **PATIENT** uniquement (`@Roles('PATIENT')`) ; médecin / admin : 403.
- **Propriété** : l'identifiant vient toujours du jeton (`@CurrentUser`), jamais de l'URL ni du corps ; il n'existe aucun moyen de viser le profil de quelqu'un d'autre.
- `GET` : 404 tant que le profil n'existe pas (le mobile lance l'assistant de profil). La connexion renvoie aussi `profileCompleted`.
- `PUT` : crée ou **remplace** tout le profil (un champ facultatif absent est effacé). Réponse = profil enregistré + `updatedAt` en UTC (`Z`).
- Seuils en **mg/dL entiers** (colonnes `veryLowMgDl`…), unité préférée stockée à part.
- Validation (`patientProfileSchema`, `@glyka/shared`) : ordre des seuils avec le champ fautif dans l'erreur ; date de naissance ni future ni avant 1900 ; année du diagnostic ni future ni avant la naissance, **calculée à chaque requête** (corrige le défaut « année figée au chargement du module »).
- Compte supprimé alors que le jeton est encore valide : 401 (au lieu d'une erreur 500).
- **Médecin traitant** (L1-08, contrat 0.2.0) : `doctorContact { name, phone }` facultatif, colonnes `doctorName` / `doctorPhone`. Comme le contact d'urgence, il est effacé si un `PUT` ne le contient pas.

### Export et suppression (L1-14)

- `GET /me/export` (PATIENT) : `{ exportedAt, profile, measurements, events }` au format du contrat
  (`DataExport`, `Measurement`, `LifeEvent`), dates en UTC (`Z`), tri chronologique.
  - **Seulement les données du patient du jeton** ; les éléments supprimés (« tombstones » gardés pour
    la synchronisation) ne sont **pas** exportés.
  - Les notes, chiffrées en base (AES-256-GCM), sont **déchiffrées** ; une note illisible devient `null`
    sans bloquer l'export (le journal n'indique que leur nombre).
  - Téléchargement : `Content-Disposition: attachment; filename="afyabora-export-AAAA-MM-JJ.json"`,
    `Cache-Control: no-store`. Limite : 10 exports / min par adresse IP.
  - Profil pas encore créé : 404 ; compte supprimé (jeton encore valable) : 401.
- `DELETE /me` (PATIENT) : **mot de passe redemandé** (`deleteAccountSchema`) ; incorrect ⇒ 403
  `INVALID_PASSWORD`, rien n'est supprimé. Limite : 5 tentatives / min par adresse IP.
  - Une seule **transaction** : `NotificationOutbox` (table sans lien en cascade) puis le compte ; la
    cascade PostgreSQL emporte profil, mesures, événements, imports, analyses, partages (un médecin
    perd l'accès immédiatement), journal d'accès, carte d'urgence, préférences, appareils, sessions et
    liens d'email. **Vérifié sur la base de développement** : 0 ligne restante, autres comptes intacts.
  - Ensuite, le jeton d'accès encore valable (15 min au plus) ne donne plus accès à rien (401).
- ⚠️ Toute **nouvelle table** liée à un patient doit avoir `onDelete: Cascade` (ou être effacée dans
  `AccountService.deleteAccount`), sinon la suppression du compte laisse des données derrière elle.

## Tests obligatoires

- [x] Seuils incohérents refusés (`test/patients-profile.test.ts`, `packages/shared/test/profile.test.ts`).
- [x] Un patient ne peut pas lire le profil d'un autre (`test/patients-profile.test.ts`).
- [x] (L1-08) Médecin traitant enregistré, relu, et effacé quand il est absent du `PUT`.
- [x] (L1-05) 404 avant création ; création puis relecture identique ; remplacement complet ; valeurs par défaut ; 403 médecin/admin ; 401 sans jeton.
- [x] (L1-14) Export : format exact du contrat ; seulement mes données ; sans les éléments supprimés ; notes déchiffrées ; note illisible tolérée ; `no-store` + fichier daté ; 404 sans profil ; 401 compte supprimé ; 403 médecin/admin ; 429 au 11e (`test/account.test.ts`).
- [x] (L1-14) Suppression : mauvais mot de passe ⇒ 403 `INVALID_PASSWORD` sans rien supprimer ; bon mot de passe ⇒ 204, tout supprimé en une transaction, autres patients intacts, notifications en attente effacées ; jeton ensuite inutilisable ; 400 / 401 / 403 ; 429 à la 6e tentative.
- [x] (L1-14) Aucun mot de passe ni donnée de santé dans les journaux.

## Fichiers

| Fichier                  | Rôle                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `patients.module.ts`     | Déclaration du module NestJS                                                                           |
| `patients.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `patients.service.ts`    | Logique métier et accès base (Prisma)                                                                  |
| `account.service.ts`     | Export des données et suppression du compte (L1-14)                                                    |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
