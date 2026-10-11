# @glyka/analytics

**Moteur d'analyse déterministe** : statistiques, score de qualité, détection d'anomalies, observations traçables. **TypeScript pur** : aucune dépendance réseau ni base de données, donc il tourne **côté API, dans le portail et sur le téléphone (hors-ligne)**.

> Principe (ADR-0005) : **tous les chiffres viennent d'ici**. Le modèle de langage ne fait que reformuler les faits produits par ce package. Chaque observation porte la liste des mesures qui la justifient (`evidenceIds`).

## Contenu

| Fichier               | Rôle                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `src/stats.ts`        | moyenne, écart-type, médiane, temps dans la cible / au-dessus / en dessous          |
| `src/quality.ts`      | score de qualité 0–100 (couverture, densité, fraîcheur)                             |
| `src/anomalies.ts`    | score z modifié (MAD), séries hautes, hypoglycémies                                 |
| `src/slots.ts`        | créneaux matin / midi / soir / nuit (UTC+1)                                         |
| `src/insights.ts`     | `analyze()` : orchestre le tout, applique la règle « < 10 mesures = pas d'analyse » |
| `src/templates.fr.ts` | phrases en français (jamais de diagnostic, de dose ni de cause affirmée)            |

## Règles

- Aucune phrase dans `insights.ts`, seulement des faits chiffrés.
- `analyze()` trie les mesures par date : le même historique donne toujours le même résultat, quel que
  soit l'ordre d'arrivée des mesures. La période précédente n'est comparée qu'à partir de 10 mesures.
- Toute nouvelle règle = un test dans `test/`.
- Les seuils viennent de `@glyka/shared` (valeurs par défaut à faire valider par un clinicien).

## Jeu de données de référence (L3-01)

`test/reference/` : une semaine type dont **tous** les résultats (pourcentages, moyenne, écart-type,
qualité, observations, phrases) ont été calculés à la main puis recalculés indépendamment en Python
(`oracle.py`). Chaque règle y est testée à sa limite. Détail et calculs : `test/reference/README.md`.

```powershell
pnpm --filter @glyka/analytics test
python packages/analytics/test/reference/oracle.py
```

## À faire (voir backlog L3)

`L3-02` fuseau du patient · `L3-05` interface `LlmProvider` (côté API) · `L3-07` jeu de questions-pièges pour les garde-fous.

**Lot : L3 (Analyse).**
