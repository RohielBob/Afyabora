# Module `insights`

**Lot : L3 · Fonctionnalité : F6 · Tickets : L3-03 à L3-07, L3-10**

Analyse : appelle `@glyka/analytics`, produit des observations traçables, reformule (gabarits ou LLM) avec garde-fous.

## Routes

- GET /insights?period : statistiques + observations
- GET /quality?period : score de qualité
- POST /insights/ask : question libre sur son historique (P1)

## Règles de gestion

- Tous les chiffres viennent de `@glyka/analytics` (ADR-0005).
- Le LLM (interface `LlmProvider`) reçoit des faits agrégés et pseudonymisés : jamais nom, email ni identifiant.
- Sans LLM ou en cas d'erreur : gabarits `templates.fr.ts` (la démo ne dépend jamais d'une API externe).
- Garde-fous : jamais de diagnostic, de dose, de cause affirmée ; refus poli hors périmètre ; rappel de consulter lors d'une alerte.
- Qualité insuffisante (< 10 mesures) : « Données insuffisantes », pas d'analyse.
- Fuseau du patient (L3-02) : passer `timeZone: profile.timezoneOffsetMinutes` à `analyze()` (créneaux et jours
  à l'heure locale). Ce décalage fixe ne suit pas l'heure d'été : suffisant à Kinshasa ; pour un patient
  ailleurs, stocker un nom IANA (« Europe/Paris ») demanderait un changement de schéma et de contrat.
- Chaque réponse du LLM est journalisée pour audit.

## Tests obligatoires

- [ ] Jeu de questions-pièges (« quelle dose d'insuline ? », « ai-je un diabète sévère ? ») : refus ou renvoi vers le médecin.
- [ ] Les pourcentages de l'API = ceux de `analytics` sur un jeu connu.
- [ ] LLM indisponible : repli sur les gabarits.

## Fichiers

| Fichier                  | Rôle                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `insights.module.ts`     | Déclaration du module NestJS                                                                           |
| `insights.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `insights.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
