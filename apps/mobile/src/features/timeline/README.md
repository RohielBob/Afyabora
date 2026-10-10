# Feature `timeline` — Chronologie médicale

**Lot L2 · Fonctionnalité F4**

Liste groupée par jour, filtres, badges de provenance.

## Tickets

- **L2-09** — Mobile : chronologie (groupée par jour, filtres, badges de provenance) — **fait**
- **L4-09** — Badge de provenance (saisie, import, appareil) sur mesure, chronologie et portail

## Chronologie (L2-09)

Onglet **Historique** (`app/(tabs)/timeline.tsx`) :

- **Mesures et événements** (repas, activité, traitement déclaré) réunis, **groupés par jour du
  calendrier** (« Aujourd'hui », « Hier », « Mercredi 7 octobre »), **du plus récent au plus ancien** (CA),
  dans chaque jour aussi. À instant égal, la mesure passe avant l'événement (ordre stable).
- **Filtres** : tout, glycémie, repas, activité, traitements, alertes (pastilles icône + libellé, fixes en
  haut : la pastille choisie reste visible). « Repas » n'affiche que des repas (CA).
- **Alertes** : en attendant les alertes du moteur (F6, lot L3), les mesures très basses ou très hautes
  selon les seuils du patient.
- **Chaque ligne** : heure, icône du type + texte (jamais la couleur seule). Mesure : valeur dans l'unité du
  patient, badge d'état, contexte, note, **badge de provenance** (« Saisie », « Import · lot 3F2A1C »,
  « Appareil » — CA : un élément importé affiche son lot), « Pas encore envoyée ». Événement : libellé,
  type (+ durée), détails ; traitement : « Déclaré par vous » (jamais de dose).
- Lu **sur le téléphone** (sans réseau), relu à chaque retour sur l'onglet, par **fenêtres de 30 jours**
  (« Voir les 30 jours précédents », puis « Rien de plus ancien sur ce téléphone »).
- États : squelette pendant la lecture, historique vide (avec « Noter une mesure »), rien pour ce filtre
  (avec « Tout »), base illisible (« Réessayer »).
- Animations : les premières lignes entrent l'une après l'autre ; changer de filtre fait réapparaître la
  liste en douceur ; « réduire les animations » respecté.

| Fichier                          | Rôle                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| `timeline.ts`                    | Logique : conversion, filtres, groupement par jour, fenêtres, lot court |
| `useTimeline.ts`                 | Lecture locale (mesures + événements + seuils), « voir plus »           |
| `components/FilterChips.tsx`     | Pastilles de filtre                                                     |
| `components/TimelineRow.tsx`     | Une ligne (mesure ou événement)                                         |
| `components/ProvenanceBadge.tsx` | Badge saisie / import + lot / appareil                                  |
| `__tests__/timeline.test.ts`     | Tests de la logique                                                     |

## Tests obligatoires (L2-09)

- [x] Conversion des lignes locales (provenance, lot d'import, en attente d'envoi ; type, durée).
- [x] Filtres : tout, glycémie, repas, activité, traitements ; alertes selon les seuils du patient.
- [x] Groupement : du plus récent au plus ancien, jours du calendrier local, ordre stable à instant égal.
- [x] Fenêtres de 30 jours (aujourd'hui compris) ; lot d'import court.

## Règle importante

Icône + texte sur chaque ligne (pas la couleur seule).

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
