# Module `assistant`

**Lot : L9 · Fonctionnalités : F6 (IA), F1 (profil) · Tickets : L9-02, L9-05 (L9-06 à L9-08 à venir)**

Assistant de conversation « Afyabora » : le patient pose des questions sur **ses mesures** et sur **le
diabète** ; les réponses viennent uniquement de ses mesures (chiffres de `@glyka/analytics`) et de fiches
relues par un médecin. Jamais de dose, de diagnostic, de traitement ni de prédiction. Décision :
complément de l'ADR-0005 du 2026-10-11. Contrat : 0.4.0.

## Routes

- `GET /assistant/conversations` (`limit` 20 par défaut, 100 au plus, `cursor`) — **fait (L9-05)**
- `POST /assistant/conversations` — **fait (L9-05)**
- `DELETE /assistant/conversations` (tout effacer) — **fait (L9-05)**
- `GET /assistant/conversations/{id}` · `DELETE /assistant/conversations/{id}` — **faits (L9-05)**
- `POST /assistant/conversations/{id}/messages` — **fait (L9-05)**, réponses gabarits seulement
- `GET /assistant/sheets` · `GET /assistant/sheets/{sheetId}` — à faire (L9-06)

## Règles

### Conversations (L9-05)

- Rôle **PATIENT** uniquement : le médecin et l'admin reçoivent 403 ; **le médecin n'a jamais accès aux
  conversations** (ni QR, ni portail).
- **Propriété** : le patient vient du jeton. La conversation ou la question d'un autre patient est
  « introuvable » (404) ; un identifiant de question rejoué par un autre patient ⇒ 409, **sans rien
  renvoyer** de la question d'origine.
- **Identifiants créés sur le téléphone** : conversation `201` puis `200` au rejeu (identifiant d'un autre
  patient ⇒ 409) ; question `202` puis `200` au rejeu **exact** (même identifiant, même conversation, même
  texte) ; sinon 409 `MESSAGE_ID_CONFLICT`. Envois simultanés : le second relit le premier.
- **Chiffrement** (AES-256-GCM, clé `FIELD_ENCRYPTION_KEY`) : texte des questions et des réponses, et
  `preview` (80 premiers caractères de la première question, coupés avec « … »). Aucun titre en clair.
  **Aucun texte dans les journaux** : seulement la nature de la réponse (`EMERGENCY`, `REFUSAL`…).
- **Quota** : 20 questions par heure glissante et par patient ⇒ 429 avec `retryAfterSeconds` et
  l'en-tête `Retry-After` (délai compté depuis la plus ancienne question de l'heure).
- **Ordre** : réponse enregistrée 1 ms après sa question ; la conversation remonte en tête de liste à
  chaque question (`updatedAt`).
- **Effacement réel** (pas de corbeille) : une conversation (404 si inconnue, déjà effacée ou d'un autre)
  ou toutes (`204` même s'il n'y a rien). Les messages partent avec leur conversation (cascade). Supprimer
  le compte efface aussi tout (cascade depuis `PatientProfile`).
- Profil médical pas encore créé ⇒ 400 ; compte supprimé mais jeton encore valable ⇒ 401.

### Réponses (L9-05 : gabarits, `answers/template-answer.ts`)

Déterministes, sans modèle de langage, prêtes tout de suite (`status: READY`, `rephrased: false`). Le filtre
de L3-07 (`screenQuestion`) décide en premier :

| Question                                               | Réponse                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Urgence (malaise, glycémie très basse citée…)          | `EMERGENCY` : message d'urgence (le téléphone ajoutera le numéro d'urgence, le médecin et le proche du profil) |
| Dose, traitement, diagnostic, prédiction, détournement | `REFUSAL` : refus poli, renvoi au professionnel de santé                                                       |
| Hors sujet                                             | `OUT_OF_SCOPE` : « je réponds seulement sur vos mesures et le diabète »                                        |
| Autre                                                  | `OUT_OF_SCOPE` : « pas de réponse sûre pour l'instant » (sources : L9-06)                                      |

**Jamais d'invention.** À faire en L9-06 : élargir le filtre aux sujets des fiches (« C'est quoi
l'HbA1c ? » tombe aujourd'hui en « hors sujet »), répondre à partir des mesures et des fiches.

### Fiches de connaissances (L9-02)

Voir `apps/api/knowledge/README.md` : format, règles de contenu, empreinte de relecture, procédure du
médecin. Lecteur : `knowledge/sheet-format.ts`, `knowledge/knowledge-sheets.ts`.

### À décider

- **Export des données** (`GET /me/export`) : les conversations n'y sont pas, car le schéma `DataExport`
  du contrat ne les prévoit pas. Les ajouter demanderait un changement de contrat.

## Tests obligatoires

- [x] (L9-05) Création `201`, rejeu `200`, identifiant d'un autre patient `409` ; 400 sans profil ; 401 compte supprimé (`test/assistant-conversations.test.ts`).
- [x] (L9-05) Question `202` avec sa réponse gabarit au format du contrat ; chaque nature (urgence, dose, diagnostic, prédiction, détournement, hors sujet, pas de réponse sûre).
- [x] (L9-05) Textes et aperçu chiffrés en base ; aucun texte dans les journaux.
- [x] (L9-05) Rejeu exact `200` (même réponse, rien de créé) ; identifiant repris (autre texte, autre conversation, autre patient) `409 MESSAGE_ID_CONFLICT` ; un autre patient ne reçoit rien.
- [x] (L9-05) Quota : 20 questions, la 21e `429` + délai ; délai compté depuis la plus ancienne ; quota par patient ; heure glissante.
- [x] (L9-05) Détail ordonné, aperçu de la 1re question (coupé à 80), liste paginée par curseur, la plus récemment utilisée d'abord ; 400 sur paramètres invalides.
- [x] (L9-05) Propriété : lecture, question, effacement de la conversation d'un autre ⇒ 404 ; 403 médecin/admin ; 401 sans jeton ; 400 identifiant d'URL invalide.
- [x] (L9-05) Effacement d'une conversation (messages compris) et de toutes, jamais celles d'un autre patient.
- [x] (L9-02) Fiches : format, règles de contenu, empreinte (`test/assistant-knowledge.test.ts`).
