# Scénario de démonstration (≈ 7 minutes)

**Préparation :** `pnpm db:seed` (Jean, Marie, Paul fictifs + Dr Demo approuvé), APK installé, portail ouvert, `scripts/sample-data/import-demo-147.csv` sur le téléphone, **plan B** : vidéo de secours (L7-09) et version locale (Docker).

| # | Étape | Ce qu'on montre | Durée |
|---|---|---|---|
| 1 | **Inscription** | Création d'un compte, consentement, profil en 3 étapes | 30 s |
| 2 | **Import** | `import-demo-147.csv` : **139 valides, 5 doublons, 3 incohérentes** ; correction de la ligne 42 (18,7 g/L → « vérifier l'unité ») ; import | 1 min |
| 3 | **Tableau de bord** (compte de Jean) | Graphique, temps dans la cible, **score de qualité 96 %** | 30 s |
| 4 | **Hors-ligne** | **Mode avion** : saisie de 2 mesures → « 2 mesures en attente » ; retour du réseau → synchronisation automatique | 1 min |
| 5 | **Notifications** | Rappel de mesure programmé ; alerte de seuil (texte sans valeur de santé sur l'écran verrouillé) | 30 s |
| 6 | **Analyse** | Tendance du soir détectée ; « Voir les mesures concernées » ; question piège (dose d'insuline) refusée poliment | 1 min |
| 7 | **Partage** | Catégories cochées, durée 5 min, QR qui tourne ; le médecin scanne depuis le portail ; dossier visible ; le patient voit « Dr Demo consulte » | 1 min 30 |
| 8 | **Révocation** | Le patient coupe l'accès ; le portail affiche « Accès expiré » ; **journal d'accès** | 30 s |
| 9 | **Rapport PDF** | « Préparer ma consultation » | 20 s |
| 10 | **Carte d'urgence** | QR urgence, champs choisis, aucun historique (si prête) | 30 s |
| 11 | **Roadmap** | Capteurs, version commerciale, vérification des médecins | 30 s |

## Comptes de démonstration
`jean@demo.glyka.local` (qualité 96 %, Bonne) · `marie@demo.glyka.local` (60 %, Partielle) · `paul@demo.glyka.local` (34 %, Insuffisante, données anciennes) · médecin `dr.demo@glyka.local`. Mot de passe : `DEMO_PASSWORD` de `apps/api/.env`.

## Points de vigilance
- Tester **chaque étape sur le matériel de la présentation** la veille.
- Avoir un téléphone chargé, un second en secours, et le hotspot de quelqu'un.
- Ne jamais montrer de vraie donnée de santé.
