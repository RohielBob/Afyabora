# Historique du contrat d'API

Format : une section par version. Une **rupture** est signalée en tête de section.

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
