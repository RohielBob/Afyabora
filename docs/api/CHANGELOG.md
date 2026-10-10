# Historique du contrat d'API

Format : une section par version. Une **rupture** est signalée en tête de section.

## 0.2.1 : 2026-10-10 (suite de L2-01, validé en équipe)

### Précisé

- Réponse **422 `UNUSUAL_VALUE`** de `POST /measurements` et `PUT /measurements/{id}` : nouveau schéma
  `UnusualValueError` (champs d'`Error` + `valueMgDl`, `plausibleMinMgDl`, `plausibleMaxMgDl`, tous
  présents) et réponse réutilisable `UnusualValue`. Le mobile affiche « 1 870 mg/dL : est-ce
  correct ? » puis renvoie la mesure avec `confirmedUnusual: true`.
- `@glyka/shared` : `unusualValueErrorSchema` et type `UnusualValueError` (lecture côté mobile, L2-04).

### Pas de rupture

L'API renvoyait déjà ces champs depuis L2-01 ; le contrat les décrit désormais. Un client qui ne les
lit pas fonctionne comme avant.

## 0.2.0 : 2026-10-10 (L1-08, accord du lead technique)

### Ajouté

- Schéma `DoctorContact` (`name`, `phone`) : le médecin qui suit le patient.
- `PatientProfile.doctorContact` : **facultatif** (`PUT` et `GET /me/profile`).
- Base : colonnes `doctorName` et `doctorPhone` (facultatives) dans `PatientProfile` (migration `ajoute_medecin_traitant_au_profil`).
- `@glyka/shared` : `doctorContactSchema`, champ `doctorContact` dans `patientProfileSchema`.

### Pas de rupture

Champ facultatif : un client qui ne l'envoie pas fonctionne comme avant. Comme pour `emergencyContact`, un `PUT` qui ne le contient pas l'efface (le `PUT` remplace tout le profil).

## 0.1.0 : 2026-10-07 (contrat initial, gelé)

### Ajouté

- 49 opérations sur 13 domaines : santé, authentification, compte, mesures, événements, synchronisation, import, analyse, partage, portail médecin, rapports, urgence, notifications.
- 91 schémas, 9 réponses d'erreur et 10 paramètres réutilisables, avec des exemples pour chaque requête.
- Extensions `x-roles`, `x-lot`, `x-ticket`, `x-priority`, `x-status` sur chaque opération.

### Modifié dans `@glyka/shared` (relecture L0-08)

- `syncOpSchema` : un `upsert` exige un `payload` cohérent avec `entity`, dont l'`id` est égal à `entityId` ; un `delete` n'en contient pas (`null` accepté).
- `importCommitSchema` : `correctedValue` obligatoire pour une correction ; une seule décision par ligne.
- `updateMeasurementSchema` : `value` et `unit` vont ensemble.
- Nouveaux schémas : `updateLifeEventSchema`, `importPreviewFormSchema`, `insightsQuerySchema`, `reportQuerySchema`, `askInsightSchema`, `listQuerySchema`, `deleteAccountSchema`.

### Pas de rupture

Aucune application n'est encore livrée : ces corrections de schémas ne cassent aucun client existant.
