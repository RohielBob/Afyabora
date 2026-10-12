# Module `assistant`

**Lot : L9 · Fonctionnalités : F6 (IA), F1 (profil) · Tickets : L9-02, L9-05, L9-06 (L9-07, L9-08 à venir)**

Assistant de conversation « Afyabora » : le patient pose des questions sur **ses mesures** et sur **le
diabète** ; les réponses viennent uniquement de ses mesures (chiffres de `@glyka/analytics`) et de fiches
relues par un médecin. Jamais de dose, de diagnostic, de traitement ni de prédiction. Décision :
complément de l'ADR-0005 du 2026-10-11. Contrat : 0.4.0.

## Routes

- `GET /assistant/conversations` (`limit` 20 par défaut, 100 au plus, `cursor`) — **fait (L9-05)**
- `POST /assistant/conversations` — **fait (L9-05)**
- `DELETE /assistant/conversations` (tout effacer) — **fait (L9-05)**
- `GET /assistant/conversations/{id}` · `DELETE /assistant/conversations/{id}` — **faits (L9-05)**
- `POST /assistant/conversations/{id}/messages` — **fait (L9-05)**, réponses des mesures et des fiches **(L9-06)**
- `GET /assistant/sheets` · `GET /assistant/sheets/{sheetId}` — **faits (L9-06)**

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

### Réponses (L9-06 : `answers/assistant-responder.service.ts`)

Déterministes, sans modèle de langage, prêtes tout de suite (`status: READY`, `rephrased: false`). Ordre de
décision (ADR-0005 complétée), **tri fait par le code** :

| Étape | Question                                                     | Réponse                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Urgence (filtre L3-07 : malaise, glycémie très basse citée…) | `EMERGENCY` : le **numéro d'urgence**, le **proche** et le **médecin** du profil (L9-03) ; sans numéro : « les secours » + invitation à l'enregistrer. Fiche citée : « Quand demander de l'aide ».                                        |
| 1     | Dose, traitement, diagnostic, prédiction, détournement       | `REFUSAL` : refus poli de L3-07, renvoi au professionnel de santé                                                                                                                                                                         |
| 2     | Sur **mes mesures** (`routing.ts`)                           | `MEASUREMENTS` : résumé du moteur pour la période demandée (semaine 7 j, 2 semaines 14 j, 3 mois 90 j, sinon 30 j), puis l'observation sur laquelle la question insiste (soir, hypos, tendance…) ou « je n'observe pas… », puis le rappel |
| 3     | Générale (`sheet-answer.ts`)                                 | `SHEET` : titre et résumé de la fiche la plus pertinente, la partie qui répond (≤ 700 caractères), le rappel ; fiche citée                                                                                                                |
| 4     | Rien de tout cela                                            | `OUT_OF_SCOPE` : « hors sujet » ou « pas de réponse sûre »                                                                                                                                                                                |

- **Mesures** : uniquement les phrases du moteur `@glyka/analytics` (`InsightsService.engineAnalysis`, jamais
  la version reformulée) ; chaque nombre de la réponse vient du moteur (testé). Une question d'explication
  (« comment lire mes glycémies », « c'est quoi… ») va aux fiches, pas au bilan.
- **Recherche dans les fiches** : chaque mot-clé dont tous les mots sont dans la question rapporte ses
  points ; un mot propre à une seule fiche vaut 1, un mot partagé moins, un mot générique (« glycémie »,
  « diabète », « sucre »…) ¼ ; il faut au moins 1 point pour citer une fiche. La partie choisie suit
  l'intention de la question (« que faire » ⇒ les gestes, « quels signes » ⇒ les signes, « c'est quoi » ⇒ la
  définition). Pluriels et variantes reconnus (« hypos », « basse »).
- **Jamais d'invention** : chaque phrase d'une réponse par fiche est une phrase de la fiche (testé).
- **Brouillons** (`knowledge/sheets.service.ts`, `ASSISTANT_DRAFT_SHEETS`) : servis par défaut hors
  production, jamais en production sauf réglage explicite pour une démonstration (l'image Docker de
  démonstration l'active, avertissement dans les journaux). En production sans brouillons, aucune fiche non
  relue n'est ni listée ni citée.

### Fiches : routes (L9-06)

- `GET /assistant/sheets` : les fiches servies, sans leur texte ; `GET /assistant/sheets/{sheetId}` : la fiche
  complète, 404 si inconnue ou non servie, 400 si l'identifiant est invalide. Rôle **PATIENT**.
- Les fiches sont lues et vérifiées **au démarrage** : une fiche fautive empêche l'API de démarrer.

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
- [x] (L9-06) Tri : questions sur mes mesures / générales, période demandée, observations mises en avant (`test/assistant-answers.test.ts`).
- [x] (L9-06) Recherche : 12 questions vers la bonne fiche (vraies fiches), aucune fiche pour « remboursement », « capitale », « pizza ».
- [x] (L9-06) Réponse par fiche : titre, résumé, partie selon l'intention, rappel ; chaque phrase vient de la fiche ; extrait limité.
- [x] (L9-06) Réponse sur les mesures : résumé, observation demandée ou « je n'observe pas », rappel ; chaque nombre vient du moteur ; pas assez de mesures.
- [x] (L9-06) Urgence : numéro, proche et médecin du profil ; sans numéro, aucun chiffre inventé.
- [x] (L9-06) Ordre de décision : urgence puis refus avant tout calcul ; mesures ; fiche ; hors sujet / pas de réponse sûre ; en production sans brouillons, aucune fiche citée.
- [x] (L9-06) Routes des fiches : liste, fiche, 404, 400, 403, 401 ; brouillons selon l'environnement ; `ASSISTANT_DRAFT_SHEETS` validé (`test/env.test.ts`).
