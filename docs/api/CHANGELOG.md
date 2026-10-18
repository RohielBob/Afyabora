# Historique du contrat d'API

Format : une section par version. Une **rupture** est signalée en tête de section.

## 0.4.2 : 2026-10-18 (après L5-12, accord de l'équipe)

Chronologie du dossier partagé (`GET /doctor/sessions/{sessionId}/timeline`) : le médecin voyait seulement le
libellé d'un évènement. Il voit maintenant la dose déclarée d'un traitement, la durée d'une activité et le lot
d'une mesure importée, **dans la limite de ce que le patient partage**.

### Ajouté

- `TimelineItem.details` (texte, nullable) : texte libre d'un évènement (ex. « 500 mg le matin »). Envoyé
  **seulement si le patient partage aussi ses notes personnelles** (`PERSONAL_NOTES`), comme la note d'une
  mesure : l'application du patient lui annonce que ce texte n'est « partagé que s'il le choisit ». Sinon
  `null` ; toujours `null` pour une mesure.
- `TimelineItem.durationMinutes` (entier, nullable) : durée d'un évènement, si le patient l'a indiquée.
- `TimelineItem.importBatchId` (uuid, nullable) : lot d'import d'une mesure importée (badge « Import · lot
  3F2A1C », L4-09) ; `null` sinon.
- Exemple de `TimelineItem` ; description de `label` (code du contexte pour une mesure).
- `@glyka/shared` : `timelineItemSchema` suit ces champs.

### Pas de rupture

Champs ajoutés à une réponse de lecture (toujours présents, éventuellement `null`) ; rien n'est retiré ni
renommé. Seul le portail médecin lit cette réponse.

## 0.4.1 : 2026-10-12 (L4-04 / L4-06, accord du lead technique)

Import : quand l'aperçu ne trouve pas les colonnes, l'application doit pouvoir les faire choisir au patient.

### Ajouté

- Code d'erreur `IMPORT_COLUMNS_NOT_FOUND` pour `POST /imports/preview` (400). Il est renvoyé quand les
  colonnes de date ou de valeur sont introuvables, ou quand `mapping` cite une colonne absente du fichier.
- Schéma `ImportColumnsError` (`Error` + `columns` : noms des colonnes du fichier, dans l'ordre, sans les
  colonnes sans nom) et réponse `ImportBadRequest` pour le 400 de `POST /imports/preview`. Les autres 400
  de cette route gardent le format `Error` habituel.
- `@glyka/shared` : `importColumnsErrorSchema` et le type `ImportColumnsError`, pour le mobile (L4-06).

### Pas de rupture

Champs ajoutés à une réponse d'erreur ; les champs existants (`message`, `issues`) sont inchangés.

## 0.4.0 : 2026-10-11 (L9-01, accord du lead technique)

Assistant de conversation « Afyabora » (lot L9). Décision : complément de l'ADR-0005 du 2026-10-11.

### Ajouté

- Tag `assistant` et 8 routes, **réservées au patient** (le médecin n'accède jamais aux conversations),
  toutes `planned`, priorité P1 :
  - `GET /assistant/conversations` (paramètres `limit`, 20 par défaut, 100 au plus, et `cursor`),
    `POST /assistant/conversations` (identifiant créé sur le téléphone : `201`, `200` au rejeu),
    `DELETE /assistant/conversations` (tout effacer) : L9-05 ;
  - `GET /assistant/conversations/{id}` et `DELETE /assistant/conversations/{id}` (effacement réel) : L9-05 ;
  - `POST /assistant/conversations/{id}/messages` : `202` avec la question et la réponse (prête ou en
    préparation), `200` au rejeu, `409 MESSAGE_ID_CONFLICT`, `429` au-delà de 20 questions par heure : L9-05 ;
  - `GET /assistant/sheets` et `GET /assistant/sheets/{sheetId}` : fiches de connaissances, L9-06.
- Schémas `CreateAssistantConversationRequest`, `SendAssistantMessageRequest`, `AssistantMessage`,
  `AssistantConversation`, `AssistantConversationList`, `AssistantConversationDetail`,
  `SendAssistantMessageResponse`, `KnowledgeSheetRef`, `KnowledgeSheetSummary`, `KnowledgeSheetList`,
  `KnowledgeSheet`, `KnowledgeSource` ; énumérations `AssistantMessageRole`, `AssistantMessageStatus`,
  `AssistantAnswerKind`, `KnowledgeSheetStatus` ; paramètres `SheetIdPath` et `AssistantLimit`.
- `PatientProfile.country` (code pays à 2 lettres) et `PatientProfile.emergencyNumber` (numéro d'urgence
  saisi par le patient) : **facultatifs**. Enregistrés à partir de L9-03 ; d'ici là, l'API les accepte sans
  les conserver. L'assistant les affiche en cas d'urgence, avec le médecin (`doctorContact`) et le proche
  (`emergencyContact`) déjà présents dans le profil.
- Code d'erreur `MESSAGE_ID_CONFLICT`.
- `@glyka/shared` : `schemas/assistant.ts` (requêtes et réponses), énumérations `ASSISTANT_*` et
  `KNOWLEDGE_SHEET_STATUSES`, `countryCodeSchema`, `emergencyNumberSchema`.

### Déprécié

- `POST /insights/ask` (L3-08, jamais codée) : `deprecated: true`, **remplacée par l'assistant**. Gardée dans
  le contrat pour ne rien rompre.

### Pas de rupture

Routes et champs facultatifs ajoutés ; aucune route retirée ni modifiée.

## 0.3.0 : 2026-10-11 (L3-06, accord du lead technique)

### Ajouté

- `InsightsResponse.summary` (`GET /insights`) : **facultatif**. Résumé de la période en langage clair
  (IA-3) : nombre de mesures et qualité, temps dans la cible / au-dessus / en dessous, comparaison, points à
  examiner avec le professionnel de santé, jours sans mesure. Gabarit du moteur `@glyka/analytics`
  (`summaryFacts` + `renderSummaryFr`), éventuellement reformulé par le modèle de langage local sous
  garde-fous. Base du rapport PDF (F9).

### Pas de rupture

Champ ajouté à une réponse : un client qui ne le lit pas fonctionne comme avant.

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
