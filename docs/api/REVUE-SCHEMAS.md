# Relecture des schémas partagés (L0-08)

Les schémas de `packages/shared` sont **le contrat que toute l'équipe code contre** : une erreur ici se retrouve dans le mobile, le portail et l'API. Chaque schéma a été relu face au cahier des charges (§4 et §10), aux README des modules, aux ADR et au code mobile existant.

## Défauts corrigés (6)

| #   | Schéma                       | Défaut constaté                                                                                                                                                                                                          | Correction                                                                                                                                           | Test                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `syncOpSchema`               | Acceptait un `upsert` sans `payload`, un `delete` avec `payload`, un `payload` d'événement annoncé comme mesure, un `payload.id` différent de `entityId`. Un `null` (que l'outbox stocke pour un `delete`) était refusé. | `superRefine` : l'`upsert` exige un `payload` valide pour son `entity` et cohérent avec `entityId` ; le `delete` n'en contient pas ; `null` accepté. | `schemas.test.ts` (7 cas)           |
| 2   | `importCommitSchema`         | Une correction (`CORRECT`) sans `correctedValue` passait ; deux décisions sur la même ligne aussi.                                                                                                                       | `correctedValue` obligatoire pour une correction ; une seule décision par ligne.                                                                     | `schemas.test.ts` (3 cas)           |
| 3   | `updateMeasurementSchema`    | `{ "value": 1.5 }` sans unité était accepté : valeur ambiguë (1,5 g/L ou 1,5 mmol/L ?).                                                                                                                                  | `value` et `unit` vont ensemble.                                                                                                                     | `schemas.test.ts` (2 cas)           |
| 4   | `importPreviewRequestSchema` | `POST /imports/preview` est un envoi multipart : `mapping` y arrive sous forme de texte JSON, pas d'objet.                                                                                                               | Nouveau `importPreviewFormSchema` qui décode et valide le JSON.                                                                                      | `schemas.test.ts` (3 cas)           |
| 5   | Schémas absents              | Aucun schéma pour `PUT /events/:id`, la question libre (`/insights/ask`), les périodes (`?period=`), les listes (`limit`, `cursor`) et `DELETE /me`.                                                                     | Ajout de `updateLifeEventSchema`, `askInsightSchema`, `insightsQuerySchema`, `reportQuerySchema`, `listQuerySchema`, `deleteAccountSchema`.          | `schemas.test.ts` (8 cas)           |
| 6   | Contrat et énumérations      | Rien n'empêchait le contrat de s'écarter des énumérations ou des schémas du code.                                                                                                                                        | Tests de parité contrat / `@glyka/shared` (valeurs, champs, champs obligatoires, exemples).                                                          | `openapi-contract.test.ts` (77 cas) |

Le code de `packages/shared` compile en TypeScript strict, ses 40 tests passent, et le type `SyncOp` reste compatible avec le code mobile existant (`outbox.repo.ts`, `measurements.repo.ts`). Les nouveaux tests ont aussi été exécutés contre l'**ancienne** version des schémas : ils échouent, ce qui confirme que les défauts étaient réels.

## Points à décider (non corrigés)

| #   | Point                                                                                                                  | Pourquoi ce n'est pas corrigé maintenant                                                                                                                         | Qui décide             |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| a   | Seul `measurementDtoSchema` décrit une **réponse** en Zod ; les autres réponses n'existent que dans le contrat.        | Écrire tous les schémas de réponse maintenant ralentirait le jour 1. Piste après le gel : générer les types TypeScript depuis le contrat (`openapi-typescript`). | Lead technique         |
| b   | `notificationPreferencesSchema.enabled` est un enregistrement partiel : une catégorie absente doit valoir « activée ». | Règle à appliquer côté service ; elle est écrite dans le contrat.                                                                                                | Back-end               |
| c   | `patientProfileSchema.diagnosisYear` calcule l'année maximale au chargement du module.                                 | Sans conséquence réelle (l'écart n'existe qu'à la Saint-Sylvestre).                                                                                              | —                      |
| d   | Les seuils d'alerte par défaut (54 / 70 / 180 / 250 mg/dL) ne sont pas validés par un clinicien.                       | Décision médicale : aucun test ne peut la remplacer. Voir `thresholdsReviewedByClinician`.                                                                       | Professionnel de santé |
| e   | Le jeton du QR d'urgence n'est montré qu'à la génération.                                                              | Choix de sécurité (le serveur ne garde que l'empreinte) : voir la décision 5 du README.                                                                          | Lead technique         |

## Validation par les responsables de lot

La relecture est faite : il reste **5 minutes** à chaque responsable pour confirmer que les schémas dont il dépend lui conviennent. Chacun coche sa liste dans la PR ; un désaccord devient une issue étiquetée `needs-decision`.

### Lead technique

- [ ] `auth.ts`, `share.ts`, `sync.ts` : j'ai relu et je valide
- [ ] Les 9 décisions de conception du README de `docs/api` sont tranchées

### Back-end

- [ ] `measurement.ts`, `event.ts`, `import.ts`, `profile.ts` : je peux les implémenter tels quels
- [ ] `notification.ts` : la règle « catégorie absente = activée » est claire

### Mobile 1 (local-first)

- [ ] `measurement.ts`, `event.ts`, `sync.ts` : le format des opérations de l'outbox me convient
- [ ] Un `delete` s'envoie sans `payload` (ou avec `null`)

### Mobile 2 (fonctions)

- [ ] `import.ts`, `share.ts`, `emergency.ts`, `notification.ts`, `insights.ts` : j'ai ce qu'il me faut pour mes écrans
- [ ] Le QR d'urgence est une adresse ; je conserve le jeton à la génération

### Portail, IA et design

- [ ] `auth.ts` (médecin), `share.ts` (`claim`), `insights.ts` : je peux coder le portail et la reformulation
- [ ] La page publique `/e/:token` est ajoutée à la liste des pages du portail
