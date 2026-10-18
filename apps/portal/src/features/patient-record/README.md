# Feature `patient-record` — Dossier patient

**Lot L5**

Onglets du dossier, graphiques, chronologie, résumé IA.

## Tickets

- **L5-12** — Portail : dossier patient (glycémie, chronologie, traitements, nutrition, activité, résumé IA)

## Fait (L5-12)

- Page `routes/patient-record.tsx` (`/patients/:sessionId`), en **lecture seule** :
  - en-tête (`RecordHeader.tsx`) : prénom, type de diabète, année du diagnostic, état de l'accès et heure de
    fin **du serveur**, ce qui est partagé, rappel « outil d'aide, pas un avis médical » ;
  - **onglets** (`RecordTabs.tsx`, clavier : flèches, Début, Fin) : **seulement ceux des catégories
    partagées** (`tabsFor`, `view.ts`) ; l'onglet est gardé dans l'adresse (`?onglet=glycemie`) ;
  - **Vue d'ensemble** (`tabs/OverviewTab.tsx`) : qualité (score, couverture, régularité, fraîcheur), chiffres
    des 30 jours (moyenne, écart-type, CV, répartition plage / au-dessus / en dessous), seuils du patient ;
  - **Glycémie** (`tabs/GlucoseTab.tsx` + `GlucoseChart.tsx`, recharts déjà installé, **chargé seulement
    à l'ouverture de l'onglet**) : graphique avec la plage cible du patient, chaque point a la **forme** de
    son état (▼ ● ▲) ; tableau de toutes les mesures (valeur, état en symbole + mot, moment, provenance
    `ProvenanceBadge`, note si partagée) ;
  - **Chronologie**, **Traitements**, **Nutrition**, **Activité** (`tabs/TimelineTab.tsx`, une seule lecture
    pour les quatre) : par jour, heure, type (icône + mot), texte ; traitements « déclarés par le patient,
    aucune dose calculée ni conseillée » ;
  - **Résumé des analyses** (`tabs/SummaryTab.tsx`) : observations du moteur (gravité en icône + mot, jamais
    rouge), nombre de mesures justificatives, rappel « pas un diagnostic ».
- Période 7 / 14 / 30 / 90 jours ; unité du patient par défaut, modifiable (g/L, mg/dL, mmol/L).
- États glycémiques : `GlucoseStateBadge` (`components/ui`), palette dédiée de `@glyka/ui-tokens` branchée
  sur le thème (`--afy-state-*`, clair et sombre), **jamais rouge**, toujours symbole + libellé.
- **Fin d'accès** (L5-13) : bandeau « Accès valable : 04:37 » à l'heure du serveur ; à zéro, ou dès qu'une
  réponse dit expiré, arrêté, compte non approuvé ou « pas votre dossier », tout le dossier est **effacé de la
  mémoire** et l'écran « Accès expiré » le remplace (voir la feature `sessions`). Le résumé est relu toutes
  les 30 s (arrêt par le patient). Données jamais gardées après avoir quitté la page (`gcTime: 0`).
- Textes : `fr.record` (`src/i18n/fr.ts`). Tests : `__tests__/view.test.tsx`.

## À venir

- L6-04 : onglet « Rapport PDF » (si `REPORT_DOWNLOAD` est partagé).
- À décider (contrat) : le texte libre et la durée des évènements (dose déclarée d'un traitement, durée d'une
  activité) et le lot d'import ne sont pas dans `TimelineItem`.

## Composant déjà prêt

- `components/ui/ProvenanceBadge.tsx` (L4-09) : badge de provenance de chaque mesure (« Saisie », « Import ·
  lot 3F2A1C », « Appareil »), même règle que l'application du patient (`provenanceOf`, `@glyka/shared`),
  icône + texte, clair et sombre. À afficher dans la chronologie et le tableau des mesures.
- Le contrat donne `source` et `importBatchId` pour `GET /doctor/sessions/{id}/measurements` ; les éléments
  de `GET /doctor/sessions/{id}/timeline` (`TimelineItem`) n'ont que `source` (pas encore le lot).

## Règle importante

Lecture seule. Un onglet dont la catégorie n'est pas autorisée n'est pas affiché. Aucune donnée en cache après expiration.
