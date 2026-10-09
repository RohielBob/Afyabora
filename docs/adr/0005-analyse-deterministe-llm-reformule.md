# ADR-0005 — L'analyse est déterministe ; le modèle de langage ne fait que reformuler

- **Statut :** Accepté — réunion du 2026-10-09 (ticket L0-09)
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
