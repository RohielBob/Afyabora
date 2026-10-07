# Design (lot L7)

## Livrables

- **Figma** : maquettes patient (L7-01) et portail médecin (L7-02). Lien à ajouter ici : _à compléter_.
- **Tokens** : `packages/ui-tokens` (L7-03). Les maquettes et le code utilisent les mêmes valeurs.
- **Identité** : logo, icône, écran de lancement (L7-04). Nom : **Glyka** — slogan « Suivez. Contrôlez. Comprenez. ».

## Principes

1. **Sobre et rassurant** : pas d'alarmisme, pas de rouge criard hors urgence réelle.
2. **L'état n'est jamais la couleur seule** : couleur + symbole (▼ ● ▲) + libellé.
3. **Lisible** : contraste AA, tailles de police adaptables, cibles tactiles ≥ 48 px.
4. **Une action principale par écran.** La saisie d'une mesure doit prendre moins de 10 s.
5. Les écrans hors-ligne montrent **clairement** l'état de synchronisation (« 3 mesures en attente »).
6. Mode clair et sombre.

## Liste des écrans (alignée sur `apps/mobile/app/`)

Authentification (5) · profil (1) · onglets Accueil / Chronologie / Analyse / Partager / Profil (5) · saisie (3) · import (3) · partage (3) · analyse (1) · rapport (1) · urgence (2) · paramètres (5).
Portail : connexion, inscription, compte en attente, scanner, patients partagés, dossier patient (8 onglets), accès expiré.
