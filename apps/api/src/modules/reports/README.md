# Module `reports`

**Lot : L6 · Fonctionnalité : F9 · Tickets : L6-01 (fait), L6-02**

Rapport PDF « Préparer ma consultation ».

## Routes

- GET /reports/consultation?period=14|30|90 : PDF (patient) ; version médecin via /doctor/sessions/:id/report

## Règles de gestion

- Chiffres identiques au tableau de bord (même moteur `analytics`).
- Contient : identité, période, qualité des données, % dans la cible/au-dessus/en dessous, épisodes, événements inhabituels, jours incomplets, points à examiner, graphique, avertissement « outil d'aide », date et auteur de génération.
- Génération < 10 s pour 90 jours.
- Le téléchargement par un médecin est journalisé.

## Fait (L6-01) : le modèle du PDF

| Fichier              | Rôle                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `report-data.ts`     | Les DONNÉES (fonction pure) : `analyzeLastDays` (comme l'écran « Analyse »), épisodes, valeurs inhabituelles, jours sans mesure |
| `report-view.ts`     | TOUS les TEXTES du rapport (chaque chiffre imprimé passe par ici)                                                               |
| `report-document.ts` | La MISE EN PAGE avec `@react-pdf/renderer` ; `renderReportPdf(view)` donne le PDF                                               |
| `report-palette.ts`  | Couleurs du système de design (thème clair), vérifiées contre `@glyka/ui-tokens`                                                |

- **Contenu** (CDC F9) : identité (prénom et nom, type, année du diagnostic ; ni date de naissance ni
  coordonnées, décision d'équipe), période, qualité des données, répartition dans / au-dessus / en dessous de
  la cible et comparaison avec la période précédente, chiffres clés, graphique (plage cible, seuils, jours sans
  mesure), points à examiner, épisodes en dessous et au-dessus de la cible, valeurs inhabituelles, jours sans
  mesure, avertissement « outil d'aide », date, heure et demandeur du rapport.
- **Unité** : celle choisie par le patient, seuils compris (décision d'équipe). **Heures** : celles du patient.
- **Épisode** = une ou plusieurs mesures consécutives du même côté de la cible ; « très » s'il contient une
  mesure très basse / très haute (en gras ET le mot). **Valeurs inhabituelles** = les preuves de
  l'observation « valeurs inhabituelles » du moteur.
- **Page 1** : la synthèse. **Pages suivantes** : le détail. Tableaux et sections jamais coupés en bas de page.
- Lisible en noir et blanc (formes ▼ ● ▲ et mots) ; états glycémiques jamais rouges ; typographie française
  (espaces insécables, pas de ligature qui ferait perdre une lettre au copier-coller).
- Polices : `apps/api/assets/fonts` (Plus Jakarta Sans, licence OFL, mêmes fichiers que le portail).
- Tests : `test/report-data.test.ts`, `test/report-pdf.test.ts` (données fictives :
  `test/support/report-fixture.ts`). Pour regarder les PDF produits : définir `REPORT_SAMPLE_DIR` (un
  dossier) avant de lancer ces tests.

## Tests obligatoires

- [x] Chiffres du PDF = chiffres de `analyze()` (L6-01 : identiques à `analyzeLastDays`, 14, 30 et 90 jours,
      seuils et fuseau du patient).
- [x] Génération en moins de 10 s sur 90 jours (≈ 270 mesures) (L6-01 : moins d'1 s).

## Fichiers

| Fichier                 | Rôle                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `reports.module.ts`     | Déclaration du module NestJS                                                                           |
| `reports.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `reports.service.ts`    | Logique métier et accès base (Prisma)                                                                  |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
