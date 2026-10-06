# Contribuer à Glyka

## 1. Démarrer

Voir le `README.md` (installation en 5 commandes).

## 2. Flux de travail

1. Prendre une issue du backlog (colonne _Ready_ du tableau GitHub Projects) et se l'assigner.
2. Créer une branche depuis `develop` : `feat/<lot>-<sujet>` (ex. `feat/l2-dashboard-chart`), `fix/<sujet>`, `docs/<sujet>`.
3. Commits au format _conventional commits_ : `feat(mobile): saisie d'une mesure`.
   Scopes : `api`, `mobile`, `portal`, `shared`, `analytics`, `ui-tokens`, `docs`, `infra`, `scripts`, `ci`.
4. Ouvrir une **pull request vers `develop`** avec le modèle fourni. Une personne relit, la CI doit être verte.
5. Fusion en _squash_. `main` ne reçoit que des fusions de `develop` décidées par le lead technique.

## 3. Règles de qualité

- Typage strict, pas de `any` sans commentaire justificatif.
- Toute entrée externe est validée avec un schéma **Zod** de `packages/shared`.
- Les modules critiques ont des tests (voir `docs/security/checklist.md` et le README de chaque module).
- Un changement de **contrat d'API** (routes, schémas partagés) se signale à l'équipe avant la fusion.
- Une décision structurante s'écrit dans `docs/adr/` (copier `0000-template.md`).
- **Vous devez pouvoir expliquer chaque ligne que vous poussez.** Le code généré par un outil se relit, se comprend, se teste.

## 4. Définition de « terminé »

Critères d'acceptation cochés · tests écrits et verts · lint + types verts · README du module à jour · relu par une personne · fonctionne sur le scénario de démo.
