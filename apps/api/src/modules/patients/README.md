# Module `patients`

**Lot : L1 · Fonctionnalité : F1 · Tickets : L1-05, L1-14**

Profil médical du patient, seuils d'alerte, export et suppression de compte.

## Routes

- GET /me/profile · PUT /me/profile — **faits (L1-05)**
- GET /me/export : export JSON/CSV de ses données (P1)
- DELETE /me : suppression du compte et des données (P1)

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

## Tests obligatoires

- [x] Seuils incohérents refusés (`test/patients-profile.test.ts`, `packages/shared/test/profile.test.ts`).
- [x] Un patient ne peut pas lire le profil d'un autre (`test/patients-profile.test.ts`).
- [x] (L1-08) Médecin traitant enregistré, relu, et effacé quand il est absent du `PUT`.
- [x] (L1-05) 404 avant création ; création puis relecture identique ; remplacement complet ; valeurs par défaut ; 403 médecin/admin ; 401 sans jeton.

## Fichiers

| Fichier                  | Rôle                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `patients.module.ts`     | Déclaration du module NestJS                                                                           |
| `patients.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `patients.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
