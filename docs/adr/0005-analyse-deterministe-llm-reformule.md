# ADR-0005 — L'analyse est déterministe ; le modèle de langage ne fait que reformuler

- **Statut :** Accepté — réunion du 2026-10-09 (ticket L0-09) ; complétée le 2026-10-11 (assistant de conversation, L9-01)
- **Date :** 2026-10-04

## Contexte

Une IA qui calcule ou diagnostique est risquée (erreurs, hallucinations) et difficile à défendre en démonstration. Le guide impose que l'IA reste une aide et ne remplace pas le médecin.

## Décision

- Tous les chiffres et toutes les observations sont produits par `@glyka/analytics` (TypeScript pur, testé), avec la liste des **mesures qui les justifient**.
- Le modèle de langage (interface `LlmProvider`) reçoit des **faits agrégés pseudonymisés** et ne fait que les **mettre en mots**.
- Sans modèle (ou en cas d'erreur) : **gabarits de texte** français : la démo ne dépend jamais d'une API externe, et l'analyse fonctionne hors-ligne.
- **Garde-fous :** jamais de diagnostic, de dose, de cause affirmée ; refus poli hors périmètre ; rappel de consulter lors d'une alerte ; jeu de questions-pièges rejoué à chaque changement de prompt.
- Estimation d'HbA1c volontairement **exclue** du MVP.

## Conséquences

- Chaque affirmation de l'app est vérifiable et testable.
- Le texte est plus sobre que celui d'un chatbot libre : c'est voulu.
- Un seul endroit à auditer pour la sécurité médicale du produit.

## Précision ajoutée à l'acceptation (réunion du 2026-10-09)

- MVP : `LLM_PROVIDER=none` par défaut, donc **gabarits seulement**. Un fournisseur ne pourra être branché qu'en option, derrière l'interface `LlmProvider`, et la démo n'en dépendra jamais.

## Complément du 2026-10-11 : assistant de conversation « Afyabora » (lot L9)

Décision du lead technique (2026-10-11), après L3-10 et L3-09. Elle **étend** l'ADR sans la contredire.

### Contexte

Le patient veut pouvoir discuter avec l'application : poser des questions sur **ses mesures** et des questions
**générales sur le diabète**, sur plusieurs messages. Le cahier des charges ne prévoyait qu'une question libre
sur l'historique (IA-4, ticket L3-08, P1). Un modèle de langage qui répond librement à des questions de santé
invente des faits et peut donner un conseil dangereux : il faut donc des sources fermées et vérifiables.

### Décision

- Un **assistant de conversation** nommé « Afyabora » (ADR-0007) **remplace L3-08**. La route
  `POST /insights/ask` est dépréciée dans le contrat 0.4.0 et ne sera pas codée.
- **Deux seules sources de réponse :**
  1. **les mesures du patient** : chiffres et observations calculés par `@glyka/analytics`, comme l'écran
     Analyse ; le modèle ne fait que les mettre en mots ;
  2. **une dizaine de fiches de connaissances** courtes (hypoglycémie, hyperglycémie, HbA1c, lire ses
     glycémies, alimentation, activité physique, sommeil, stress, préparer une consultation, quand demander de
     l'aide), rédigées à partir de recommandations publiques, **citées** dans chaque réponse.
- **Relecture médicale :** une fiche est `DRAFT` tant qu'**un médecin** ne l'a pas relue, puis `VALIDATED`
  (date et nom du relecteur). **En production, seules les fiches validées sont utilisées.** En développement et
  en démonstration, les brouillons sont acceptés avec la mention visible « Fiche non encore relue ».
- **Quatre couches de protection :**
  1. avant le modèle, le filtre de L3-07 (`screenQuestion`), étendu aux pièges propres à la conversation
     (« ignore tes consignes », jeu de rôle, piège découpé en plusieurs messages) : dose, diagnostic,
     traitement, prédiction ⇒ **refus poli** et renvoi au professionnel de santé ;
  2. un **tri par le code** (pas par le modèle) : question sur les mesures, question générale, ou rien ;
  3. le modèle ne reçoit **que** les faits calculés ou les extraits de fiches, et doit citer sa fiche ;
  4. après le modèle, la réponse est **vérifiée** (chiffres présents dans les sources, mots interdits, fiches
     citées existantes, longueur, langue) ; au moindre échec, **réponse gabarit** déterministe.
- **Urgence :** message d'urgence immédiat, **sans passer par le modèle**, avec le **numéro d'urgence saisi
  par le patient** dans son profil (`emergencyNumber`, selon son pays), **son médecin** et **son proche**.
  Afyabora ne devine jamais un numéro d'urgence.
- **Hors sujet ou aucune fiche pertinente :** « je ne peux pas répondre à ça » et liste des fiches ; **jamais
  d'invention**.
- **Sans modèle** (`LLM_PROVIDER=none`, le défaut du MVP), l'assistant fonctionne avec ses gabarits : la démo
  ne dépend toujours pas du modèle.
- **Lenteur du modèle local** (40 à 90 s sans carte graphique) : la question reçoit tout de suite une réponse
  « en préparation » ; une seule question est traitée à la fois ; au-delà de 2 minutes, réponse gabarit ;
  20 questions par heure au plus par patient.
- **Données :** messages **chiffrés** (AES-256-GCM), aucun titre en clair, rien dans les journaux applicatifs ;
  conversations **gardées jusqu'à ce que le patient les efface lui-même** (effacement réel, une ou toutes) ;
  **le médecin n'y a jamais accès** (ni QR, ni portail). Les appels au modèle restent journalisés comme en
  L3-10 (chiffrés, sans identifiant du patient, 90 jours).

### Conséquences

- Nouveau lot **L9** dans le backlog (L9-01 à L9-11) ; contrat d'API **0.4.0** (8 routes, 2 champs de profil).
- Les fiches sont du **contenu médical** : leur texte n'engage le produit qu'une fois relu par un médecin.
- Le jeu de questions-pièges de L3-07 est étendu aux conversations, et rejoué à chaque changement de prompt.
- La réponse reste plus sobre qu'un chatbot libre : c'est voulu.
