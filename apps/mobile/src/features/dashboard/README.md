# Feature `dashboard` — Tableau de bord

**Lot L2 · Fonctionnalité F3**

Dernière mesure, graphique, statistiques, qualité des données, comparaison de période.

## Tickets

- **L2-05** — Mobile : tableau de bord — dernière mesure et badge d'état (forme + libellé + couleur) — **fait**
- **L2-06** — Mobile : graphique d'évolution 7/14/30/90 jours avec bande cible
- **L2-07** — Mobile : statistiques et comparaison avec la période précédente
- **L2-08** — Mobile : score de qualité des données et phrase d'explication
- **L8-11** — Tableau de bord et analyse calculés depuis la base locale (moteur sur le téléphone)

## Dernière mesure (L2-05)

Onglet **Accueil** (`app/(tabs)/index.tsx`), de haut en bas :

1. Date du jour et salutation (« Bonjour » / « Bonsoir » à partir de 18 h).
2. **Carte « Dernière mesure »** : valeur en grand dans l'unité préférée, **badge d'état** (couleur +
   symbole + libellé) calculé avec **les seuils du patient** (gardés sur le téléphone, L2-04), contexte,
   jour et heure (« Aujourd'hui, 08:30 », « Hier, 22:10 », sinon la date), et ancienneté (« Il y a 2 h »).
   Une bande à gauche reprend la couleur de l'état (repère, jamais le seul). Bouton « Nouvelle mesure ».
3. **Aucune mesure** : carte d'invitation « Noter ma première mesure ».
4. **Indicateur de synchronisation** : « Tout est à jour » ou « 3 mesures en attente de synchronisation ».
5. Avertissement « outil d'aide, pas un avis médical » (version courte).

Tout est lu sur le téléphone (base locale), **sans réseau**, et relu à chaque retour sur l'onglet (ex. après
une saisie). Pendant la lecture : squelette de la carte ; base illisible : message + « Réessayer ».

| Fichier                            | Rôle                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `latest.ts`                        | Logique : jour (calendrier), ancienneté, salutation         |
| `useDashboard.ts`                  | Lecture locale : dernière mesure, en attente, seuils, unité |
| `components/LatestReading.tsx`     | Carte « Dernière mesure »                                   |
| `components/EmptyLatest.tsx`       | Aucune mesure encore                                        |
| `components/SyncStatus.tsx`        | « Tout est à jour » / « N en attente »                      |
| `components/DashboardSkeleton.tsx` | Squelette pendant la lecture                                |
| `__tests__/latest.test.ts`         | Tests de la logique                                         |

## Tests obligatoires (L2-05)

- [x] Jour : aujourd'hui / hier / avant, en jours du **calendrier** (23 h 50 la veille = « hier »).
- [x] Ancienneté : à l'instant (et horloge un peu en avance), minutes, heures, jours.
- [x] Salutation : bonjour avant 18 h, bonsoir à partir de 18 h et la nuit.

## Fichiers prévus (suite)

- `GlucoseChart.tsx` (react-native-svg)
- `StatsCards.tsx`
- `QualityCard.tsx`
- `useLocalAnalysis.ts` : lit SQLite → GlucosePoint[] → @glyka/analytics

## Règle importante

Tout est calculé depuis la base LOCALE : le tableau de bord fonctionne hors-ligne.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
