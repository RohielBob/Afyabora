# @glyka/analytics

**Moteur d'analyse déterministe** : statistiques, score de qualité, détection d'anomalies, observations traçables. **TypeScript pur** : aucune dépendance réseau ni base de données, donc il tourne **côté API, dans le portail et sur le téléphone (hors-ligne)**.

> Principe (ADR-0005) : **tous les chiffres viennent d'ici**. Le modèle de langage ne fait que reformuler les faits produits par ce package. Chaque observation porte la liste des mesures qui la justifient (`evidenceIds`).

## Contenu

| Fichier               | Rôle                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `src/stats.ts`        | moyenne, écart-type, médiane, temps dans la cible / au-dessus / en dessous          |
| `src/quality.ts`      | score de qualité 0–100 (couverture, densité, fraîcheur)                             |
| `src/anomalies.ts`    | score z modifié (MAD), séries hautes, hypoglycémies                                 |
| `src/slots.ts`        | créneaux matin / midi / soir / nuit, à l'heure locale du patient                    |
| `src/timezone.ts`     | fuseau du patient : décalage fixe, nom IANA (heure d'été comprise) ou fonction      |
| `src/insights.ts`     | `analyze()` : orchestre le tout, applique la règle « < 10 mesures = pas d'analyse » |
| `src/templates.fr.ts` | phrases en français (jamais de diagnostic, de dose ni de cause affirmée)            |

## Règles

- Aucune phrase dans `insights.ts`, seulement des faits chiffrés.
- `analyze()` trie les mesures par date : le même historique donne toujours le même résultat, quel que
  soit l'ordre d'arrivée des mesures. La période précédente n'est comparée qu'à partir de 10 mesures.
- Toute nouvelle règle = un test dans `test/`.
- Les seuils viennent de `@glyka/shared` (valeurs par défaut à faire valider par un clinicien).

## Fuseau horaire du patient (L3-02)

Les **créneaux** (matin 5 h–11 h, midi 11 h–16 h, soir 16 h–22 h, nuit 22 h–5 h) et les **jours** (couverture,
jours sans mesure) se comptent à l'heure **locale du patient**, pas en UTC. `analyze()`, `computeQuality()`,
`groupBySlot()`, `slotOf()` et `findAnomaliesBySlot()` acceptent un `PatientTimeZone` :

| Forme                  | Exemple                                     | Usage                                    |
| ---------------------- | ------------------------------------------- | ---------------------------------------- |
| décalage fixe (min.)   | `60` (Kinshasa, UTC+1) — **par défaut**     | profil patient (`timezoneOffsetMinutes`) |
| nom IANA               | `'Europe/Paris'`, `'America/New_York'`      | heure d'été appliquée à chaque mesure    |
| fonction instant → min | `(at) => -new Date(at).getTimezoneOffset()` | téléphone (`deviceTimeZone` du mobile)   |

- Le décalage est lu **pour chaque mesure** : une période qui traverse un changement d'heure compte encore
  les bons jours et les bons créneaux (une semaine de minuit à minuit qui dure 7 jours + 1 heure = 7 jours).
- Fuseau inconnu (`'Mars/Olympus'`) ou décalage impossible (hors UTC−12…UTC+14, non entier) ⇒
  `InvalidTimeZoneError`, levée **avant** tout calcul : jamais une analyse silencieusement fausse.
- Un décalage fixe ne suit pas l'heure d'été : il convient à Kinshasa (pas d'heure d'été), pas à Paris.
- Coût : environ 0,16 s pour 5 000 mesures avec un nom IANA (moins de 0,01 s avec un décalage ou une fonction).
- `lastDaysPeriod(days, now, timeZone)` (L3-03) : les N derniers jours **entiers** du patient, de minuit à minuit,
  aujourd'hui compris (période de l'API et du téléphone). `localMidnight` donne le vrai premier instant du jour,
  même là où l'heure change à minuit (Le Caire, La Havane, Santiago : le jour commence alors à 1 h). Vérifié
  sur les 418 fuseaux, chaque jour de 2026 (152 570 journées).

## Jeu de données de référence (L3-01)

`test/reference/` : une semaine type dont **tous** les résultats (pourcentages, moyenne, écart-type,
qualité, observations, phrases) ont été calculés à la main puis recalculés indépendamment en Python
(`oracle.py`). Chaque règle y est testée à sa limite. Détail et calculs : `test/reference/README.md`.

```powershell
pnpm --filter @glyka/analytics test
python packages/analytics/test/reference/oracle.py
```

## À faire (voir backlog L3)

`L3-05` interface `LlmProvider` (côté API) · `L3-07` jeu de questions-pièges pour les garde-fous.

**Lot : L3 (Analyse).**
